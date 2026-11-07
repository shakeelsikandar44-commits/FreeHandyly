"""FreeHandyly pre-deploy check. Run from the project root (the folder with app.py):

    SITE_URL=https://yourdomain.com SECRET_KEY=something-long python predeploy_check.py

Exit code 0 = no blockers. Needs only Flask (already in requirements.txt)."""
import os, re, sys, importlib, html as _html
sys.path.insert(0, os.getcwd())
FAIL, WARN, OK = [], [], []

def ok(m): OK.append(m)
def warn(m): WARN.append(m)
def fail(m): FAIL.append(m)

TOOLS = ["word-counter", "youtube-tag-extractor", "instagram-caption-bio-generator", "social-media-image-resizer",
         "engagement-rate-calculator", "image-format-converter", "image-compressor", "color-picker", "pdf-editor",
         "percentage-calculator", "freelance-hourly-rate-calculator", "age-calculator", "currency-crypto-converter",
         "calorie-water-calculator", "bmi-calculator", "background-remover", "resume-maker"]
PAGES = ["/", "/about", "/contact", "/privacy-policy"] + ["/tools/" + t for t in TOOLS]
STATIC = ["static/img/og-image.png", "static/favicon.ico", "static/img/freehandyly-logo.webp", "static/img/freehandyly-logo-stacked.webp",
          "static/css/bootstrap.min.css", "static/css/site.css", "static/js/vendor/pdf.min.js", "static/js/vendor/pdf.worker.min.js",
          "static/js/vendor/pdf-lib.min.js", "static/js/vendor/mediapipe/selfie_segmentation.js",
          "static/js/vendor/mediapipe/selfie_segmentation.binarypb", "static/js/vendor/mediapipe/selfie_segmentation.tflite",
          "static/js/vendor/mediapipe/selfie_segmentation_solution_simd_wasm_bin.js",
          "static/js/vendor/mediapipe/selfie_segmentation_solution_simd_wasm_bin.wasm",
          "static/js/vendor/mediapipe/selfie_segmentation_solution_wasm_bin.js",
          "static/js/vendor/mediapipe/selfie_segmentation_solution_wasm_bin.wasm"]

# 1. files
for f in STATIC:
    if not os.path.isfile(f): fail("missing file: " + f)
    elif os.path.getsize(f) < 100: fail("file looks empty/corrupt: " + f)
    else: ok(f)
if os.path.isfile("static/js/vendor/pdf.worker.min.js"):
    head = open("static/js/vendor/pdf.worker.min.js", "rb").read(4000).decode("latin1")
    if "3.11.174" not in head and "pdfjsVersion" not in head:
        warn("pdf.worker.min.js version not recognised; it must match pdf.min.js (3.11.174)")
for f in ["Procfile", "requirements.txt"]:
    if not os.path.isfile(f): fail("missing " + f)
if os.path.isfile("requirements.txt"):
    req = open("requirements.txt").read().lower()
    if "gunicorn" not in req: fail("requirements.txt has no gunicorn")
    if not re.search(r"flask\s*[=<>~]", req): warn("pin Flask version in requirements.txt (Flask==x.y.z)")
if os.path.isfile("Procfile") and "gunicorn" not in open("Procfile").read(): fail("Procfile does not start gunicorn")
if os.path.isfile(".gitignore") and ".env" not in open(".gitignore").read(): warn(".env is not in .gitignore")

# 2. app
try:
    mod = importlib.import_module("app")
    app = getattr(mod, "app", None) or mod.create_app()
except Exception as e:
    fail("cannot import app: %r" % e); app = None
