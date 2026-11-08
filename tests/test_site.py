import html
import json
import re
from pathlib import Path

import pytest

from app import HITS, TOOLS, app
from seo_routes import PAGES

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://freehandyly.com"


def get(client, path, **kw):
    return client.get(path, base_url=SITE, **kw)


@pytest.mark.parametrize("path", PAGES)
def test_page_ok_and_seo_basics(client, path):
    r = get(client, path)
    assert r.status_code == 200
    h = r.get_data(as_text=True)
    title = html.unescape(re.search(r"<title>(.*?)</title>", h, re.S).group(1))
    desc = html.unescape(re.search(r'name="description" content="([^"]*)"', h).group(1))
    assert 15 <= len(title) <= 70, title
    assert 70 <= len(desc) <= 160, desc
    assert len(re.findall(r"<h1[ >]", h)) == 1
    assert 'rel="canonical" href="%s%s"' % (SITE, path) in h
    assert "__SITE_URL__" not in h and "localhost" not in h
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        json.loads(block)
    assert "UseMe" not in re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)


def test_titles_and_descriptions_are_unique(client):
    seen_t, seen_d = set(), set()
    for p in PAGES:
        h = get(client, p).get_data(as_text=True)
        t = re.search(r"<title>(.*?)</title>", h, re.S).group(1)
        d = re.search(r'name="description" content="([^"]*)"', h).group(1)
        assert t not in seen_t and d not in seen_d, p
        seen_t.add(t), seen_d.add(d)


def test_tool_pages_have_faq_schema_matching_visible_faq(client):
    for t in TOOLS:
        h = get(client, "/tools/" + t["slug"]).get_data(as_text=True)
        art = h[h.find('<article class="seo-content"'):]
        art = art[:art.find("</article>")]
        visible = len(re.findall(r"<h3", art[art.find("Frequently Asked"):]))
        ld = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S)]
        faq = [n for o in ld for n in o["@graph"] if n["@type"] == "FAQPage"]
        assert faq and len(faq[0]["mainEntity"]) == visible, t["slug"]


def test_all_internal_links_and_assets_resolve(client):
    seen = set()
    for p in PAGES:
        h = get(client, p).get_data(as_text=True)
        for ref in re.findall(r'(?:href|src|srcset|data-worker|data-mp)="(/[^"#?]*)', h):
            seen.add(ref)
    assert len(seen) > 30
    for ref in sorted(seen):
        r = get(client, ref)
        assert r.status_code in (200, 301), (ref, r.status_code)


def test_static_dependencies_exist():
    for f in ["static/js/vendor/pdf.min.js", "static/js/vendor/pdf.worker.min.js", "static/js/vendor/pdf-lib.min.js",
              "static/js/vendor/mediapipe/selfie_segmentation.js", "static/js/vendor/mediapipe/selfie_segmentation.binarypb",
              "static/js/vendor/mediapipe/selfie_segmentation.tflite", "static/img/og-image.png", "static/favicon.ico",
              "static/img/freehandyly-logo.webp", "static/css/bootstrap.min.css"]:
        assert (ROOT / f).stat().st_size > 300, f


def test_robots_and_sitemap(client):
    r = get(client, "/robots.txt")
    assert "Sitemap: %s/sitemap.xml" % SITE in r.get_data(as_text=True) and "Disallow: /search" in r.get_data(as_text=True)
    x = get(client, "/sitemap.xml").get_data(as_text=True)
    assert x.count("<loc>") == len(PAGES) == 21
    assert "<loc>%s/</loc>" % SITE in x and "localhost" not in x


def test_search(client):
    r = get(client, "/search?q=pdf")
    h = r.get_data(as_text=True)
    assert r.status_code == 200 and "/tools/pdf-editor" in h and 'content="noindex,follow"' in h
    assert "No tool matches" in get(client, "/search?q=zzzzqqq").get_data(as_text=True)
    assert "<script>alert(1)" not in get(client, "/search?q=%3Cscript%3Ealert(1)").get_data(as_text=True)


def test_404_and_trailing_slash(client):
    r = get(client, "/definitely-missing")
    assert r.status_code == 404 and "Page not found" in r.get_data(as_text=True) and 'content="noindex,follow"' in r.get_data(as_text=True)
    r = get(client, "/tools/pdf-editor/")
    assert r.status_code == 301 and r.headers["Location"].endswith("/tools/pdf-editor")


def test_security_headers(client):
    h = get(client, "/").headers
    assert h["X-Content-Type-Options"] == "nosniff" and "Referrer-Policy" in h and "Strict-Transport-Security" in h


GOOD = {"name": "Test User", "email": "test@example.com", "message": "Hello, this is a test message."}


