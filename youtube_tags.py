"""Public-tag lookup for the YouTube Tag & Hashtag Extractor (served at /api/youtube-tags).

The visitor pastes a video link; we read the public watch page on the server (browsers cannot, because of CORS) and return
the video title and the tags the uploader made public. Results are cached in memory for an hour."""
import html as _html
import json
import re
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse

ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
TTL, CACHE_MAX = 3600, 300
_lock = threading.Lock()
_cache = {}  # video id -> (timestamp, result)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+1; SOCS=CAI",
}


class LookupError_(Exception):
    """Carries a visitor-safe message and an HTTP status."""

    def __init__(self, message, status=502):
        super().__init__(message)
        self.message, self.status = message, status


def parse_video_id(value):
    """Returns the 11-character video id from a YouTube link (watch, youtu.be, shorts, embed, live) or a bare id; else None."""
    value = (value or "").strip()
    if ID_RE.match(value):
        return value
    if not value or len(value) > 300:
        return None
    if "://" not in value:
        value = "https://" + value
    try:
        u = urlparse(value)
    except ValueError:
        return None
    host = (u.hostname or "").lower()
    for prefix in ("www.", "m.", "music."):
        if host.startswith(prefix):
            host = host[len(prefix):]
    cand = ""
    if host == "youtu.be":
        cand = u.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "youtube-nocookie.com"):
        if u.path.rstrip("/") == "/watch":
            cand = (parse_qs(u.query).get("v") or [""])[0]
        else:
            m = re.match(r"^/(?:shorts|embed|live|v)/([^/?#]+)", u.path)
            cand = m.group(1) if m else ""
    return cand if ID_RE.match(cand) else None


def parse_watch_page(page):
    """Extracts (title, tags) from the HTML of a watch page. Tags may be empty if the uploader made none public."""
    title, tags = "", []
    marker = "ytInitialPlayerResponse"
    i = page.find(marker)
    while i != -1 and not tags and not title:
        j = page.find("{", i)
        if j == -1:
            break
        try:
            data, _ = json.JSONDecoder().raw_decode(page[j:])
            details = data.get("videoDetails") or {}
            title = details.get("title") or ""
            tags = [t for t in (details.get("keywords") or []) if isinstance(t, str)]
            break
        except ValueError:
            i = page.find(marker, i + len(marker))
    if not title:
        m = re.search(r'<meta property="og:title" content="([^"]*)"', page)
        title = _html.unescape(m.group(1)) if m else ""
    if not tags:
        m = re.search(r'<meta name="keywords" content="([^"]*)"', page)
        if m:
            tags = [t.strip() for t in _html.unescape(m.group(1)).split(",") if t.strip()]
    return title.strip(), tags


def _download(video_id):
    req = urllib.request.Request("https://www.youtube.com/watch?v=" + video_id, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read(3_000_000).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LookupError_("That video was not found. Check the link and try again.", 404)
        raise LookupError_("YouTube did not answer this request. Please try again in a minute.")
    except Exception:  # noqa: BLE001 - never leak network details to visitors
        raise LookupError_("Could not reach YouTube right now. Please try again in a minute.")


def lookup(video_id):
    now = time.time()
    with _lock:
        hit = _cache.get(video_id)
        if hit and now - hit[0] < TTL:
            return hit[1]
    title, tags = parse_watch_page(_download(video_id))
    if not title and not tags:
        raise LookupError_("Could not read this video's details. It may be private, removed or restricted.", 404)
    result = {"title": title, "tags": tags}
    if not tags:
        result["message"] = "This video has no public tags. The uploader chose not to add any."
    with _lock:
        if len(_cache) >= CACHE_MAX:
            _cache.pop(min(_cache, key=lambda k: _cache[k][0]))
        _cache[video_id] = (now, result)
    return result
