# FreeHandyly

Free online tools that run in your browser: a PDF editor (click any text to edit it), image compressor and converter, background remover, word counter, resume maker, calculators and more. No signup, and files never leave the visitor's device.

Live site: https://freehandyly.com (set `SITE_URL` to your own address when you deploy).

## Tools

| Tool | What it does |
|---|---|
| [Word Counter](/tools/word-counter) | Free online word counter and character counter. Count words, characters, sentences and paragraphs, check reading time and keyword density. No signup. |
| [YouTube Tag Extractor](/tools/youtube-tag-extractor) | Extract tags and hashtags from any public YouTube video. Copy them as plain tags or ready-to-use hashtags to research your niche. Free, no signup. |
| [Instagram Caption & Bio Generator](/tools/instagram-caption-bio-generator) | Free Instagram bio and caption generator with fancy fonts and a live character counter. Copy ideas to Instagram, TikTok or X. No signup needed. |
| [Social Media Image Resizer](/tools/social-media-image-resizer) | Resize images for Instagram, YouTube and other social platforms with exact pixel presets. Fast, free and private: files stay in your browser. |
| [Engagement Rate Calculator](/tools/engagement-rate-calculator) | Calculate engagement rate and video retention for Instagram, TikTok and YouTube. See the formula behind every result. Free, no signup. |
| [Image Format Converter](/tools/image-format-converter) | Convert PNG, JPG and WebP images online for free. Batch convert and download everything as a ZIP. Your files never leave your browser. |
| [Image Compressor](/tools/image-compressor) | Compress JPG, PNG and WebP images online and see exactly how many KB you save. Free, private, with no upload and no signup. |
| [Color Picker](/tools/color-picker) | Free color picker: find HEX, RGB and HSL codes, pick colors from an image and build palettes. Works in your browser, no signup. |
| [PDF Editor](/tools/pdf-editor) | Edit PDF online free: click any text to edit it, add text, draw, highlight, insert images and signatures, rotate pages. Private, no signup. |
| [Percentage Calculator](/tools/percentage-calculator) | Free percentage calculator: percent of a number, percentage change, discounts and sale price with the formula shown. Instant, no signup. |
| [Freelance Hourly Rate Calculator](/tools/freelance-hourly-rate-calculator) | Work out what to charge per hour as a freelancer from your income goal, taxes, expenses and billable hours. Free freelance rate calculator. |
| [Age Calculator](/tools/age-calculator) | Free age calculator: find your exact age in years, months, days, hours and minutes, or the gap between two dates. No signup. |
| [Currency & Crypto Converter](/tools/currency-crypto-converter) | Free currency converter for 150+ currencies including USD to PKR, plus Bitcoin and Ethereum. Quick, simple and no signup. |
| [Calorie & Water Calculator](/tools/calorie-water-calculator) | Estimate daily calories (BMR and TDEE) and how much water to drink using the Mifflin-St Jeor formula. Free calculator, no signup. |
| [BMI Calculator](/tools/bmi-calculator) | Free BMI calculator in metric or imperial. See your BMI category, WHO or South Asian cut-offs and your healthy weight range. No signup. |
| [Background Remover](/tools/background-remover) | Remove image backgrounds for free and download a transparent PNG. automatic cutout for people, one click for plain backgrounds. Photos stay on your device. |
| [Resume Maker](/tools/resume-maker) | Build a professional resume or CV in minutes with templates and accent colors, then save it as PDF. Free, no signup, no watermark. |

## Tech stack

