/* FreeHandyly - Social Media Image Resizer (canvas, 100% client-side). */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var canvas = $('rs-canvas'); if (!canvas) { return; }
  var ctx = canvas.getContext('2d');
  var PRESETS = [
    ['Instagram portrait post, 4:5 (1080 x 1350)', 1080, 1350],
    ['Instagram tall post, 3:4 grid size (1080 x 1440)', 1080, 1440],
    ['Instagram square post (1080 x 1080)', 1080, 1080],
    ['Instagram landscape post (1080 x 566)', 1080, 566],
    ['Instagram Story, Reel, TikTok, Shorts (1080 x 1920)', 1080, 1920],
    ['Instagram profile picture (320 x 320)', 320, 320],
    ['YouTube thumbnail (1280 x 720)', 1280, 720],
    ['YouTube channel banner (2560 x 1440)', 2560, 1440],
    ['Facebook shared image (1200 x 630)', 1200, 630],
    ['X (Twitter) post image (1600 x 900)', 1600, 900],
    ['LinkedIn post (1200 x 627)', 1200, 627],
    ['Pinterest pin (1000 x 1500)', 1000, 1500],
    ['Custom size', 0, 0]
  ];
  var preset = $('rs-preset'), wEl = $('rs-w'), hEl = $('rs-h'), fit = $('rs-fit'), bg = $('rs-bg'),
      fx = $('rs-fx'), fy = $('rs-fy'), fmt = $('rs-format'), qual = $('rs-quality'), info = $('rs-info'), dl = $('rs-download');
  var img = null, fileName = 'image';

  PRESETS.forEach(function (p, i) { preset.appendChild(U.el('option', { value: String(i) }, p[0])); });

  function size() {
    var w = Math.max(16, Math.min(8000, parseInt(wEl.value, 10) || 0));
    var h = Math.max(16, Math.min(8000, parseInt(hEl.value, 10) || 0));
    return { w: w, h: h };
  }

  /* Manual crop box state (image pixel units; box keeps the output aspect ratio). */
  var wrap = $('rs-crop-wrap'), cimg = $('rs-cimg'), cbox = $('rs-cbox'), zoom = $('rs-zoom');
  var crop = { x: 0, y: 0, w: 0 }, cropKey = '', cropUrl = '', drag = null;

  function cropMax(s) { return Math.min(img.naturalWidth, img.naturalHeight / (s.h / s.w)); }
  function clampCrop(s) {
    var r = s.h / s.w;
    crop.w = Math.min(Math.max(crop.w, 16), cropMax(s));
    crop.x = Math.max(0, Math.min(crop.x, img.naturalWidth - crop.w));
    crop.y = Math.max(0, Math.min(crop.y, img.naturalHeight - crop.w * r));
  }
  function placeBox(s) {
    var r = s.h / s.w;
    cbox.style.left = (crop.x / img.naturalWidth * 100) + '%';
    cbox.style.top = (crop.y / img.naturalHeight * 100) + '%';
    cbox.style.width = (crop.w / img.naturalWidth * 100) + '%';
    cbox.style.height = (crop.w * r / img.naturalHeight * 100) + '%';
  }
  function setupCrop(s) {
    if (cropUrl !== img._url) { cropUrl = img._url; cimg.src = img._url; }
    var key = img._url + '|' + s.w + 'x' + s.h;
    if (key !== cropKey) {
      cropKey = key; zoom.value = 100;
      crop.w = cropMax(s);
      crop.x = (img.naturalWidth - crop.w) / 2;
      crop.y = (img.naturalHeight - crop.w * s.h / s.w) / 2;
    }
    clampCrop(s); placeBox(s);
  }

  /* Cheap, cross-browser blur: shrink the image, then stretch it back over the canvas. */
  function blurBackdrop(s, iw, ih) {
    var t = document.createElement('canvas');
    t.width = Math.max(8, Math.round(s.w / 24)); t.height = Math.max(8, Math.round(s.h / 24));
    var tc = t.getContext('2d'), k = Math.max(t.width / iw, t.height / ih);
    tc.drawImage(img, (t.width - iw * k) / 2, (t.height - ih * k) / 2, iw * k, ih * k);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(t, 0, 0, s.w, s.h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, s.w, s.h);
  }

  function draw() {
    var s = size();
    canvas.width = s.w; canvas.height = s.h;
    ctx.clearRect(0, 0, s.w, s.h);
    var mode = fit.value;
    wrap.hidden = !(img && mode === 'manual');
    if (!img) { return; }
    if (mode !== 'cover' || fmt.value === 'image/jpeg') { ctx.fillStyle = bg.value; ctx.fillRect(0, 0, s.w, s.h); }
    ctx.imageSmoothingQuality = 'high';
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (mode === 'stretch') { ctx.drawImage(img, 0, 0, s.w, s.h); }
    else if (mode === 'manual') {
      setupCrop(s);
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.w * s.h / s.w, 0, 0, s.w, s.h);
    }
    else {
      if (mode === 'blur') { blurBackdrop(s, iw, ih); }
      var scale = mode === 'cover' ? Math.max(s.w / iw, s.h / ih) : Math.min(s.w / iw, s.h / ih);
      var dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, (s.w - dw) * (fx.value / 100), (s.h - dh) * (fy.value / 100), dw, dh);
    }
    info.textContent = 'Original ' + iw + ' x ' + ih + ' px  \u2192  output ' + s.w + ' x ' + s.h + ' px';
    info.className = 'status-line';
  }

  cbox.addEventListener('pointerdown', function (e) {
    if (cbox.setPointerCapture) { cbox.setPointerCapture(e.pointerId); }
    drag = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
    e.preventDefault();
  });
  cbox.addEventListener('pointermove', function (e) {
    if (!drag || !img) { return; }
    var k = img.naturalWidth / cimg.getBoundingClientRect().width;
    crop.x = drag.x + (e.clientX - drag.px) * k;
    crop.y = drag.y + (e.clientY - drag.py) * k;
    draw();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) { cbox.addEventListener(t, function () { drag = null; }); });
  zoom.addEventListener('input', function () {
    if (!img) { return; }
    var s = size(), r = s.h / s.w, cx = crop.x + crop.w / 2, cy = crop.y + crop.w * r / 2;
    crop.w = cropMax(s) * zoom.value / 100;
    crop.x = cx - crop.w / 2; crop.y = cy - crop.w * r / 2;
    draw();
  });

  function onPreset() {
    var p = PRESETS[parseInt(preset.value, 10)];
    if (p && p[1]) { wEl.value = p[1]; hEl.value = p[2]; }
    draw();
  }
  function onSizeInput() {
    var w = parseInt(wEl.value, 10), h = parseInt(hEl.value, 10), match = PRESETS.length - 1;
    PRESETS.forEach(function (p, i) { if (p[1] === w && p[2] === h) { match = i; } });
    preset.value = String(match);
    draw();
  }

  function load(files) {
    var f = files[0]; if (!f) { return; }
    if (!/^image\//.test(f.type)) { info.textContent = 'Please choose an image file.'; info.className = 'status-line err'; return; }
    U.loadImage(f).then(function (im) {
      img = im; fileName = U.baseName(f.name); dl.disabled = false; draw();
    }, function () { info.textContent = 'That image could not be read.'; info.className = 'status-line err'; });
  }
  U.bindDrop($('rs-drop'), $('rs-file'), load);

  preset.addEventListener('change', onPreset);
  [wEl, hEl].forEach(function (e) { e.addEventListener('input', onSizeInput); });
  [fit, bg, fx, fy, fmt].forEach(function (e) { e.addEventListener('input', draw); e.addEventListener('change', draw); });
  qual.addEventListener('input', function () { $('rs-quality-val').textContent = qual.value; });

  dl.addEventListener('click', function () {
    if (!img) { return; }
    var s = size();
    U.canvasToBlob(canvas, fmt.value, qual.value / 100).then(function (blob) {
      if (!blob) { info.textContent = 'Your browser could not export this format.'; info.className = 'status-line err'; return; }
      U.download(blob, fileName + '-' + s.w + 'x' + s.h + '.' + U.extFor(blob.type));
    });
  });

  /* "Use this size" buttons in the Instagram size table */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-size]'); if (!b) { return; }
    var m = /^(\d+)x(\d+)$/.exec(b.getAttribute('data-size')); if (!m) { return; }
    wEl.value = m[1]; hEl.value = m[2]; onSizeInput();
    var t = $('tool'); if (t && t.scrollIntoView) { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  preset.value = '0'; onPreset();
})();
