"""FreeHandyly - free online tools (Flask).

The tools themselves run in the visitor's browser; this app serves the pages, static files, sitemap/robots,
tool search and the contact form. Configuration is read from environment variables (see .env.example)."""
import html
import json
import logging
import os
import re
import smtplib
import time
from collections import defaultdict, deque
from email.message import EmailMessage
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, Response, redirect, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from rates import get_rates

BASE = Path(__file__).resolve().parent


def _load_dotenv(path=BASE / ".env"):
    """Tiny .env loader (no extra dependency). Real environment variables always win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or os.urandom(32).hex()  # no sessions are used today
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = timedelta(days=1)
if os.environ.get("TRUST_PROXY", "1") == "1":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
log = logging.getLogger("freehandyly")

# ------------------------------------------------------------------ pages
TOOLS = json.loads((BASE / "data" / "tools.json").read_text(encoding="utf-8"))
PAGE_FILES = {"/": "index.html", "/about": "about.html", "/contact": "contact.html", "/privacy-policy": "privacy-policy.html"}
PAGE_FILES.update({"/tools/" + t["slug"]: "tools/%s.html" % t["slug"] for t in TOOLS})
HTML = {path: (BASE / "pages" / f).read_text(encoding="utf-8") for path, f in PAGE_FILES.items()}
SHELL = (BASE / "pages" / "_shell.html").read_text(encoding="utf-8")
esc = html.escape


def site_url():
    return (os.environ.get("SITE_URL") or request.url_root).strip().rstrip("/")


def page_response(body, status=200, cache="public, max-age=300"):
    resp = Response(body.replace("__SITE_URL__", site_url()), status=status, mimetype="text/html")
    resp.headers["Cache-Control"] = cache
    return resp


def shell_response(title, desc, main, status=200):
    body = SHELL.replace("__TITLE__", esc(title)).replace("__DESC__", esc(desc)).replace("__MAIN__", main)
    return page_response(body, status, cache="no-store")


def make_view(path):
    def view():
        return page_response(HTML[path])
    return view


for _path in PAGE_FILES:
    if _path != "/contact":
        app.add_url_rule(_path, endpoint="page:" + _path, view_func=make_view(_path))


# ------------------------------------------------------------------ housekeeping
REMOVED_PAGES = {"/tools/youtube-tag-extractor": "/"}  # retired tools: permanent redirect so old links keep working


@app.before_request
def normalize():
    p = request.path
    if request.method in ("GET", "HEAD"):
        if p.rstrip("/") in REMOVED_PAGES:
            return redirect(REMOVED_PAGES[p.rstrip("/")], 301)
        if len(p) > 1 and p.endswith("/"):
            q = "?" + request.query_string.decode() if request.query_string else ""
            return redirect(p.rstrip("/") + q, 301)
        if os.environ.get("FORCE_HTTPS") == "1" and request.scheme == "http" and request.host.split(":")[0] not in ("localhost", "127.0.0.1"):
            return redirect(request.url.replace("http://", "https://", 1), 301)


@app.after_request
def security_headers(resp):
    h = resp.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("X-Frame-Options", "SAMEORIGIN")
    h.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
    if request.is_secure:
        h.setdefault("Strict-Transport-Security", "max-age=31536000")
    return resp


@app.get("/favicon.ico")
def favicon():
    return send_from_directory(app.static_folder, "favicon.ico")


@app.get("/healthz")
def healthz():
    resp = Response("ok", mimetype="text/plain")
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp


# ------------------------------------------------------------------ search
def search_tools(q):
    words = [w for w in re.split(r"\W+", q.lower()) if w]
    if not words:
        return []
    scored = []
    for t in TOOLS:
        name, slug, kw, desc = t["name"].lower(), t["slug"].replace("-", " "), t["keywords"].lower(), t["description"].lower()
        score = 0
        for w in words:
            score += 5 * (w in name) + 4 * (w in slug) + 3 * (w in kw) + (w in desc)
        if score:
            scored.append((score, t))
    return [t for _, t in sorted(scored, key=lambda x: -x[0])]


def tool_list_html(tools):
    return '<ul class="list-unstyled">' + "".join(
        '<li class="mb-3"><a class="h5" href="/tools/%s">%s</a><p class="mb-0">%s</p></li>' % (t["slug"], esc(t["name"]), esc(t["description"]))
        for t in tools) + "</ul>"


@app.get("/search")
def search():
    q = request.args.get("q", "").strip()[:80]
    results = search_tools(q)
    if not q:
        body = "<p>Type what you need, for example <em>pdf</em>, <em>percent</em> or <em>compress</em>.</p>" + tool_list_html(TOOLS)
    elif results:
        body = "<p>%d tool%s found.</p>" % (len(results), "" if len(results) == 1 else "s") + tool_list_html(results)
    else:
        body = "<p>No tool matches &ldquo;%s&rdquo;. Here are all our free tools:</p>%s" % (esc(q), tool_list_html(TOOLS))
    main = '<div class="container page-narrow legal"><h1>Search tools</h1>%s</div>' % body
    resp = shell_response("Search tools", "Search FreeHandyly's free online tools.", main)
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp


# ------------------------------------------------------------------ contact form
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
HITS = defaultdict(deque)  # ip -> timestamps of recent submissions (in-memory, per worker)
RATE_LIMIT, RATE_WINDOW = 5, 3600


def render_contact(values=None, errors=None, alert="", status=200):
    v, e = values or {}, errors or {}
    fb = lambda k: '<div class="invalid-feedback">%s</div>' % esc(e[k]) if k in e else ""
    body = HTML["/contact"]
    for token, value in {
        "__ALERT__": alert,
        "__V_NAME__": esc(v.get("name", "")), "__V_EMAIL__": esc(v.get("email", "")), "__V_MESSAGE__": esc(v.get("message", "")),
        "__C_NAME__": "is-invalid" if "name" in e else "", "__C_EMAIL__": "is-invalid" if "email" in e else "",
        "__C_MESSAGE__": "is-invalid" if "message" in e else "",
        "__E_NAME__": fb("name"), "__E_EMAIL__": fb("email"), "__E_MESSAGE__": fb("message"),
    }.items():
        body = body.replace(token, value)
    return page_response(body, status, cache="no-store")


def deliver(name, email, message):
    """Always append to a local log, and e-mail the message when SMTP is configured. Returns True if either worked."""
    ok = False
    record = {"time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "name": name, "email": email, "message": message}
    try:
        folder = Path(os.environ.get("CONTACT_LOG_DIR") or BASE / "instance")
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / "messages.jsonl", "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        ok = True
    except OSError:
        log.exception("could not write contact log")
    host = os.environ.get("SMTP_HOST")
    if host:
        try:
            msg = EmailMessage()
            msg["Subject"] = "FreeHandyly contact form: %s" % name[:60]
            msg["From"] = os.environ.get("CONTACT_FROM") or os.environ.get("SMTP_USER") or "noreply@localhost"
            msg["To"] = os.environ.get("CONTACT_TO", "contact@freehandyly.com")
            msg["Reply-To"] = email
            msg.set_content("From: %s <%s>\n\n%s\n" % (name, email, message))
            with smtplib.SMTP(host, int(os.environ.get("SMTP_PORT", "587")), timeout=15) as s:
                s.starttls()
                if os.environ.get("SMTP_USER"):
                    s.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
                s.send_message(msg)
            ok = True
        except Exception:  # noqa: BLE001 - never leak SMTP details to visitors
            log.exception("could not send contact e-mail")
    return ok


@app.route("/contact", methods=["GET", "POST"])
def contact():
    if request.method == "GET":
        return render_contact()
    origin = request.headers.get("Origin")
    if origin and urlparse(origin).netloc != request.host:
        return Response("Forbidden", status=403)
    form = request.form
    if form.get("website"):  # honeypot field: bots fill it, people never see it
        return render_contact(alert='<div class="alert alert-success" role="alert"><strong>Thank you!</strong> Your message has been sent.</div>')
    values = {k: re.sub(r"[\r\n]+", " ", form.get(k, "")).strip() if k != "message" else form.get(k, "").strip() for k in ("name", "email", "message")}
    errors = {}
    if not 2 <= len(values["name"]) <= 80:
        errors["name"] = "Please enter your name."
    if len(values["email"]) > 120 or not EMAIL_RE.match(values["email"]):
        errors["email"] = "Please enter a valid email address."
    if not 10 <= len(values["message"]) <= 3000:
        errors["message"] = "Please write a message of at least 10 characters."
    if errors:
        return render_contact(values, errors, '<div class="alert alert-danger" role="alert">Please fix the highlighted fields and try again.</div>', 400)
    now, hits = time.time(), HITS[request.remote_addr or "?"]
    while hits and now - hits[0] > RATE_WINDOW:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        return render_contact(values, None, '<div class="alert alert-danger" role="alert">Too many messages from your network. Please try again later.</div>', 429)
    hits.append(now)
    if deliver(values["name"], values["email"], values["message"]):
        return render_contact(alert='<div class="alert alert-success" role="alert"><strong>Thank you!</strong> Your message has been sent. We will reply as soon as we can.</div>')
    return render_contact(values, None, '<div class="alert alert-danger" role="alert">Sorry, we could not send your message. Please email us directly.</div>', 502)


# ------------------------------------------------------------------ errors
@app.errorhandler(404)
def not_found(_e):
    main = ('<div class="container page-narrow legal"><h1>Page not found</h1><p>The page you are looking for does not exist or has moved. '
            'Try a tool below or <a href="/">go to the home page</a>.</p>%s</div>' % tool_list_html(TOOLS))
    return shell_response("Page not found", "This page does not exist.", main, 404)


@app.errorhandler(413)
def too_large(_e):
    return Response("Message too large.", status=413, mimetype="text/plain")


@app.errorhandler(500)
def server_error(_e):
    main = '<div class="container page-narrow legal"><h1>Something went wrong</h1><p>Please try again in a moment, or <a href="/">go to the home page</a>.</p></div>'
    return shell_response("Something went wrong", "An unexpected error occurred.", main, 500)


@app.get("/api/rates")
def api_rates():
    try:
        resp = Response(json.dumps(get_rates()), mimetype="application/json")
        resp.headers["Cache-Control"] = "public, max-age=300"
    except RuntimeError:
        resp = Response(json.dumps({"error": "Exchange rates are temporarily unavailable."}), status=503, mimetype="application/json")
        resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Robots-Tag"] = "noindex"
    return resp




from seo_routes import seo  # noqa: E402  (robots.txt, sitemap.xml, ads.txt)

app.register_blueprint(seo)

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", "5000")))