def test_contact_validation_success_and_protection(client):
    HITS.clear()
    assert get(client, "/contact").status_code == 200
    r = client.post("/contact", data={**GOOD, "email": "bad"}, base_url=SITE)
    h = r.get_data(as_text=True)
    assert r.status_code == 400 and "is-invalid" in h and "valid email" in h and 'value="Test User"' in h
    r = client.post("/contact", data=GOOD, base_url=SITE)
    assert r.status_code == 200 and "alert-success" in r.get_data(as_text=True)
    r = client.post("/contact", data={**GOOD, "name": "<b>x</b>y"}, base_url=SITE)
    assert "<b>x</b>" not in r.get_data(as_text=True)
    r = client.post("/contact", data={**GOOD, "website": "http://spam"}, base_url=SITE)
    assert r.status_code == 200 and "alert-success" in r.get_data(as_text=True)
    r = client.post("/contact", data=GOOD, base_url=SITE, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    HITS.clear()
    codes = [client.post("/contact", data=GOOD, base_url=SITE).status_code for _ in range(7)]
    assert 429 in codes
    HITS.clear()


def test_healthz(client):
    assert get(client, "/healthz").get_data(as_text=True) == "ok"


def test_rates_endpoint_with_mocked_upstream(client, monkeypatch):
    import io
    import rates

    payload = {"date": "2026-11-05", "usd": {"pkr": 280.5, "eur": 0.92, "gbp": 0.79, "inr": 83.0, "jpy": 150.0, "aed": 3.67, "btc": 0.00001, "eth": 0.0003}}

    class Resp(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(rates.urllib.request, "urlopen", lambda *a, **k: Resp(json.dumps(payload).encode()))
    rates._cache.update(data=None, at=0.0)
    r = client.get("/api/rates")
    d = r.get_json()
    assert r.status_code == 200 and d["fiat"]["USD"] == 1 and d["fiat"]["PKR"] == 280.5
    assert abs(d["crypto"]["BTC"] - 100000) < 1 and d["fiat_updated"] == "2026-11-05"
    # upstream down: cached copy is served flagged stale, then 503 when there is no cache at all
    monkeypatch.setattr(rates.urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    rates._cache["at"] = 0.0
    assert client.get("/api/rates").get_json().get("stale") is True
    rates._cache.update(data=None, at=0.0)
    assert client.get("/api/rates").status_code == 503


def test_currency_lists_match_the_page_script():
    import rates

    js = (ROOT / "static/js/tools/currency-crypto-converter.js").read_text(encoding="utf-8")
    codes = re.search(r"var CODES = \((.*?)\)\.split", js, re.S).group(1)
    assert re.findall(r"[A-Z]{3}", codes) == rates.CODES
    assert re.findall(r"'([A-Z]+)'", re.search(r"var CRYPTO = \[(.*?)\]", js).group(1)) == rates.CRYPTO


def test_no_preview_only_scripts_left(client):
    for p in PAGES:
        h = get(client, p).get_data(as_text=True)
        assert "parent.postMessage" not in h, p


# ------------------------------------------------------------------ YouTube tag lookup
import youtube_tags  # noqa: E402

WATCH_PAGE = ('<html><head><meta property="og:title" content="Fallback &amp; title"></head><body><script>var ytInitialPlayerResponse = '
              '{"videoDetails":{"title":"My Video","keywords":["seo tips","free tools","seo tips"]}};var x=1;</script></body></html>')


@pytest.mark.parametrize("value,expected", [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"),
    ("https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://evil.example/watch?v=dQw4w9WgXcQ", None),
    ("https://www.youtube.com/", None),
    ("", None),
])
def test_parse_video_id(value, expected):
    assert youtube_tags.parse_video_id(value) == expected


def test_parse_watch_page_reads_title_and_tags():
    assert youtube_tags.parse_watch_page(WATCH_PAGE) == ("My Video", ["seo tips", "free tools", "seo tips"])
    title, tags = youtube_tags.parse_watch_page('<meta property="og:title" content="A &amp; B"><meta name="keywords" content="x, y">')
    assert (title, tags) == ("A & B", ["x", "y"])


def test_youtube_api(client, monkeypatch):
    monkeypatch.setattr(youtube_tags, "_download", lambda vid: WATCH_PAGE)
    youtube_tags._cache.clear()
    r = get(client, "/api/youtube-tags?url=https://youtu.be/dQw4w9WgXcQ")
    assert r.status_code == 200 and r.get_json()["title"] == "My Video" and r.headers["X-Robots-Tag"] == "noindex"
    assert get(client, "/api/youtube-tags?url=nonsense").status_code == 400
