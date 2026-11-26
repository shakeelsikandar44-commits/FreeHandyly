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
        visible = len(re.findall(r"<h3", art[art.find("Questions people ask"):]))
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
    for f in ["static/js/vendor/pdf.min.js", "static/js/vendor/pdf.worker.min.js", "static/js/vendor/pdf-lib.min.js", "static/js/vendor/ffmpeg/ffmpeg.js", "static/js/vendor/ffmpeg/ffmpeg-core.wasm",
              "static/js/vendor/mediapipe/selfie_segmentation.js", "static/js/vendor/mediapipe/selfie_segmentation.binarypb",
              "static/js/vendor/mediapipe/selfie_segmentation.tflite", "static/img/og-image.png", "static/favicon.ico",
              "static/img/freehandyly-logo.webp", "static/css/bootstrap.min.css"]:
        assert (ROOT / f).stat().st_size > 300, f


def test_robots_and_sitemap(client):
    r = get(client, "/robots.txt")
    assert "Sitemap: %s/sitemap.xml" % SITE in r.get_data(as_text=True) and "Disallow: /search" in r.get_data(as_text=True)
    x = get(client, "/sitemap.xml").get_data(as_text=True)
    assert x.count("<loc>") == len(PAGES) == 27
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



def test_removed_youtube_tool_redirects_and_is_gone_from_site(client):
    r = get(client, "/tools/youtube-tag-extractor")
    assert r.status_code == 301 and r.headers["Location"] == "/"
    assert get(client, "/api/youtube-tags").status_code == 404
    assert "youtube-tag-extractor" not in get(client, "/sitemap.xml").get_data(as_text=True)
    assert "youtube-tag-extractor" not in get(client, "/").get_data(as_text=True)


def _ai_payload():
    return {"title": "Medical Billing Specialist", "jd": "Review claims for accuracy and submit them to payers. Follow up on denials and reconcile payments daily.",
            "keywords": ["claims", "denials"], "years": 3, "employers": [{"current": True, "start": "2023-01", "end": ""}, {"current": False, "start": "2020-01", "end": "2022-12"}]}


def test_resume_ai_without_key_is_503_and_validates_input(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.post("/api/resume-ai", json=_ai_payload()).status_code == 503
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    assert client.post("/api/resume-ai", json={"jd": "short", "employers": []}).status_code == 400
    assert client.post("/api/resume-ai", data="nope").status_code == 400
    assert client.post("/api/resume-ai", json=_ai_payload(), headers={"Origin": "https://evil.example"}).status_code == 403


def test_resume_ai_with_mocked_gemini(client, monkeypatch):
    import json as _json
    import resume_ai
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    resume_ai._HITS.clear()
    seen = {}

    def fake(messages):
        seen["text"] = _json.dumps(messages)
        return 'Sure! ```json\n' + _json.dumps({
            "summary": "Medical billing specialist with 3+ years of experience in claims review, payer submissions and denial follow-up for busy practices.",
            "skills": ["Claims Review", "claims review", "Denials", "Payment Posting"],
            "employers": [{"role": "Medical Billing Specialist", "bullets": ["Review claims for accuracy before submission to payers", "Submit clean claims to payers within agreed deadlines", "Review again", "Follow up on denials and track appeals to completion daily"]},
                          {"role": "Associate Medical Billing Specialist", "bullets": ["Reconcile payments against remittances every day", "Submit batches", "Resolve payer questions quickly and document each outcome"]}]}) + "\n```"
    monkeypatch.setattr(resume_ai, "_call_gemini", fake)
    r = client.post("/api/resume-ai", json=_ai_payload())
    assert r.status_code == 200
    data = r.get_json()
    assert data["skills"] == ["Claims Review", "Denials", "Payment Posting"]
    assert len(data["employers"]) == 2
    firsts = [b.split()[0].lower() for e in data["employers"] for b in e["bullets"]]
    assert len(firsts) == len(set(firsts))  # no repeated opening word across employers
    assert "test-key" not in r.get_data(as_text=True) and "test-key" not in seen["text"]
    assert "<job_advert>" in seen["text"]


def test_resume_ai_rate_limit(client, monkeypatch):
    import resume_ai
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("RESUME_AI_PER_HOUR", "2")
    resume_ai._HITS.clear()
    monkeypatch.setattr(resume_ai, "_call_gemini", lambda m: '{"summary": "' + "x" * 60 + '", "skills": [], "employers": []}')
    codes = [client.post("/api/resume-ai", json=_ai_payload()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
    resume_ai._HITS.clear()


def test_resume_ai_gemini_provider(client, monkeypatch):
    import io
    import json as _json
    import resume_ai
    monkeypatch.setenv("GEMINI_API_KEY", "g-test-key")
    resume_ai._HITS.clear()
    seen = {}

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=0):
        seen["url"], seen["key"], seen["body"] = req.full_url, req.get_header("X-goog-api-key"), _json.loads(req.data)
        text = _json.dumps({"summary": "S" * 70, "skills": ["Claims"], "employers": [{"role": "Billing Specialist", "bullets": ["Review claims for accuracy before submission"] * 1}, {"role": "Billing Clerk", "bullets": []}]})
        return Resp(_json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}}]}).encode())

    monkeypatch.setattr(resume_ai.urllib.request, "urlopen", fake_urlopen)
    r = client.post("/api/resume-ai", json=_ai_payload())
    assert r.status_code == 200 and r.get_json()["skills"] == ["Claims"]
    assert seen["key"] == "g-test-key" and "generativelanguage.googleapis.com" in seen["url"] and "key=" not in seen["url"]
    assert seen["body"]["systemInstruction"]["parts"][0]["text"] and "g-test-key" not in _json.dumps(seen["body"])
    resume_ai._HITS.clear()


