/* FreeHandyly - Social Media Image Resizer (canvas, 100% client-side). */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var canvas = $('rs-canvas'); if (!canvas) { return; }
  var ctx = canvas.getContext('2d');
  var PRESETS = [
    ['YouTube thumbnail (1280 x 720)', 1280, 720],
    ['YouTube channel banner (2560 x 1440)', 2560, 1440],
    ['Instagram square post (1080 x 1080)', 1080, 1080],
    ['Instagram portrait post (1080 x 1350)', 1080, 1350],
    ['Instagram landscape post (1080 x 566)', 1080, 566],
    ['Stories, Reels, TikTok, Shorts (1080 x 1920)', 1080, 1920],
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

  function draw() {
    var s = size();
    canvas.width = s.w; canvas.height = s.h;
    ctx.clearRect(0, 0, s.w, s.h);
    if (!img) { return; }
    var mode = fit.value;
    if (mode !== 'cover' || fmt.value === 'image/jpeg') { ctx.fillStyle = bg.value; ctx.fillRect(0, 0, s.w, s.h); }
    ctx.imageSmoothingQuality = 'high';
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (mode === 'stretch') { ctx.drawImage(img, 0, 0, s.w, s.h); }
    else {
      var scale = mode === 'cover' ? Math.max(s.w / iw, s.h / ih) : Math.min(s.w / iw, s.h / ih);
      var dw = iw * scale, dh = ih * scale;
      ctx.drawImage(img, (s.w - dw) * (fx.value / 100), (s.h - dh) * (fy.value / 100), dw, dh);
    }
    info.textContent = 'Original ' + iw + ' x ' + ih + ' px  \u2192  output ' + s.w + ' x ' + s.h + ' px';
    info.className = 'status-line';
  }

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

  preset.value = '0'; onPreset();
})();
