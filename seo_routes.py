"""robots.txt, sitemap.xml and ads.txt (Flask blueprint, registered in app.py)."""
import json
import os
import datetime
from pathlib import Path

from flask import Blueprint, Response, request

BASE = Path(__file__).resolve().parent
seo = Blueprint("fh_seo", __name__)
TOOL_SLUGS = [t["slug"] for t in json.loads((BASE / "data" / "tools.json").read_text(encoding="utf-8"))]
PAGES = ["/", "/about", "/contact", "/privacy-policy"] + ["/tools/" + s for s in TOOL_SLUGS]


def _site():
    return (os.environ.get("SITE_URL") or request.url_root).strip().rstrip("/")


def _lastmod():
    """SITEMAP_LASTMOD (YYYY-MM-DD) if set, otherwise the date of the newest page file."""
    d = os.environ.get("SITEMAP_LASTMOD")
    if d:
        return d
    newest = max(p.stat().st_mtime for p in (BASE / "pages").rglob("*.html"))
    return datetime.date.fromtimestamp(newest).isoformat()


@seo.route("/robots.txt")
def robots():
    body = "User-agent: *\nAllow: /\nDisallow: /search\nDisallow: /api/\n\nSitemap: %s/sitemap.xml\n" % _site()
    return Response(body, mimetype="text/plain")


@seo.route("/sitemap.xml")
def sitemap():
    base, lm = _site(), _lastmod()
    rows = "".join("  <url><loc>%s%s</loc><lastmod>%s</lastmod></url>\n" % (base, p, lm) for p in PAGES)
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % rows
    return Response(xml, mimetype="application/xml")


@seo.route("/ads.txt")
def ads_txt():
    """Serves ads.txt from the project root or static/ once you add it (see README, AdSense section)."""
    for p in (BASE / "ads.txt", BASE / "static" / "ads.txt"):
        if p.is_file():
            return Response(p.read_text(encoding="utf-8"), mimetype="text/plain")
    return Response("ads.txt is not set up yet", status=404, mimetype="text/plain")
