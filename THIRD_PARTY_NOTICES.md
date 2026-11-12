# Third-party notices

This project bundles the following open-source software. Each keeps its own license; license headers remain inside the vendored files.

| Component | Version | License | Location |
|---|---|---|---|
| [Bootstrap](https://getbootstrap.com/) | 5.3.3 | MIT | `static/css/bootstrap.min.css`, `static/js/bootstrap.bundle.min.js` |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 | `static/js/vendor/pdf.min.js`, `static/js/vendor/pdf.worker.min.js` |
| [pdf-lib](https://pdf-lib.js.org/) | see file header | MIT | `static/js/vendor/pdf-lib.min.js` |
| [MediaPipe Selfie Segmentation](https://github.com/google/mediapipe) | 0.1.1675465747 | Apache-2.0 | `static/js/vendor/mediapipe/` |
| [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (@ffmpeg/ffmpeg 0.12.10, @ffmpeg/util 0.12.1, @ffmpeg/core 0.12.6) | 0.12.x | MIT wrapper; the FFmpeg core contains LGPL and GPL components (FFmpeg, x264, LAME) | `static/js/vendor/ffmpeg/` |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | 1.1.1 | MIT | `static/js/vendor/fontkit.umd.min.js` |
| [Flask](https://flask.palletsprojects.com/) | 3.1.3 | BSD-3-Clause | Python dependency |
| [gunicorn](https://gunicorn.org/) | 26.2.0 | MIT | Python dependency |

Signature fonts bundled in `static/fonts/signature/` (SIL Open Font License 1.1, via Fontsource): Dancing Script, Great Vibes, Allura, Sacramento, Satisfy, Caveat, Parisienne, Alex Brush, Yellowtail, Homemade Apple, Mr Dafoe, Marck Script.

Fonts loaded from Google Fonts: Bricolage Grotesque and Inter (SIL Open Font License 1.1).

Exchange rates come from the [@fawazahmed0/currency-api](https://github.com/fawazahmed0/exchange-api) dataset; check its terms before heavy commercial use.

## Inter and Bricolage Grotesque (page fonts)
Self-hosted variable fonts (latin subset) from the Fontsource packages @fontsource-variable/inter and @fontsource-variable/bricolage-grotesque. Licensed under the SIL Open Font License 1.1.

## Liberation fonts (PDF editor)
Liberation Sans, Serif and Mono 2.1.x (metric-compatible with Arial, Times New Roman and Courier New) in `static/fonts/pdf/`, used when editing existing PDF text. Licensed under the SIL Open Font License 1.1; see `static/fonts/pdf/LICENSE-liberation.txt`.