if app:
    if app.debug: fail("app.debug is True")
    key = app.config.get("SECRET_KEY")
    if not key or str(key).lower() in ("dev", "change-me", "secret", "changeme", "your-secret-key"): fail("SECRET_KEY missing or default")
    site = os.environ.get("SITE_URL", "")
    if not site.startswith("https://"): warn("SITE_URL env var is not an https:// URL (canonical/OG/sitemap need it)")
    c = app.test_client()
    # 3. pages
    for p in PAGES:
        r = c.get(p, base_url=site or "http://localhost")
        if r.status_code != 200: fail("%s -> HTTP %s" % (p, r.status_code)); continue
        h = r.get_data(as_text=True)
        t = re.search(r"<title>(.*?)</title>", h, re.S)
        d = re.search(r'name="description" content="([^"]*)"', h)
        cn = re.search(r'rel="canonical" href="([^"]*)"', h)
        if not t or not (20 <= len(_html.unescape(t.group(1)).strip()) <= 70): warn("%s title length" % p)
        if not d or not (70 <= len(_html.unescape(d.group(1))) <= 160): warn("%s meta description length" % p)
        if len(re.findall(r"<h1[ >]", h)) != 1: warn("%s needs exactly one <h1>" % p)
        if not cn: fail("%s has no canonical" % p)
        elif "localhost" in cn.group(1) or "127.0.0.1" in cn.group(1): fail("%s canonical points to %s (set SITE_URL / proxy headers)" % (p, cn.group(1)))
        elif cn.group(1).startswith("http://") and site.startswith("https"): fail("%s canonical is http://" % p)
        if "ad-hint" in h and 'class="ad-slot' in h and "ad-placeholder" in h: warn("%s shows visible ad placeholder text (hide until AdSense is approved)" % p)
    # 4. extras
    for p, kind in [("/robots.txt", "Sitemap:"), ("/sitemap.xml", "<urlset"), ("/ads.txt", None)]:
        r = c.get(p)
        if r.status_code != 200: (warn if p == "/ads.txt" else fail)("%s -> HTTP %s" % (p, r.status_code))
        elif kind and kind not in r.get_data(as_text=True): fail("%s missing %s" % (p, kind))
        elif p == "/sitemap.xml":
            n = r.get_data(as_text=True).count("<loc>")
            (ok if n >= len(PAGES) else fail)("sitemap lists %d URLs (expected >= %d)" % (n, len(PAGES)))
    if c.get("/search?q=pdf").status_code != 200: fail("/search?q=pdf is not 200 (home page search box)")
    r = c.get("/this-page-does-not-exist")
    if r.status_code != 404: fail("unknown URL does not return 404 (soft-404 hurts AdSense/SEO)")
    elif "FreeHandyly" not in r.get_data(as_text=True): warn("404 page is not a branded template")
    r = c.post("/contact", data={"name": "t", "email": "t@t.com", "message": "x" * 30, "website": "bot"}, base_url=site or "http://localhost")
    if r.status_code >= 500: fail("contact form returns %s" % r.status_code)
    r = c.get("/", base_url=site or "http://localhost")
    for hd in ["X-Content-Type-Options", "Referrer-Policy"]:
        if hd not in r.headers: warn("response header missing: " + hd)
    if "Strict-Transport-Security" not in r.headers: warn("HSTS header missing (enable once HTTPS works)")

def group(msgs):
    out, seen = [], {}
    for m in msgs:
        g = re.match(r"^(/\S*) (.*)$", m)
        if g:
            k = re.sub(r"https?://\S+", "<url>", g.group(2))
            seen.setdefault(k, []).append(g.group(1))
        else:
            out.append(m)
    for k, pages in seen.items():
        out.append("%s  [%d pages: %s%s]" % (k, len(pages), ", ".join(pages[:3]), ", ..." if len(pages) > 3 else ""))
    return out

print("\nPASS %d | WARN %d | FAIL %d\n" % (len(OK), len(WARN), len(FAIL)))
for m in group(FAIL): print("FAIL  " + m)
for m in group(WARN): print("warn  " + m)
print("\n" + ("READY: no blockers." if not FAIL else "NOT READY: fix the FAIL items above."))
sys.exit(1 if FAIL else 0)