- **Server:** Python 3.10+ and [Flask](https://flask.palletsprojects.com/) served by gunicorn. It serves the pages, `/robots.txt`, `/sitemap.xml`, tool search, the contact form and `/api/rates` (cached exchange rates).
- **Front end:** plain HTML/CSS/JavaScript with [Bootstrap](https://getbootstrap.com/) 5.3. Every tool runs client side. Libraries are vendored in `static/js/vendor/` (pdf.js, pdf-lib, MediaPipe), so nothing is loaded from a CDN except Google Fonts and the public currency-rate fallback.

## Quick start

```bash
git clone https://github.com/<your-user>/freehandyly.git
cd freehandyly
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # Windows: copy .env.example .env
python app.py                    # http://127.0.0.1:5000
```

Run the tests and the pre-deploy check:

```bash
pip install pytest
pytest -q
SITE_URL=https://freehandyly.com SECRET_KEY=any-long-random-string python predeploy_check.py
```

## Configuration

All settings are environment variables (see `.env.example`; a local `.env` file is loaded automatically and is git-ignored).

| Variable | Purpose |
|---|---|
| `SITE_URL` | Public address without trailing slash. Used for canonical URLs, Open Graph tags, structured data, sitemap and robots. |
| `SECRET_KEY` | Long random string. |
| `TRUST_PROXY` | `1` (default) when behind a proxy or load balancer so https and visitor IPs are detected. |
| `FORCE_HTTPS` | `1` to redirect http to https (skip if your host already does). |
| `CONTACT_TO`, `CONTACT_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Optional e-mail delivery for the contact form. |
| `SITEMAP_LASTMOD` | Optional fixed `lastmod` date (`YYYY-MM-DD`) for the sitemap. |

## Project structure

```
app.py                Flask app: pages, search, contact form, /api/rates, security headers, error pages
seo_routes.py         robots.txt, sitemap.xml, ads.txt
rates.py              Exchange-rate proxy with one-hour cache
predeploy_check.py    Checks files, config and every page before you deploy
pages/                The 21 pages as ready-to-serve HTML (+ _shell.html for search and 404)
data/tools.json       Tool names, SEO descriptions and search keywords
static/               CSS, JS (static/js/tools/<tool>.js), vendored libraries, images
tests/                pytest suite (pages, SEO, links, contact form, search, rates)
.github/workflows/    CI: runs the tests and the pre-deploy check on every push
```

The files in `pages/` are **not** Jinja templates, because the tool scripts contain `{` and `{%` sequences. They contain a few plain tokens instead: `__SITE_URL__` (replaced at request time) and, in `contact.html` and `_shell.html`, tokens such as `__ALERT__` and `__MAIN__`. Edit the HTML directly. Keep the visible FAQ and the FAQPage JSON-LD in sync (a test checks this).

## Deploying

Any host that runs Python works. The included `Procfile` starts gunicorn:

```
web: gunicorn app:app --workers 2 --threads 4 --timeout 60 --access-logfile -
```

1. Create a web service from this repository (Render, Railway, Fly.io, a VPS and similar).
2. Set `SITE_URL` (your https address) and `SECRET_KEY`. Add the SMTP variables to receive contact-form e-mail.
3. After the first deploy open `/robots.txt`, `/sitemap.xml` and every tool once.
4. Add the site to Google Search Console and submit `https://your-domain/sitemap.xml`.

Free tiers that put the app to sleep make the first visit slow, which hurts both visitors and SEO. A small always-on plan, or static hosting plus a form service, is better for a real launch.

## Deploying on Render (freehandyly.com)

1. Push this repository to GitHub.
2. In Render choose **New + > Blueprint**, select the repository and approve. `render.yaml` sets the build and start commands, `SITE_URL=https://freehandyly.com`, a generated `SECRET_KEY`, the `/healthz` health check and HTTPS redirects. Fill in the SMTP values when asked, or leave them empty for now.
3. When the build is green, open the `https://<service>.onrender.com` address and check the home page, a tool and `/sitemap.xml`.
4. Add the domain: service **Settings > Custom Domains > Add Custom Domain**, enter `freehandyly.com` (Render adds `www` and redirects it to the root domain).
5. At your domain provider's DNS settings add the records Render shows: an **A record** for `@` and a **CNAME** for `www` pointing to your `<service>.onrender.com` address. Delete any old **AAAA** records. On Cloudflare use a CNAME for both and keep the proxy off ("DNS only") until Render verifies the domain.
6. Back in Render click **Verify** next to each domain. The HTTPS certificate is issued automatically.
7. Keep `SITE_URL` equal to the final address (`https://freehandyly.com`).

Then, in Google Search Console, add the domain and submit `https://freehandyly.com/sitemap.xml`.

## Ads (AdSense)

Each page has three ad slots with the ids `adsense-top`, `adsense-middle` and `adsense-sidebar`. They currently show "Your Ad Here" house banners (`static/img/promo/`). After AdSense approval, replace the banner markup in those slots with your ad units and add your `ads.txt` (see `static/ads.txt.example`; the app serves `ads.txt` from the project root or `static/` once it exists). Visitors in the EEA, UK and Switzerland need a consent banner before personalised ads load. In your AdSense account, turn Auto ads off if you only want ads in the three slots.

## Contact form

Submissions are validated, rate limited (5 per hour per IP), protected by a honeypot field and an origin check, appended to `instance/messages.jsonl` and e-mailed when SMTP is configured. Many hosts have temporary disk space, so configure SMTP in production.

## Privacy notes

- Tools process files in the browser. Nothing is uploaded to the server.
- Fonts (Bricolage Grotesque and Inter) load from Google Fonts. Self-host them if you do not want that third-party request.
- The currency converter gets rates from `/api/rates`, which downloads them from the public currency-api dataset. If that fails, the browser contacts the same public sources directly.

## Known limitations

- **PDF editor:** edited text is covered and replaced, not erased from the file data, so do not use it to hide sensitive information. Text in non-Latin scripts (Urdu, Arabic, Chinese, Hindi) cannot be edited or typed because only the built-in PDF fonts are used. Scanned PDFs have no text to edit.
- The in-memory rate limiter is per worker process. Use a shared store if you scale out.

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

No license has been chosen yet. Until you add a `LICENSE` file, all rights are reserved by the owner. Choose one (for example MIT) before inviting contributions.
