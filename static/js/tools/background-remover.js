/* FreeHandyly - Image Background Remover.
   Methods: on-device MediaPipe selfie segmentation (people), colour flood fill (plain backgrounds / magic wand),
   erase & restore brushes, edge smoothing. All processing happens in the browser; nothing is uploaded.
   Model: a single alpha "mask" (0 = removed, 255 = kept) at working resolution; the visible cut-out is the source
   image multiplied by a (optionally smoothed) copy of the mask. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var rootEl = $('br-root'); if (!rootEl) { return; }
  var MP_BASE = rootEl.getAttribute('data-mp'), MAX_SIDE = 2400, MAX_HIST = 12;
  var statusEl = $('br-status'), app = $('br-app'), stage = $('br-stage'), canvas = $('br-canvas'), cursor = $('br-cursor');
  var ctx = canvas.getContext('2d');
  function status(msg, isErr) { statusEl.textContent = msg || ''; statusEl.className = 'status-line mt-2' + (isErr ? ' err' : ''); }

  var W = 0, H = 0, srcCanvas = null, srcData = null, outData = null, cutCanvas = null, cutCtx = null;
  var mask = null, hist = [], histPos = -1, mode = 'wand', scale = 1, fileBase = 'image', busy = false;
  var stroke = null;

  /* ------------------------------------------------------------ smoothing */
  function params() {
    var s = parseFloat($('br-smooth').value) || 0, shift = parseFloat($('br-shift').value) || 0;
    var R = Math.max(Math.round(s), Math.ceil(Math.abs(shift)));
    return { R: R, s: s, shift: shift };
  }
  /* Compute the final alpha for rows [y0,y1) x cols [x0,x1) and write it into outData. */
  function computeAlpha(x0, y0, x1, y1) {
    var P = params(), R = P.R, od = outData.data, w = x1 - x0, h = y1 - y0, x, y, i;
    if (R === 0) {
      for (y = y0; y < y1; y++) { for (x = x0; x < x1; x++) { od[(y * W + x) * 4 + 3] = mask[y * W + x]; } }
      return;
    }
    var ey0 = Math.max(0, y0 - R), ey1 = Math.min(H, y1 + R), eh = ey1 - ey0;
    var tmp = new Float32Array(w * eh), inv = 1 / (2 * R + 1);
    for (y = ey0; y < ey1; y++) {                    /* horizontal box blur */
      var row = y * W, sum = 0;
      for (i = -R; i <= R; i++) { sum += mask[row + Math.max(0, Math.min(W - 1, x0 + i))]; }
      for (x = x0; x < x1; x++) {
        tmp[(y - ey0) * w + (x - x0)] = sum * inv;
        sum += mask[row + Math.min(W - 1, x + R + 1)] - mask[row + Math.max(0, x - R)];
      }
    }
    var t = 0.5 + P.shift / (2 * R), steep = R / Math.max(P.s, 0.5);
    for (x = x0; x < x1; x++) {                      /* vertical box blur + contrast curve */
      var sum2 = 0;
      for (i = -R; i <= R; i++) { sum2 += tmp[(Math.max(ey0, Math.min(ey1 - 1, y0 + i)) - ey0) * w + (x - x0)]; }
      for (y = y0; y < y1; y++) {
        var b = sum2 * inv / 255, a = (b - t) * steep + 0.5;
        od[(y * W + x) * 4 + 3] = a <= 0 ? 0 : (a >= 1 ? 255 : Math.round(a * 255));
        sum2 += tmp[(Math.min(ey1 - 1, y + R + 1) - ey0) * w + (x - x0)] - tmp[(Math.max(ey0, y - R) - ey0) * w + (x - x0)];
      }
    }
  }
  function paint() {
    var bg = bgColor();
    canvas.style.background = bg || '';
    canvas.classList.toggle('is-checker', !bg);
    ctx.clearRect(0, 0, W, H); ctx.drawImage(cutCanvas, 0, 0);
  }
  function refresh(x0, y0, x1, y1) {
    if (x0 === undefined) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
    var pad = params().R + 1;
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
    if (x1 <= x0 || y1 <= y0) { return; }
    computeAlpha(x0, y0, x1, y1);
    cutCtx.putImageData(outData, 0, 0, x0, y0, x1 - x0, y1 - y0);
    paint();
  }
  function bgColor() {
    var v = (document.querySelector('input[name="br-bg"]:checked') || {}).value;
    if (!v || v === 'transparent') { return ''; }
    return v === 'custom' ? $('br-bgcolor').value : v;
  }

  /* -------------------------------------------------------------- history */
  function pushHist() {
    hist = hist.slice(0, histPos + 1); hist.push(mask.slice()); if (hist.length > MAX_HIST) { hist.shift(); }
    histPos = hist.length - 1; syncUi();
  }
  function restoreHist(i) { histPos = i; mask = hist[i].slice(); refresh(); syncUi(); }
  function syncUi() {
    app.querySelector('[data-act="undo"]').disabled = histPos <= 0;
    app.querySelector('[data-act="redo"]').disabled = histPos >= hist.length - 1;
    $('br-zoomlabel').textContent = Math.round(scale * 100) + '%';
    canvas.style.touchAction = 'none';
  }

  /* ----------------------------------------------------------- load image */
  function loadFile(files) {
    var f = files.filter(function (x) { return /^image\//.test(x.type); })[0];
    if (!f) { status('Please choose an image file.', true); return; }
    status('Opening image\u2026');
    U.loadImage(f).then(function (img) {
      var s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      W = Math.max(1, Math.round(img.naturalWidth * s)); H = Math.max(1, Math.round(img.naturalHeight * s));
      srcCanvas = document.createElement('canvas'); srcCanvas.width = W; srcCanvas.height = H;
      var sctx = srcCanvas.getContext('2d', { willReadFrequently: true }); sctx.drawImage(img, 0, 0, W, H);
      srcData = sctx.getImageData(0, 0, W, H);
      outData = new ImageData(new Uint8ClampedArray(srcData.data), W, H);
      cutCanvas = document.createElement('canvas'); cutCanvas.width = W; cutCanvas.height = H; cutCtx = cutCanvas.getContext('2d');
      mask = new Uint8ClampedArray(W * H);
      for (var p = 0; p < W * H; p++) { mask[p] = srcData.data[p * 4 + 3]; }
      hist = []; histPos = -1; pushHist();
      canvas.width = W; canvas.height = H; fileBase = U.baseName(f.name);
      app.hidden = false; $('br-drop').hidden = true;
      fit(); refresh();
      status('Loaded ' + W + ' x ' + H + ' px' + (s < 1 ? ' (scaled down from ' + img.naturalWidth + ' x ' + img.naturalHeight + ')' : '') + '. Try \u201CRemove background (people)\u201D, \u201CRemove plain background\u201D, or click a colour with the magic wand.');
    }, function () { status('That image could not be read.', true); });
  }
  U.bindDrop($('br-drop'), $('br-file'), loadFile);
  U.bindDrop(stage, null, loadFile);

  /* ----------------------------------------------------------------- zoom */
  function setScale(s) {
    scale = Math.max(0.1, Math.min(4, s));
    canvas.style.width = Math.round(W * scale) + 'px'; canvas.style.height = Math.round(H * scale) + 'px'; syncUi();
  }
  function fit() { setScale(Math.min(1, (stage.clientWidth - 24) / W, (Math.max(360, window.innerHeight * 0.7)) / H)); }

  /* --------------------------------------------------------- flood / wand */
  function flood(seeds, ref, tolPct, contiguous) {
    var d = srcData.data, n = W * H, thr = tolPct / 100 * 441.673, thr2 = thr * thr, removed = 0, p;
    function match(q) { var i = q * 4, dr = d[i] - ref[0], dg = d[i + 1] - ref[1], db = d[i + 2] - ref[2]; return dr * dr + dg * dg + db * db <= thr2; }
    if (!contiguous) { for (p = 0; p < n; p++) { if (mask[p] && match(p)) { mask[p] = 0; removed++; } } return removed; }
    var vis = new Uint8Array(n), stack = new Int32Array(n), sp = 0;
    seeds.forEach(function (s) { if (!vis[s] && match(s)) { vis[s] = 1; stack[sp++] = s; } });
    while (sp) {
      p = stack[--sp]; if (mask[p]) { mask[p] = 0; removed++; }
      var x = p % W, y = (p / W) | 0, q;
      if (x > 0) { q = p - 1; if (!vis[q] && match(q)) { vis[q] = 1; stack[sp++] = q; } }
      if (x < W - 1) { q = p + 1; if (!vis[q] && match(q)) { vis[q] = 1; stack[sp++] = q; } }
      if (y > 0) { q = p - W; if (!vis[q] && match(q)) { vis[q] = 1; stack[sp++] = q; } }
      if (y < H - 1) { q = p + W; if (!vis[q] && match(q)) { vis[q] = 1; stack[sp++] = q; } }
    }
    return removed;
  }
  function avgColor(cx, cy, r) {
    var d = srcData.data, sr = 0, sg = 0, sb = 0, n = 0;
    for (var y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
      for (var x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) { var i = (y * W + x) * 4; sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++; }
    }
    return [sr / n, sg / n, sb / n];
  }
  function plainBackground() {
    var d = srcData.data, ring = [], x, y, B = Math.min(3, Math.floor(Math.min(W, H) / 2));
    for (y = 0; y < H; y++) { for (x = 0; x < W; x++) { if (x < B || y < B || x >= W - B || y >= H - B) { ring.push(y * W + x); } } }
    var buckets = {}, top = null;
    ring.forEach(function (p) {
      var i = p * 4, k = (d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3), b = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; if (!top || b.n > top.n) { top = b; }
    });
    var ref = [top.r / top.n, top.g / top.n, top.b / top.n], share = top.n / ring.length;
    var seeds = ring.filter(function (p) { var i = p * 4, dr = d[i] - ref[0], dg = d[i + 1] - ref[1], db = d[i + 2] - ref[2]; return Math.sqrt(dr * dr + dg * dg + db * db) < 441.673 * (parseFloat($('br-tol').value) / 100); });
    var removed = flood(seeds, ref, parseFloat($('br-tol').value), $('br-contig').checked);
    return { removed: removed, share: share };
  }

  /* ------------------------------------------------------------- person mode */
  var segPromise = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('script')); }; document.head.appendChild(s);
    });
  }
  function getSeg() {
    if (!segPromise) {
      segPromise = loadScript(MP_BASE + 'selfie_segmentation.js').then(function () {
        var s = new window.SelfieSegmentation({ locateFile: function (f) { return MP_BASE + f; } });
        s.setOptions({ modelSelection: 0 });
        return s.initialize().then(function () { return s; });
      });
      segPromise.catch(function () { segPromise = null; });
    }
    return segPromise;
  }
  function runAI() {
    if (busy) { return; }
    busy = true; status('Loading the on-device person-detection model (about 6 MB, first time only)\u2026');
    getSeg().then(function (seg) {
      status('Finding the person\u2026');
      return new Promise(function (resolve, reject) {
        seg.onResults(resolve);
        seg.send({ image: srcCanvas }).catch(reject);
      });
    }).then(function (res) {
      var t = document.createElement('canvas'); t.width = W; t.height = H;
      var tc = t.getContext('2d', { willReadFrequently: true }); tc.drawImage(res.segmentationMask, 0, 0, W, H);
      var d = tc.getImageData(0, 0, W, H).data, minA = 255, maxA = 0, minR = 255, maxR = 0, p;
      for (p = 0; p < W * H; p += 97) { var a = d[p * 4 + 3], r = d[p * 4]; if (a < minA) { minA = a; } if (a > maxA) { maxA = a; } if (r < minR) { minR = r; } if (r > maxR) { maxR = r; } }
      var ch = (maxA - minA) > (maxR - minR) ? 3 : 0, kept = 0;
      for (p = 0; p < W * H; p++) {
        var c = d[p * 4 + ch] / 255, v = Math.max(0, Math.min(1, (c - 0.52) / 0.2));
        mask[p] = Math.min(srcData.data[p * 4 + 3], Math.round(v * 255)); if (mask[p] > 127) { kept++; }
      }
      pushHist(); refresh();
      var share = kept / (W * H);
      status(share < 0.02 ? 'No person was found in this photo. Try \u201CRemove plain background\u201D or the magic wand instead.' : 'Done. Use Erase and Restore to fine-tune, and raise Edge smoothing if the outline looks rough.', share < 0.02);
    }).catch(function () {
      status('The person-detection model could not be loaded in this browser. Use \u201CRemove plain background\u201D or the magic wand instead.', true);
    }).then(function () { busy = false; });
  }

  /* ---------------------------------------------------------------- brushes */
  function imgPoint(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  function brushRadius() { return Math.max(1, parseFloat($('br-brush').value) / 2 / scale); }
  function stamp(cx, cy, erase) {
    var R = brushRadius(), soft = Math.max(1, R * 0.35), x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(W, Math.ceil(cx + R + 1)),
        y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(H, Math.ceil(cy + R + 1));
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var dd = Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)); if (dd > R) { continue; }
        var k = Math.min(1, (R - dd) / soft), p = y * W + x;
        if (erase) { var v = Math.round(255 * (1 - k)); if (mask[p] > v) { mask[p] = v; } }
        else { var u = Math.round(255 * k); if (mask[p] < u) { mask[p] = Math.min(u, srcData.data[p * 4 + 3]); } }
      }
    }
    return [x0, y0, x1, y1];
  }
  function strokeTo(pt) {
    var erase = mode === 'erase', R = brushRadius(), step = Math.max(1, R / 4), dx = pt[0] - stroke.last[0], dy = pt[1] - stroke.last[1],
        dist = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(dist / step)), box = null;
    for (var i = 1; i <= n; i++) {
      var b = stamp(stroke.last[0] + dx * i / n, stroke.last[1] + dy * i / n, erase);
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
    }
    stroke.last = pt; refresh(box[0], box[1], box[2], box[3]);
  }
  function placeCursor(e) {
    if (mode === 'wand') { cursor.hidden = true; return; }
    var sr = stage.getBoundingClientRect(), d = parseFloat($('br-brush').value);
    cursor.hidden = false; cursor.style.width = d + 'px'; cursor.style.height = d + 'px';
    cursor.style.left = (e.clientX - sr.left + stage.scrollLeft - d / 2) + 'px'; cursor.style.top = (e.clientY - sr.top + stage.scrollTop - d / 2) + 'px';
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button > 0) { return; }
    e.preventDefault(); var pt = imgPoint(e);
    if (mode === 'wand') {
      var px = Math.max(0, Math.min(W - 1, Math.floor(pt[0]))), py = Math.max(0, Math.min(H - 1, Math.floor(pt[1])));
      var removed = flood([py * W + px], avgColor(px, py, 1), parseFloat($('br-tol').value), $('br-contig').checked);
      if (removed > 0) { pushHist(); refresh(); status('Removed ' + removed.toLocaleString('en-US') + ' pixels. Click again to remove more, or raise Tolerance.'); }
      else { status('Nothing to remove there (already transparent). Try another spot.', true); }
      return;
    }
    canvas.setPointerCapture(e.pointerId); stroke = { last: pt }; strokeTo(pt);
  });
  canvas.addEventListener('pointermove', function (e) { placeCursor(e); if (stroke) { strokeTo(imgPoint(e)); } });
  function endStroke() { if (stroke) { stroke = null; pushHist(); } }
  canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', function () { cursor.hidden = true; });

  /* ----------------------------------------------------------------- UI */
  function setMode(m) {
    mode = m;
    Array.prototype.forEach.call(app.querySelectorAll('[data-mode]'), function (b) { var on = b.getAttribute('data-mode') === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    canvas.style.cursor = m === 'wand' ? 'crosshair' : 'none'; cursor.hidden = true;
  }
  ['tol', 'brush', 'smooth', 'shift'].forEach(function (k) {
    var el = $('br-' + k);
    el.addEventListener('input', function () { $('br-' + k + '-v').textContent = el.value; if (k === 'smooth' || k === 'shift') { if (mask) { refresh(); } } });
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="br-bg"]'), function (r) { r.addEventListener('change', paint); });
  $('br-bgcolor').addEventListener('input', function () { document.querySelector('input[name="br-bg"][value="custom"]').checked = true; paint(); });

  function download() {
    if (!mask) { return; }
    var fmt = $('br-format').value, bg = bgColor();
    var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    if (bg || fmt === 'image/jpeg') { x.fillStyle = bg || '#ffffff'; x.fillRect(0, 0, W, H); }
    x.drawImage(cutCanvas, 0, 0);
    U.canvasToBlob(c, fmt, 0.95).then(function (blob) {
      if (!blob) { status('Your browser could not create the file.', true); return; }
      U.download(blob, fileBase + '-no-bg.' + U.extFor(blob.type));
      status('Downloaded ' + W + ' x ' + H + ' px ' + (blob.type === 'image/png' ? 'PNG' : 'JPG') + ' (' + U.formatBytes(blob.size) + ').' + (fmt === 'image/jpeg' && !bg ? ' JPG cannot be transparent, so white was used.' : ''));
    });
  }

  var actions = {
    ai: runAI,
    plain: function () {
      var r = plainBackground();
      if (r.removed === 0) { status('No background colour was detected around the edges. Try the magic wand.', true); return; }
      pushHist(); refresh();
      status(r.share < 0.35 ? 'Removed the edge colour, but the background is not a single colour, so the result may be partial. Use the magic wand and brushes to finish.' : 'Removed the plain background. Adjust Tolerance and press the button again, or use the brushes to finish.', r.share < 0.35);
    },
    undo: function () { if (histPos > 0) { restoreHist(histPos - 1); } },
    redo: function () { if (histPos < hist.length - 1) { restoreHist(histPos + 1); } },
    reset: function () { for (var p = 0; p < W * H; p++) { mask[p] = srcData.data[p * 4 + 3]; } pushHist(); refresh(); status('Reset to the original photo.'); },
    fit: fit,
    zoomin: function () { setScale(scale * 1.25); },
    zoomout: function () { setScale(scale / 1.25); },
    open: function () { $('br-file').click(); },
    download: download
  };
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act],[data-mode]'); if (!b || b.disabled) { return; }
    if (b.hasAttribute('data-mode')) { setMode(b.getAttribute('data-mode')); return; }
    var fn = actions[b.getAttribute('data-act')]; if (fn) { fn(); }
  });
  document.addEventListener('keydown', function (e) {
    if (app.hidden) { return; }
    var tag = (e.target && e.target.tagName) || ''; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) { actions.redo(); } else { actions.undo(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); actions.redo(); }
  });
  setMode('wand');
  window.FHBgRemover = { state: function () { return { W: W, H: H, kept: mask ? mask.reduce(function (s, v) { return s + (v > 127 ? 1 : 0); }, 0) : 0 }; } };
})();