def test_gemini_tries_next_model_on_404(monkeypatch):
    import io
    import json as _json
    import urllib.error
    import resume_ai
    monkeypatch.setenv("GEMINI_API_KEY", "g-test-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    calls = []

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=0):
        calls.append(req.full_url)
        if len(calls) == 1:
            raise urllib.error.HTTPError(req.full_url, 404, "not found", {}, None)
        return Resp(_json.dumps({"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}).encode())

    monkeypatch.setattr(resume_ai.urllib.request, "urlopen", fake_urlopen)
    assert resume_ai._call_gemini([{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]) == "{}"
    assert len(calls) == 2 and "gemini-3.1-flash-lite" in calls[0] and "gemini-3-flash-preview" in calls[1]


def test_review_section_on_every_tool_page(client):
    import json as _json
    from app import TOOLS
    for t in TOOLS:
        h = get(client, "/tools/" + t["slug"]).get_data(as_text=True)
        assert 'id="reviews"' in h and 'name="slug" value="%s"' % t["slug"] in h, t["slug"]
        assert "Be the first to rate" in h and "aggregateRating" not in h
        assert h.count("/static/js/reviews.js") == 1
    assert 'id="reviews"' not in get(client, "/").get_data(as_text=True)


def test_review_submit_validation_and_delivery(client, monkeypatch):
    import app as appmod
    sent = []
    monkeypatch.setattr(appmod, "deliver", lambda n, e, m, subject=None: sent.append((n, e, m, subject)) or True)
    appmod.REVIEW_HITS.clear()
    ok = {"slug": "word-counter", "rating": "5", "name": "Ayesha", "text": "Quick and simple to use."}
    hdr = {"Accept": "application/json"}
    r = client.post("/review", data=ok, headers=hdr)
    assert r.status_code == 200 and r.get_json()["ok"] and len(sent) == 1
    assert "5/5" in sent[0][3] and "Ayesha" in sent[0][2]
    for bad in ({**ok, "rating": "0"}, {**ok, "rating": "x"}, {**ok, "name": "A"}, {**ok, "text": "short"}, {**ok, "slug": "nope"}):
        assert client.post("/review", data=bad, headers=hdr).status_code == 400
    assert client.post("/review", data={**ok, "website": "spam.com"}, headers=hdr).status_code == 200
    assert len(sent) == 1  # honeypot and invalid submissions are not delivered
    assert client.post("/review", data=ok, headers={**hdr, "Origin": "https://evil.example"}).status_code == 403
    r = client.post("/review", data=ok)  # no JS: plain page, not JSON
    assert r.status_code == 200 and "Thanks" in r.get_data(as_text=True) and r.headers["X-Robots-Tag"] == "noindex"


def test_review_rate_limit(client, monkeypatch):
    import app as appmod
    monkeypatch.setattr(appmod, "deliver", lambda *a, **k: True)
    appmod.REVIEW_HITS.clear()
    ok = {"slug": "bmi-calculator", "rating": "4", "name": "Sam", "text": "Works as expected, thanks."}
    codes = [client.post("/review", data=ok, headers={"Accept": "application/json"}).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


def test_reviews_render_and_schema(client, monkeypatch):
    import app as appmod
    import json as _json
    items = [{"name": "Ali <b>", "rating": r, "text": "Good tool, really.", "date": "2026-12-01"} for r in (5, 4, 5)]
    monkeypatch.setattr(appmod, "REVIEWS", {"word-counter": items, "bmi-calculator": items[:2]})
    h = get(client, "/tools/word-counter").get_data(as_text=True)
    assert "Ali &lt;b&gt;" in h and "3 reviews" in h
    ld = [_json.loads(m) for m in __import__("re").findall(r'<script type="application/ld\+json">(.*?)</script>', h, __import__("re").S)]
    app_node = [n for d in ld for n in d.get("@graph", []) if n.get("@type") == "WebApplication"][0]
    assert app_node["aggregateRating"]["ratingCount"] == 3 and app_node["aggregateRating"]["ratingValue"] == 4.7
    h2 = get(client, "/tools/bmi-calculator").get_data(as_text=True)  # only 2 reviews: shown, but no rating schema yet
    assert "2 reviews" in h2 and "aggregateRating" not in h2
