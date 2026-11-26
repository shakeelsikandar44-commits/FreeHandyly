"""Review and star-rating section for the tool pages.

Visitors send a review through the form; it is e-mailed to the site owner and is NOT shown on the page.
Approved reviews are added by hand to data/reviews.json and then appear (server-rendered, so search engines see
them) under the matching tool. Star-rating structured data is only added when a tool has at least MIN_FOR_SCHEMA
approved reviews, and it always describes the reviews that are visible on the page.
"""
import html
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
REVIEWS_FILE = BASE / "data" / "reviews.json"
MIN_FOR_SCHEMA = 3
esc = html.escape
_LD_RE = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def load_reviews():
    """{slug: [ {name, rating, text, date}, ... ]}; a missing or broken file means no reviews."""
    try:
        data = json.loads(REVIEWS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out = {}
    for slug, items in (data.items() if isinstance(data, dict) else []):
        good = []
        for r in items if isinstance(items, list) else []:
            try:
                rating = int(r["rating"])
                if 1 <= rating <= 5 and str(r["name"]).strip() and str(r["text"]).strip():
                    good.append({"name": str(r["name"]).strip()[:80], "rating": rating,
                                 "text": str(r["text"]).strip()[:1500], "date": str(r.get("date", ""))[:10]})
            except (KeyError, TypeError, ValueError):
                continue
        if good:
            out[slug] = good
    return out


def _stars(n):
    return "".join('<span class="rv-star%s" aria-hidden="true">&#9733;</span>' % (" on" if i < n else "") for i in range(5))


def section_html(slug, tool_name, items):
    if items:
        avg = sum(r["rating"] for r in items) / len(items)
        summary = ('<p class="rv-summary"><span class="rv-avg" aria-label="%.1f out of 5 stars">%s</span> '
                   '<strong>%.1f</strong> out of 5 from %d review%s</p>'
                   % (avg, _stars(round(avg)), avg, len(items), "" if len(items) == 1 else "s"))
        cards = "".join(
            '<li class="rv-item"><div class="rv-head"><span class="rv-stars" role="img" aria-label="%d out of 5 stars">%s</span>'
            '<strong>%s</strong>%s</div><p>%s</p></li>'
            % (r["rating"], _stars(r["rating"]), esc(r["name"]),
               (' <span class="rv-date">%s</span>' % esc(r["date"])) if r["date"] else "", esc(r["text"]))
            for r in items)
        listing = '<ul class="rv-list">%s</ul>' % cards
    else:
        summary = '<p class="rv-summary">Be the first to rate the %s.</p>' % esc(tool_name)
        listing = ""
    radios = "".join(
        '<input type="radio" id="rv-s%d" name="rating" value="%d" required><label for="rv-s%d" title="%d star%s">'
        '<span class="visually-hidden">%d star%s</span><svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">'
        '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" stroke-width="1.5" stroke-linejoin="round"/></svg></label>'
        % (i, i, i, i, "" if i == 1 else "s", i, "" if i == 1 else "s") for i in (5, 4, 3, 2, 1))
    return (
        '<section class="reviews" id="reviews" aria-labelledby="reviews-h">'
        '<h2 id="reviews-h">Rate this tool</h2>%s%s'
        '<form class="rv-form" method="post" action="/review" novalidate>'
        '<input type="hidden" name="slug" value="%s">'
        '<div class="rv-hp" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>'
        '<fieldset class="rv-rating"><legend>Your rating</legend><div class="rv-stars-in">%s</div></fieldset>'
        '<label for="rv-name">Name (shown with your review)</label>'
        '<input id="rv-name" class="form-control" type="text" name="name" maxlength="80" autocomplete="given-name">'
        '<label for="rv-text">Your review</label>'
        '<textarea id="rv-text" class="form-control" name="text" rows="3" maxlength="1500" placeholder="What did you use it for, and how did it work?"></textarea>'
        '<p class="rv-msg" role="status" aria-live="polite"></p>'
        '<button type="submit" class="btn btn-ink">Submit review</button>'
        '<p class="rv-note">Reviews are checked before they appear. We never ask for or show your email.</p>'
        '</form></section>' % (summary, listing, esc(slug), radios))


def _add_schema(body, items):
    """Adds aggregateRating to the WebApplication node, from the reviews shown on the page."""
    def fix(m):
        try:
            data = json.loads(m.group(2))
        except ValueError:
            return m.group(0)
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else []
        for n in nodes:
            if isinstance(n, dict) and n.get("@type") == "WebApplication":
                avg = sum(r["rating"] for r in items) / len(items)
                n["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": round(avg, 1),
                                        "ratingCount": len(items), "bestRating": 5, "worstRating": 1}
                return m.group(1) + json.dumps(data) + m.group(3)
        return m.group(0)
    return _LD_RE.sub(fix, body, count=1)


def inject(body, slug, tool_name, all_reviews):
    """Adds the review section (and the script) to a tool page body."""
    items = all_reviews.get(slug, [])
    sec = section_html(slug, tool_name, items)
    if "</article>" in body:
        body = body.replace("</article>", "</article>\n" + sec, 1)
    else:
        return body
    if "/static/js/reviews.js" not in body:
        body = body.replace("</body>", '<script src="/static/js/reviews.js" defer></script>\n</body>', 1)
    if len(items) >= MIN_FOR_SCHEMA:
        body = _add_schema(body, items)
    return body
