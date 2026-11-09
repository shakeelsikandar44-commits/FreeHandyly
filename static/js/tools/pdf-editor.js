/* FreeHandyly - PDF Editor.
   Rendering: pdf.js. Export: pdf-lib. Everything runs in the browser; files are never uploaded.
   Coordinate model: every annotation is stored in "base page space" = the page as displayed at its
   original /Rotate, in PDF points, origin top-left, y down. The user rotation is applied on top. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var root = $('pe-root'); if (!root) { return; }
  var pdfjs = window.pdfjsLib, PL = window.PDFLib;
  var statusEl = $('pe-status');
  function status(msg, isErr) { statusEl.textContent = msg || ''; statusEl.className = 'status-line mt-2' + (isErr ? ' err' : ''); }
  if (!pdfjs || !PL) { status('The editor engine failed to load. Please reload the page.', true); return; }
  /* pdf.js needs its worker file. Try the local copy first, then CDNs; each is fetched and wrapped in a Blob URL so it also works
     inside sandboxed/preview frames and when the server answers a missing file with an HTML 404 page. */
  var WORKER_URLS = [root.getAttribute('data-worker'),
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'].filter(Boolean);
  var workerReady = null;
  function ensureWorker() {
    if (workerReady) { return workerReady; }
    var i = 0;
    function tryNext() {
      if (i >= WORKER_URLS.length) { return Promise.reject(new Error('worker')); }
      var url = WORKER_URLS[i++];
      return fetch(url).then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      }).then(function (code) {
        if (code.length < 10000 || code.trim().charAt(0) === '<') { throw new Error('not a script'); }
        pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      }).catch(function () { return tryNext(); });
    }
    workerReady = tryNext().catch(function (e) { workerReady = null; throw e; });
    return workerReady;
  }


  var app = $('pe-app'), stage = $('pe-stage'), sheet = $('pe-sheet'), canvas = $('pe-canvas'), overlay = $('pe-overlay'),
      thumbsEl = $('pe-thumbs');
  var elColor = $('pe-color'), elSize = $('pe-size'), elWidth = $('pe-width'), elFont = $('pe-font'), elBold = $('pe-bold'), elFill = $('pe-fill');

  /* ------------------------------------------------------------------ state */
  var srcBytes = null, pdfDoc = null, pdfPages = [], fileName = 'document';
  var pages = [];                 // [{id, src (index or null for blank), w, h, rot, annots:[]}]
  var images = {};                // id -> {bytes, el, w, h}
  var cur = 0, zoom = 1, tool = 'select', sel = null, draft = null, drag = null, editing = null;
  var nextId = 1, hist = [], histPos = -1, dirty = false, forceRaster = false, lastRaster = false;
  var props = { color: '#E5322D', size: 18, width: 3, font: 'Helvetica', bold: false, fill: false };
  var toolColors = { hl: '#FFD400' };
  var BOX_TYPES = ['rect', 'ellipse', 'hl', 'white', 'img'];
  var thumbCache = {}, thumbTok = 0, renderTok = 0;
  var runsReady = {}, runsLoading = {}, runNotice = {}, hoverRun = null;

  function uid() { return nextId++; }
  function isPdf(f) { return /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name); }
  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(file);
    });
  }

  /* ------------------------------------------------- geometry (base <-> view) */
  function viewDims(p) { var sw = p.rot % 180 === 0 ? p.w : p.h, sh = p.rot % 180 === 0 ? p.h : p.w; return { w: sw * zoom, h: sh * zoom }; }
  function toView(p, x, y) {
    var W = p.w, H = p.h, vx, vy;
    switch (p.rot) {
      case 0: vx = x; vy = y; break;
      case 90: vx = H - y; vy = x; break;
      case 180: vx = W - x; vy = H - y; break;
      default: vx = y; vy = W - x;
    }
    return [vx * zoom, vy * zoom];
  }
  function fromView(p, vx, vy) {
    vx /= zoom; vy /= zoom;
    var W = p.w, H = p.h;
    switch (p.rot) {
      case 0: return [vx, vy];
      case 90: return [vy, H - vx];
      case 180: return [W - vx, H - vy];
      default: return [W - vy, vx];
    }
  }

  /* ------------------------------------------------------------- annotations */
  var measureCtx = document.createElement('canvas').getContext('2d');
  function fontCss(a) {
    var fam = a.font === 'Times' ? '"Times New Roman", Times, serif' : (a.font === 'Courier' ? '"Courier New", Courier, monospace' : 'Helvetica, Arial, sans-serif');
    return (a.italic ? 'italic ' : '') + (a.bold ? 'bold ' : '') + a.size + 'px ' + fam;
  }
  function textLines(a) { return String(a.text).split(/\r?\n/); }
  function textBox(a) {
    measureCtx.font = fontCss(a);
    var w = 0; textLines(a).forEach(function (l) { w = Math.max(w, measureCtx.measureText(l).width); });
    return { x1: a.x, y1: a.y, x2: a.x + Math.max(w, a.size * 0.6), y2: a.y + textLines(a).length * a.size * 1.2 };
  }
  function bbox(a) {
    switch (a.t) {
      case 'text': return textBox(a);
      case 'ink':
        var xs = a.pts.map(function (q) { return q[0]; }), ys = a.pts.map(function (q) { return q[1]; }), pad = a.width / 2;
        return { x1: Math.min.apply(null, xs) - pad, y1: Math.min.apply(null, ys) - pad, x2: Math.max.apply(null, xs) + pad, y2: Math.max.apply(null, ys) + pad };
      default:
        return { x1: Math.min(a.x1, a.x2), y1: Math.min(a.y1, a.y2), x2: Math.max(a.x1, a.x2), y2: Math.max(a.y1, a.y2) };
    }
  }
  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function hit(a, x, y) {
    var tol = 6 / zoom;
    if (a.t === 'ink') {
      for (var i = 1; i < a.pts.length; i++) { if (distSeg(x, y, a.pts[i - 1][0], a.pts[i - 1][1], a.pts[i][0], a.pts[i][1]) <= a.width / 2 + tol) { return true; } }
      return a.pts.length === 1 && Math.hypot(x - a.pts[0][0], y - a.pts[0][1]) <= a.width / 2 + tol;
    }
    if (a.t === 'line') { return distSeg(x, y, a.x1, a.y1, a.x2, a.y2) <= a.width / 2 + tol; }
    var b = bbox(a);
    return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
  }
  function shift(a, dx, dy) {
    if (a.t === 'text') { a.x += dx; a.y += dy; }
    else if (a.t === 'ink') { a.pts = a.pts.map(function (q) { return [q[0] + dx, q[1] + dy]; }); }
    else { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; }
  }
  function findSel() { var p = pages[cur]; if (!p || !sel) { return null; } for (var i = 0; i < p.annots.length; i++) { if (p.annots[i].id === sel) { return p.annots[i]; } } return null; }

  /* ---------------------------------------------------------------- drawing */
  function polyPath(ctx, p, pts) {
    ctx.beginPath();
    pts.forEach(function (q, i) { var v = toView(p, q[0], q[1]); if (i) { ctx.lineTo(v[0], v[1]); } else { ctx.moveTo(v[0], v[1]); } });
  }
  function ellipsePts(a) {
    var cx = (a.x1 + a.x2) / 2, cy = (a.y1 + a.y2) / 2, rx = Math.abs(a.x2 - a.x1) / 2, ry = Math.abs(a.y2 - a.y1) / 2, out = [];
    for (var i = 0; i < 72; i++) { var t = i / 72 * Math.PI * 2; out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
    return out;
  }
  function rectPts(a) { return [[a.x1, a.y1], [a.x2, a.y1], [a.x2, a.y2], [a.x1, a.y2]]; }
  function anchored(ctx, p, x, y, fn) {
    var o = toView(p, x, y);
    ctx.save(); ctx.translate(o[0], o[1]); ctx.rotate(p.rot * Math.PI / 180); ctx.scale(zoom, zoom); fn(); ctx.restore();
  }
  function drawAnnot(ctx, p, a) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (a.t) {
      case 'text':
        anchored(ctx, p, a.x, a.y, function () {
          ctx.fillStyle = a.color; ctx.font = fontCss(a); ctx.textBaseline = 'alphabetic';
          textLines(a).forEach(function (l, i) { ctx.fillText(l, 0, a.size * 0.82 + i * a.size * 1.2); });
        });
        break;
      case 'ink':
        ctx.strokeStyle = a.color; ctx.lineWidth = a.width * zoom; ctx.beginPath();
        a.pts.forEach(function (q, i) { var v = toView(p, q[0], q[1]); if (i) { ctx.lineTo(v[0], v[1]); } else { ctx.moveTo(v[0], v[1]); } });
        if (a.pts.length === 1) { var v0 = toView(p, a.pts[0][0], a.pts[0][1]); ctx.lineTo(v0[0] + 0.01, v0[1]); }
        ctx.stroke();
        break;
      case 'line':
        ctx.strokeStyle = a.color; ctx.lineWidth = a.width * zoom; polyPath(ctx, p, [[a.x1, a.y1], [a.x2, a.y2]]); ctx.stroke();
        break;
      case 'rect': case 'ellipse':
        polyPath(ctx, p, a.t === 'rect' ? rectPts(a) : ellipsePts(a)); ctx.closePath();
        if (a.fill) { ctx.fillStyle = a.color; ctx.fill(); }
        ctx.strokeStyle = a.color; ctx.lineWidth = a.width * zoom; ctx.stroke();
        break;
      case 'hl':
        polyPath(ctx, p, rectPts(a)); ctx.closePath(); ctx.globalAlpha = 0.38; ctx.fillStyle = a.color; ctx.fill();
        break;
      case 'white':
        polyPath(ctx, p, rectPts(a)); ctx.closePath(); ctx.fillStyle = a.bg || '#ffffff'; ctx.fill();
        break;
      case 'img':
        var im = images[a.img];
        if (im) { anchored(ctx, p, Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), function () { ctx.drawImage(im.el, 0, 0, Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1)); }); }
        break;
    }
    ctx.restore();
  }
  function drawOverlay() {
    var p = pages[cur]; if (!p) { return; }
    var ctx = overlay.getContext('2d'), dpr = overlay.width / (parseFloat(overlay.style.width) || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, overlay.width, overlay.height);
    p.annots.forEach(function (a) { if (!(editing && editing.a.id === a.id)) { drawAnnot(ctx, p, a); } });
    if (draft) { drawAnnot(ctx, p, draft); }
    if (hoverRun && tool === 'text' && !editing) {
      ctx.save(); polyPath(ctx, p, [[hoverRun.x1, hoverRun.y1], [hoverRun.x2, hoverRun.y1], [hoverRun.x2, hoverRun.y2], [hoverRun.x1, hoverRun.y2]]); ctx.closePath();
      ctx.fillStyle = 'rgba(10,99,232,.10)'; ctx.fill(); ctx.strokeStyle = 'rgba(10,99,232,.8)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    var s = findSel();
    if (s && !(editing && editing.a.id === s.id)) {
      var b = bbox(s), pad = 3 / zoom, bx = { x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad };
      ctx.save(); ctx.strokeStyle = '#0A63E8'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      polyPath(ctx, p, rectPts(bx)); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      if (BOX_TYPES.indexOf(s.t) !== -1) {
        var h = toView(p, bx.x2, bx.y2); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0A63E8'; ctx.lineWidth = 2;
        ctx.fillRect(h[0] - 6, h[1] - 6, 12, 12); ctx.strokeRect(h[0] - 6, h[1] - 6, 12, 12);
      }
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------------- render */
  var renderTask = null;
  function renderPage() {
    var p = pages[cur]; if (!p) { return; }
    var d = viewDims(p), dpr = Math.min(2, window.devicePixelRatio || 1), tok = ++renderTok;
    hoverRun = null;
    sheet.style.width = d.w + 'px'; sheet.style.height = d.h + 'px';
    [canvas, overlay].forEach(function (c) {
      c.width = Math.max(1, Math.round(d.w * dpr)); c.height = Math.max(1, Math.round(d.h * dpr));
      c.style.width = d.w + 'px'; c.style.height = d.h + 'px';
    });
    var ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawOverlay();
    if (renderTask) { try { renderTask.cancel(); } catch (e) { /* ignore */ } renderTask = null; }
    if (p.src === null) { return; }
    var page = pdfPages[p.src], vp = page.getViewport({ scale: zoom * dpr, rotation: (page.rotate + p.rot) % 360 });
    var tmp = document.createElement('canvas'); tmp.width = Math.round(vp.width); tmp.height = Math.round(vp.height);
    var tctx = tmp.getContext('2d'); tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, tmp.width, tmp.height);
    var task = page.render({ canvasContext: tctx, viewport: vp }); renderTask = task;
    task.promise.then(function () {
      if (tok !== renderTok) { return; }
      var c2 = canvas.getContext('2d'); c2.setTransform(1, 0, 0, 1, 0, 0); c2.drawImage(tmp, 0, 0, canvas.width, canvas.height); ensureRuns(p);
    }, function () { /* cancelled */ });
  }

  function paintThumb(p, c) {
    var tw = 92, vw = p.rot % 180 === 0 ? p.w : p.h, vh = p.rot % 180 === 0 ? p.h : p.w, s = tw / vw;
    c.width = tw; c.height = Math.max(1, Math.round(vh * s));
    var ctx = c.getContext('2d'), key = p.id + '|' + p.rot + '|' + p.src;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    if (thumbCache[key]) { ctx.drawImage(thumbCache[key], 0, 0, c.width, c.height); return Promise.resolve(); }
    if (p.src === null) { return Promise.resolve(); }
    var page = pdfPages[p.src], vp = page.getViewport({ scale: s, rotation: (page.rotate + p.rot) % 360 });
    return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
      var copy = document.createElement('canvas'); copy.width = c.width; copy.height = c.height; copy.getContext('2d').drawImage(c, 0, 0); thumbCache[key] = copy;
    }, function () { /* ignore */ });
  }
  function buildThumbs() {
    var tok = ++thumbTok, canvases = [];
    thumbsEl.textContent = '';
    pages.forEach(function (p, i) {
      var b = U.el('button', { type: 'button', 'class': 'pe-thumb' + (i === cur ? ' on' : '') + (p.annots.length ? ' edited' : ''), 'aria-label': 'Go to page ' + (i + 1) });
      var c = document.createElement('canvas'); canvases.push(c); b.appendChild(c); b.appendChild(U.el('span', { 'class': 'pe-thumb-n' }, String(i + 1)));
      b.addEventListener('click', function () { goTo(i); });
      thumbsEl.appendChild(b);
    });
    var chain = Promise.resolve();
    pages.forEach(function (p, i) { chain = chain.then(function () { if (tok === thumbTok) { return paintThumb(p, canvases[i]); } }); });
  }
  function markThumbs() {
    Array.prototype.forEach.call(thumbsEl.children, function (b, i) {
      b.classList.toggle('on', i === cur); b.classList.toggle('edited', !!(pages[i] && pages[i].annots.length));
    });
    var on = thumbsEl.children[cur]; if (on && on.scrollIntoView) { on.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }

  /* ------------------------------------------------------------------ UI */
  function updateUi() {
    $('pe-pagelabel').textContent = 'Page ' + (cur + 1) + ' of ' + pages.length;
    $('pe-zoomlabel').textContent = Math.round(zoom * 100) + '%';
    app.querySelector('[data-act="undo"]').disabled = histPos <= 0;
    app.querySelector('[data-act="redo"]').disabled = histPos >= hist.length - 1;
    app.querySelector('[data-act="del"]').disabled = !sel;
    overlay.style.cursor = tool === 'select' ? 'default' : (tool === 'text' ? 'text' : 'crosshair');
    overlay.style.touchAction = (tool === 'select' || tool === 'text') ? 'auto' : 'none';
  }
  function syncProps(a) {
    if (a.color && a.t !== 'white') { elColor.value = a.color.toLowerCase(); props.color = a.color; }
    if (a.t === 'text') { elSize.value = a.size; props.size = a.size; elFont.value = a.font; props.font = a.font; elBold.checked = !!a.bold; props.bold = !!a.bold; }
    if (a.width) { elWidth.value = a.width; props.width = a.width; }
    if (a.t === 'rect' || a.t === 'ellipse') { elFill.checked = !!a.fill; props.fill = !!a.fill; }
  }
  function snapshot() { return JSON.stringify(pages); }
  function pushHist() {
    hist = hist.slice(0, histPos + 1); hist.push(snapshot()); if (hist.length > 60) { hist.shift(); }
    histPos = hist.length - 1;
  }
  function commit() { pushHist(); dirty = histPos > 0; markThumbs(); updateUi(); }
  function restore(i) {
    histPos = i; pages = JSON.parse(hist[i]); cur = Math.min(cur, pages.length - 1); sel = null; closeEditor(true);
    dirty = histPos > 0; buildThumbs(); renderPage(); updateUi();
  }
  function setTool(t) {
    closeEditor();
    tool = t; sel = (t === 'select') ? sel : null;
    Array.prototype.forEach.call(app.querySelectorAll('[data-tool]'), function (b) { var on = b.getAttribute('data-tool') === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    if (t === 'hl') { elColor.value = toolColors.hl.toLowerCase(); props.color = toolColors.hl; }
    else if (props.color === toolColors.hl && t !== 'select') { props.color = '#E5322D'; elColor.value = '#e5322d'; }
    drawOverlay(); updateUi();
  }
  function goTo(i) {
    if (i < 0 || i >= pages.length) { return; }
    closeEditor(); cur = i; sel = null; markThumbs(); renderPage(); updateUi();
  }
  function fitZoom() {
    var p = pages[cur]; if (!p) { return; }
    var vw = p.rot % 180 === 0 ? p.w : p.h, avail = Math.max(200, stage.clientWidth - 28);
    zoom = Math.max(0.25, Math.min(3, avail / vw));
  }
  function setZoom(z) { zoom = Math.max(0.25, Math.min(4, z)); closeEditor(); renderPage(); updateUi(); }

  /* ---------------------------------------------------------- text editor */
  var WINANSI = /^[\n\r\t\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]*$/;
  function openTextEditor(x, y, existing) {
    closeEditor();
    var p = pages[cur];
    var a = existing || { id: 0, t: 'text', x: x, y: y, text: '', size: props.size, color: props.color, font: props.font, bold: props.bold };
    var ta = document.createElement('textarea'); ta.className = 'pe-text-input'; ta.value = a.text; ta.rows = 1; ta.placeholder = 'Type, then press Enter'; ta.setAttribute('aria-label', 'Type your text. Press Enter to finish, Shift+Enter for a new line.');
    var o = toView(p, a.x, a.y);
    ta.style.left = o[0] + 'px'; ta.style.top = o[1] + 'px'; ta.style.fontSize = (a.size * zoom) + 'px'; ta.style.color = a.color;
    ta.style.fontFamily = a.font === 'Times' ? '"Times New Roman", Times, serif' : (a.font === 'Courier' ? '"Courier New", Courier, monospace' : 'Helvetica, Arial, sans-serif');
    ta.style.fontWeight = a.bold ? '700' : '400'; ta.style.transform = 'rotate(' + p.rot + 'deg)'; ta.style.lineHeight = '1.2';
    function grow() { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; ta.style.width = Math.max(140, ta.scrollWidth + 24) + 'px'; }
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { closeEditor(true); drawOverlay(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    });
    ta.addEventListener('blur', function () { if (editing && editing.ta === ta) { finishEditor(); } });
    sheet.appendChild(ta); editing = { a: a, ta: ta, isNew: !existing }; grow(); ta.focus();
    if (existing) { ta.select(); drawOverlay(); }
  }
  function closeEditor(discard) {
    if (!editing) { return; }
    var e = editing; editing = null;
    if (!discard && (e.run || e.ta.value.trim() !== '')) { applyEditor(e); }
    if (e.ta.parentNode) { e.ta.parentNode.removeChild(e.ta); }
  }
  function finishEditor() { var e = editing; editing = null; applyEditor(e); if (e.ta.parentNode) { e.ta.parentNode.removeChild(e.ta); } drawOverlay(); }
  function applyEditor(e) {
    if (e.run) { applyRunEdit(e); return; }
    var text = e.ta.value.replace(/\s+$/, ''), p = pages[cur];
    if (!text) {
      if (!e.isNew) { p.annots = p.annots.filter(function (a) { return a.id !== e.a.id; }); sel = null; commit(); }
      return;
    }
    if (!WINANSI.test(text)) { status('Some characters are not supported by the built-in fonts and will appear as ? in the download. Use Draw or Image for other scripts.', true); }
    e.a.text = text;
    if (e.isNew) { e.a.id = uid(); p.annots.push(e.a); sel = e.a.id; }
    commit();
  }


  /* ------------------------------------------- edit existing text (Sejda-style) */
  var LIG = [[/\uFB00/g, 'ff'], [/\uFB01/g, 'fi'], [/\uFB02/g, 'fl'], [/\uFB03/g, 'ffi'], [/\uFB04/g, 'ffl'], [/\u2212/g, '-'], [/[\u200B-\u200D\uFEFF]/g, '']];
  function fontPick(name, fam) {
    var n = String(name || '');
    if (/courier|mono|consolas|menlo|typewriter/i.test(n)) { return 'Courier'; }
    if (/times|serif|georgia|garamond|palatino|minion|cambria|bookman|century/i.test(n) && !/sans/i.test(n)) { return 'Times'; }
    return fam === 'monospace' ? 'Courier' : (fam === 'serif' ? 'Times' : 'Helvetica');
  }
  function buildRuns(srcIdx) {
    var page = pdfPages[srcIdx], vp = page.getViewport({ scale: 1, rotation: page.rotate });
    return page.getTextContent().then(function (tc) {
      var items = [];
      tc.items.forEach(function (it) {
        if (typeof it.str !== 'string' || !it.transform || !(it.width > 0)) { return; }
        var t = it.transform, size = Math.hypot(t[2], t[3]), st = (tc.styles && tc.styles[it.fontName]) || {};
        if (!(size >= 2) || st.vertical) { return; }
        var p0 = vp.convertToViewportPoint(t[4], t[5]), p1 = vp.convertToViewportPoint(t[4] + it.width, t[5]), dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        if (dx <= 0 || Math.abs(dy) > 0.06 * dx) { return; }
        var fname = '';
        try { var fo = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; fname = (fo && fo.name) || ''; } catch (err) { fname = ''; }
        var s = it.str; LIG.forEach(function (l) { s = s.replace(l[0], l[1]); });
        items.push({ str: s, x: p0[0], y: p0[1], w: dx, size: size, font: fontPick(fname, st.fontFamily), bold: /bold|black|heavy|demi/i.test(fname), italic: /italic|oblique/i.test(fname),
          asc: Math.min(1.1, Math.max(0.7, st.ascent || 0.9)), desc: Math.max(-0.4, Math.min(-0.1, st.descent || -0.22)) });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      var lines = [];
      items.forEach(function (it) {
        var L = lines[lines.length - 1];
        if (L && Math.abs(it.y - L.y) < 0.3 * Math.min(it.size, L.size)) { L.items.push(it); } else { lines.push({ y: it.y, size: it.size, items: [it] }); }
      });
      var runs = [];
      lines.forEach(function (L) {
        L.items.sort(function (a, b) { return a.x - b.x; });
        var cur = null;
        L.items.forEach(function (it) {
          if (cur) {
            var gap = it.x - (cur.x + cur.w), same = Math.max(it.size, cur.size) / Math.min(it.size, cur.size) < 1.25 && it.bold === cur.bold && it.italic === cur.italic && it.font === cur.font;
            if (same && gap < 1.0 * cur.size && gap > -0.6 * cur.size) {
              if (gap > 0.18 * cur.size && !/\s$/.test(cur.str) && !/^\s/.test(it.str)) { cur.str += ' '; }
              cur.str += it.str; cur.w = it.x + it.w - cur.x; return;
            }
            runs.push(cur);
          }
          cur = { str: it.str, x: it.x, base: it.y, w: it.w, size: it.size, font: it.font, bold: it.bold, italic: it.italic, asc: it.asc, desc: it.desc };
        });
        if (cur) { runs.push(cur); }
      });
      return runs.filter(function (r) { return r.str.trim() !== ''; }).map(function (r, i) {
        r.str = r.str.replace(/\s+$/, ''); r.size = Math.round(r.size * 10) / 10;
        r.x1 = r.x - 1; r.x2 = r.x + r.w + 1; r.y1 = r.base - r.asc * r.size - 0.5; r.y2 = r.base - r.desc * r.size + 0.5; r.key = srcIdx + ':' + i;
        return r;
      });
    });
  }
  function ensureRuns(p) {
    if (!p || p.src === null || runsReady[p.src] || runsLoading[p.src]) { return; }
    var src = p.src;
    runsLoading[src] = buildRuns(src).then(function (list) {
      runsReady[src] = list; delete runsLoading[src];
      if (!list.length && !runNotice[src] && tool === 'text' && pages[cur] && pages[cur].src === src) {
        runNotice[src] = 1; status('No editable text found on this page (it may be a scanned image). You can still add new text, or use Whiteout to cover old content.');
      }
    }, function () { runsReady[src] = []; delete runsLoading[src]; });
  }
  function replaced(p, r) { return p.annots.some(function (a) { return a.t === 'white' && a.runKey === r.key; }); }
  function runAt(x, y) {
    var p = pages[cur]; if (!p || p.src === null) { return null; }
    var list = runsReady[p.src]; if (!list) { return null; }
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (x >= r.x1 - 2 && x <= r.x2 + 2 && y >= r.y1 - 1 && y <= r.y2 + 1 && !replaced(p, r)) { return r; }
    }
    return null;
  }
  function sampleRun(r) {
    var p = pages[cur], dpr = canvas.width / (parseFloat(canvas.style.width) || 1), res = { bg: '#ffffff', fg: '#000000' };
    var a = toView(p, r.x1, r.y1), b = toView(p, r.x2, r.y2);
    var x = Math.max(0, Math.floor(Math.min(a[0], b[0]) * dpr)), y = Math.max(0, Math.floor(Math.min(a[1], b[1]) * dpr));
    var w = Math.min(canvas.width - x, Math.ceil(Math.abs(b[0] - a[0]) * dpr)), h = Math.min(canvas.height - y, Math.ceil(Math.abs(b[1] - a[1]) * dpr));
    if (w < 2 || h < 2) { return res; }
    var d; try { d = canvas.getContext('2d').getImageData(x, y, w, h).data; } catch (err) { return res; }
    var rs = [], gs = [], bs = [];
    function px(ix, iy) { var o = (iy * w + ix) * 4; rs.push(d[o]); gs.push(d[o + 1]); bs.push(d[o + 2]); }
    var i, j;
    for (i = 0; i < w; i++) { px(i, 0); px(i, h - 1); }
    for (j = 0; j < h; j++) { px(0, j); px(w - 1, j); }
    function med(arr) { arr.sort(function (m, n) { return m - n; }); return arr[arr.length >> 1]; }
    var bgc = [med(rs), med(gs), med(bs)], best = 0, fgc = [0, 0, 0];
    for (var k = 0; k < d.length; k += 4) {
      var dist = Math.abs(d[k] - bgc[0]) + Math.abs(d[k + 1] - bgc[1]) + Math.abs(d[k + 2] - bgc[2]);
      if (dist > best) { best = dist; fgc = [d[k], d[k + 1], d[k + 2]]; }
    }
    function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
    res.bg = hex(bgc);
    if (best > 120) { res.fg = Math.max(fgc[0], fgc[1], fgc[2]) < 70 ? '#000000' : hex(fgc); }
    else { res.fg = (bgc[0] + bgc[1] + bgc[2]) / 3 < 128 ? '#ffffff' : '#000000'; }
    return res;
  }
  function openRunEditor(r) {
    closeEditor();
    if (!WINANSI.test(r.str)) { status('This text uses characters (for example Arabic, Urdu or Chinese) that the built-in fonts cannot write, so it cannot be edited here. Use Whiteout to cover it and add new text instead.', true); return; }
    var p = pages[cur], s = sampleRun(r); r.bg = s.bg; r.fg = s.fg;
    var o = toView(p, r.x1, r.y1), ta = document.createElement('textarea'), st = ta.style, hpx = (r.y2 - r.y1) * zoom;
    ta.className = 'pe-text-input'; ta.value = r.str; ta.rows = 1; ta.wrap = 'off'; ta.setAttribute('aria-label', 'Edit this text. Press Enter to apply, Escape to cancel.');
    st.left = o[0] + 'px'; st.top = o[1] + 'px'; st.fontSize = (r.size * zoom) + 'px'; st.color = r.fg; st.background = r.bg;
    st.fontFamily = r.font === 'Times' ? '"Times New Roman", Times, serif' : (r.font === 'Courier' ? '"Courier New", Courier, monospace' : 'Helvetica, Arial, sans-serif');
    st.fontWeight = r.bold ? '700' : '400'; st.fontStyle = r.italic ? 'italic' : 'normal'; st.transform = 'rotate(' + p.rot + 'deg)';
    st.lineHeight = hpx + 'px'; st.height = hpx + 'px'; st.padding = '0'; st.border = '0'; st.borderRadius = '0'; st.outline = '1.5px dashed #0A63E8'; st.outlineOffset = '1px';
    st.whiteSpace = 'pre'; st.minWidth = '40px'; st.width = Math.max(40, (r.x2 - r.x1) * zoom + 8) + 'px';
    function grow() {
      st.width = Math.max((r.x2 - r.x1) * zoom + 8, ta.scrollWidth + 8) + 'px';
      if (ta.value.indexOf('\n') !== -1) { st.height = 'auto'; st.height = ta.scrollHeight + 'px'; } else { st.height = hpx + 'px'; }
    }
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { closeEditor(true); drawOverlay(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    });
    ta.addEventListener('blur', function () { if (editing && editing.ta === ta) { finishEditor(); } });
    sheet.appendChild(ta); editing = { a: { id: 0 }, ta: ta, isNew: false, run: r }; hoverRun = null; drawOverlay(); ta.focus(); ta.select();
  }
  function applyRunEdit(e) {
    var r = e.run, p = pages[cur], text = e.ta.value.replace(/\s+$/, '');
    hoverRun = null;
    if (text === r.str) { return; }
    if (!WINANSI.test(text)) { status('Some characters are not supported by the built-in fonts and will appear as ? in the download. Use Draw or Image for other scripts.', true); }
    p.annots.push({ id: uid(), t: 'white', x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, bg: r.bg || '#ffffff', runKey: r.key });
    if (text) {
      var a = { id: uid(), t: 'text', x: r.x, y: r.base - r.size * 0.82, text: text, size: r.size, color: r.fg || '#000000', font: r.font, bold: r.bold, italic: r.italic, runKey: r.key };
      p.annots.push(a); sel = a.id; syncProps(a);
    } else { sel = null; }
    commit();
  }
  function coveredText() { return pages.some(function (p) { return p.annots.some(function (a) { return a.t === 'white' && a.runKey; }); }); }
  overlay.addEventListener('pointerleave', function () { if (hoverRun) { hoverRun = null; drawOverlay(); } });

  /* -------------------------------------------------------------- pointer */
  function pointerBase(e) { var r = overlay.getBoundingClientRect(); return fromView(pages[cur], e.clientX - r.left, e.clientY - r.top); }
  function topHit(x, y) { var p = pages[cur]; for (var i = p.annots.length - 1; i >= 0; i--) { if (hit(p.annots[i], x, y)) { return p.annots[i]; } } return null; }
  function onHandle(e) {
    var s = findSel(); if (!s || BOX_TYPES.indexOf(s.t) === -1) { return false; }
    var p = pages[cur], b = bbox(s), pad = 3 / zoom, h = toView(p, b.x2 + pad, b.y2 + pad), r = overlay.getBoundingClientRect();
    return Math.abs(e.clientX - r.left - h[0]) <= 10 && Math.abs(e.clientY - r.top - h[1]) <= 10;
  }
  overlay.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button > 0) { return; }
    var p = pages[cur]; if (!p) { return; }
    var pt = pointerBase(e), x = pt[0], y = pt[1];
    if (tool === 'select') {
      if (onHandle(e)) { drag = { mode: 'resize', a: findSel() }; overlay.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      var a = topHit(x, y);
      sel = a ? a.id : null;
      if (a) { syncProps(a); drag = { mode: 'move', a: a, lx: x, ly: y, moved: false }; overlay.setPointerCapture(e.pointerId); e.preventDefault(); }
      drawOverlay(); updateUi(); return;
    }
    e.preventDefault();
    if (tool === 'text') {
      var t = topHit(x, y);
      if (t && t.t === 'text') { sel = t.id; openTextEditor(0, 0, t); return; }
      var rr = runAt(x, y);
      if (rr) { sel = null; hoverRun = null; openRunEditor(rr); } else { openTextEditor(x, y, null); }
      return;
    }
    overlay.setPointerCapture(e.pointerId);
    var base = { id: 0, t: tool, color: props.color, width: props.width };
    if (tool === 'ink') { draft = { id: 0, t: 'ink', color: props.color, width: props.width, pts: [[x, y]] }; }
    else if (tool === 'line') { draft = { id: 0, t: 'line', color: props.color, width: props.width, x1: x, y1: y, x2: x, y2: y }; }
    else {
      draft = { id: 0, t: tool, color: tool === 'hl' ? props.color : props.color, width: props.width, fill: tool === 'rect' || tool === 'ellipse' ? props.fill : false, x1: x, y1: y, x2: x, y2: y };
    }
    void base; drawOverlay();
  });
  overlay.addEventListener('pointermove', function (e) {
    var p = pages[cur]; if (!p) { return; }
    var pt = pointerBase(e), x = pt[0], y = pt[1];
    if (drag) {
      if (drag.mode === 'move') { shift(drag.a, x - drag.lx, y - drag.ly); drag.lx = x; drag.ly = y; drag.moved = true; }
      else { var a = drag.a; a.x2 = Math.max(Math.min(a.x1, a.x2) + 6, x); a.y2 = Math.max(Math.min(a.y1, a.y2) + 6, y); a.x1 = Math.min(a.x1, a.x2); a.y1 = Math.min(a.y1, a.y2); drag.moved = true; }
      drawOverlay(); return;
    }
    if (!draft) {
      if (tool === 'text' && !editing) { var hr = runAt(x, y); if (hr !== hoverRun) { hoverRun = hr; drawOverlay(); } }
      return;
    }
    if (draft.t === 'ink') { var last = draft.pts[draft.pts.length - 1]; if (Math.hypot(x - last[0], y - last[1]) > 0.8 / zoom) { draft.pts.push([x, y]); } }
    else { draft.x2 = x; draft.y2 = y; }
    drawOverlay();
  });
  function endPointer(e) {
    if (drag) { var moved = drag.moved; drag = null; if (moved) { commit(); } drawOverlay(); return; }
    if (!draft) { return; }
    var d = draft; draft = null;
    var ok = true;
    if (d.t === 'ink') { ok = d.pts.length >= 1; }
    else if (d.t === 'line') { ok = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 3; }
    else { ok = Math.abs(d.x2 - d.x1) > 3 && Math.abs(d.y2 - d.y1) > 3; if (ok) { var nx1 = Math.min(d.x1, d.x2), nx2 = Math.max(d.x1, d.x2), ny1 = Math.min(d.y1, d.y2), ny2 = Math.max(d.y1, d.y2); d.x1 = nx1; d.x2 = nx2; d.y1 = ny1; d.y2 = ny2; } }
    if (ok) { d.id = uid(); pages[cur].annots.push(d); commit(); }
    drawOverlay(); void e;
  }
  overlay.addEventListener('pointerup', endPointer);
  overlay.addEventListener('pointercancel', endPointer);
  overlay.addEventListener('dblclick', function (e) {
    if (tool !== 'select') { return; }
    var pt = pointerBase(e), a = topHit(pt[0], pt[1]);
    if (a && a.t === 'text') { sel = a.id; openTextEditor(0, 0, a); }
    else if (!a) { var dr = runAt(pt[0], pt[1]); if (dr) { openRunEditor(dr); } }
  });

  /* ----------------------------------------------------------- properties */
  function applyProp(key, value, final) {
    props[key] = value;
    var a = findSel(); if (!a) { return; }
    if (key === 'color' && a.t !== 'white' && a.t !== 'img') { a.color = value; }
    if (a.t === 'text' && (key === 'size' || key === 'font' || key === 'bold')) { a[key] = value; }
    if (key === 'width' && a.width) { a.width = value; }
    if (key === 'fill' && (a.t === 'rect' || a.t === 'ellipse')) { a.fill = value; }
    if (key === 'color' && tool === 'hl') { toolColors.hl = value; }
    drawOverlay(); if (final) { commit(); }
  }
  elColor.addEventListener('input', function () { applyProp('color', elColor.value.toUpperCase(), false); if (tool === 'hl') { toolColors.hl = elColor.value.toUpperCase(); } });
  elColor.addEventListener('change', function () { applyProp('color', elColor.value.toUpperCase(), true); });
  elSize.addEventListener('change', function () { var v = Math.max(6, Math.min(120, parseFloat(elSize.value) || 18)); elSize.value = v; applyProp('size', v, true); });
  elWidth.addEventListener('change', function () { var v = Math.max(1, Math.min(30, parseFloat(elWidth.value) || 3)); elWidth.value = v; applyProp('width', v, true); });
  elFont.addEventListener('change', function () { applyProp('font', elFont.value, true); });
  elBold.addEventListener('change', function () { applyProp('bold', elBold.checked, true); });
  elFill.addEventListener('change', function () { applyProp('fill', elFill.checked, true); });

  /* -------------------------------------------------------------- page ops */
  function cloneAnnots(list) { return JSON.parse(JSON.stringify(list)).map(function (a) { a.id = uid(); return a; }); }
  function structureChanged() { commit(); buildThumbs(); renderPage(); updateUi(); }
  var actions = {
    undo: function () { if (histPos > 0) { restore(histPos - 1); } },
    redo: function () { if (histPos < hist.length - 1) { restore(histPos + 1); } },
    del: function () {
      var a = findSel(); if (!a) { return; }
      pages[cur].annots = pages[cur].annots.filter(function (x) { return x.id !== a.id; }); sel = null; commit(); drawOverlay();
    },
    rotate: function () { closeEditor(); pages[cur].rot = (pages[cur].rot + 90) % 360; fitZoom(); structureChanged(); },
    blank: function () {
      var p = pages[cur]; pages.splice(cur + 1, 0, { id: uid(), src: null, w: p.w, h: p.h, rot: 0, annots: [] }); cur += 1; sel = null; structureChanged();
    },
    dup: function () {
      var p = pages[cur], c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.annots = cloneAnnots(p.annots); pages.splice(cur + 1, 0, c); cur += 1; sel = null; structureChanged();
    },
    up: function () { if (cur > 0) { var t = pages[cur]; pages[cur] = pages[cur - 1]; pages[cur - 1] = t; cur -= 1; structureChanged(); } },
    down: function () { if (cur < pages.length - 1) { var t = pages[cur]; pages[cur] = pages[cur + 1]; pages[cur + 1] = t; cur += 1; structureChanged(); } },
    delpage: function () {
      if (pages.length < 2) { status('A PDF needs at least one page.', true); return; }
      closeEditor(true); pages.splice(cur, 1); cur = Math.min(cur, pages.length - 1); sel = null; status(''); structureChanged();
    },
    prev: function () { goTo(cur - 1); },
    next: function () { goTo(cur + 1); },
    zoomin: function () { setZoom(zoom * 1.2); },
    zoomout: function () { setZoom(zoom / 1.2); },
    fit: function () { fitZoom(); setZoom(zoom); },
    open: function () { $('pe-file').click(); },
    image: function () { $('pe-img-file').click(); },
    sign: function () { sgOpen(); },
    download: function () { download(); }
  };
  app.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act],[data-tool]'); if (!b || b.disabled) { return; }
    if (b.hasAttribute('data-tool')) { setTool(b.getAttribute('data-tool')); return; }
    var fn = actions[b.getAttribute('data-act')]; if (fn) { fn(); }
  });

  document.addEventListener('keydown', function (e) {
    if (app.hidden || sgDlg.open) { return; }
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return; }
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) { actions.redo(); } else { actions.undo(); } return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); actions.redo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); actions.del(); return; }
    var map = { v: 'select', t: 'text', d: 'ink', h: 'hl', r: 'rect', e: 'ellipse', l: 'line' };
    if (!mod && map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); }
  });

  /* ---------------------------------------------------------------- images */
  /* Puts a canvas on the current page as a movable, resizable picture (frac = starting width as a share of the page). */
  function placeCanvas(c, frac, msg) {
    return U.canvasToBlob(c, 'image/png').then(function (blob) { return readBytes(blob); }).then(function (bytes) {
      return new Promise(function (resolve) {
        var el = new Image(), id = uid(), url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        el.onload = function () {
          images[id] = { bytes: bytes, el: el, w: c.width, h: c.height };
          var p = pages[cur], w = Math.min(p.w * frac, c.width), h = w * c.height / c.width;
          var a = { id: uid(), t: 'img', img: id, x1: (p.w - w) / 2, y1: (p.h - h) / 2, x2: (p.w + w) / 2, y2: (p.h + h) / 2 };
          p.annots.push(a); sel = a.id; setTool('select'); commit(); drawOverlay(); status(msg); resolve();
        };
        el.src = url;
      });
    });
  }
  $('pe-img-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) { return; }
    U.loadImage(f).then(function (img) {
      var s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return placeCanvas(c, 0.4, 'Image added. Drag it to move, or drag the corner square to resize.');
    }, function () { status('That image could not be read.', true); });
  });

  /* ------------------------------------------------------------- signature */
  var SG_KEY = 'fh-pdf-signature';
  var sgDlg = $('pe-sign'), sgPad = $('pe-sign-pad'), sgTyped = $('pe-sign-typed'), sgUp = $('pe-sign-up'), sgMsg = $('pe-sign-msg');
  var sgMode = 'draw', sgStrokes = [], sgLive = null, sgUploaded = null;
  var SG_FONTS = {
    dancing: '400 {s}px "FH Dancing",cursive',
    vibes: '400 {s}px "FH Vibes",cursive',
    allura: '400 {s}px "FH Allura",cursive',
    sacramento: '400 {s}px "FH Sacramento",cursive',
    satisfy: '400 {s}px "FH Satisfy",cursive',
    caveat: '400 {s}px "FH Caveat",cursive'
  };
  var sgStyle = 'dancing';
  function sgSay(m) { sgMsg.textContent = m || ''; sgMsg.hidden = !m; }
  function sgInk() { return $('pe-sign-color').value; }
  function sgRenderPad() {
    var x = sgPad.getContext('2d'); x.clearRect(0, 0, sgPad.width, sgPad.height);
    x.strokeStyle = x.fillStyle = sgInk(); x.lineWidth = 4; x.lineCap = x.lineJoin = 'round';
    sgStrokes.forEach(function (s) {
      if (s.length === 1) { x.beginPath(); x.arc(s[0][0], s[0][1], 2.2, 0, 6.2832); x.fill(); return; }
      x.beginPath(); x.moveTo(s[0][0], s[0][1]);
      for (var i = 1; i < s.length - 1; i++) { x.quadraticCurveTo(s[i][0], s[i][1], (s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2); }
      x.lineTo(s[s.length - 1][0], s[s.length - 1][1]); x.stroke();
    });
  }
  function sgPoint(e) { var r = sgPad.getBoundingClientRect(); return [(e.clientX - r.left) * sgPad.width / r.width, (e.clientY - r.top) * sgPad.height / r.height]; }
  sgPad.addEventListener('pointerdown', function (e) {
    e.preventDefault(); sgSay(''); try { sgPad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    sgLive = [sgPoint(e)]; sgStrokes.push(sgLive); sgRenderPad();
  });
  sgPad.addEventListener('pointermove', function (e) { if (!sgLive) { return; } sgLive.push(sgPoint(e)); sgRenderPad(); });
  ['pointerup', 'pointercancel'].forEach(function (n) { sgPad.addEventListener(n, function () { sgLive = null; }); });
  $('pe-sign-clear').addEventListener('click', function () { sgStrokes = []; sgRenderPad(); });
  $('pe-sign-color').addEventListener('change', function () { sgRenderPad(); sgRenderTyped(); sgPaintCards(); });

  function sgRenderTyped() {
    var txt = $('pe-sign-text').value.trim(), fam = SG_FONTS[sgStyle] || SG_FONTS.dancing, size = 120;
    if (txt && document.fonts && document.fonts.load && !document.fonts.check(fam.replace('{s}', 48), txt)) {
      document.fonts.load(fam.replace('{s}', 48), txt).then(function () { sgRenderTyped(); }, function () { /* keep fallback */ });
    }
    var m = document.createElement('canvas').getContext('2d'); m.font = fam.replace('{s}', size);
    var w = Math.max(40, Math.ceil(m.measureText(txt || ' ').width) + 60), h = 200;
    if (w > 1400) { size = Math.floor(size * 1400 / w); w = 1400; m.font = fam.replace('{s}', size); }
    sgTyped.width = w; sgTyped.height = h;
    var x = sgTyped.getContext('2d'); x.clearRect(0, 0, w, h); x.font = fam.replace('{s}', size); x.fillStyle = sgInk(); x.textBaseline = 'middle';
    if (txt) { x.fillText(txt, 30, h / 2 + 4); }
  }
  /* Style cards: every card shows the typed name in its own handwriting font. */
  function sgPaintCards() {
    var t = $('pe-sign-text').value.trim() || 'Your Name', ink = sgInk();
    Array.prototype.forEach.call(sgDlg.querySelectorAll('.pe-sg-name'), function (n) { n.textContent = t; n.style.setProperty('--sg-ink', ink); });
  }
  $('pe-sign-text').addEventListener('input', function () { sgSay(''); sgPaintCards(); sgRenderTyped(); });
  $('pe-sign-styles').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sg-style]'); if (!b) { return; }
    sgStyle = b.getAttribute('data-sg-style');
    Array.prototype.forEach.call(this.querySelectorAll('[data-sg-style]'), function (k) { var on = k === b; k.classList.toggle('on', on); k.setAttribute('aria-checked', on ? 'true' : 'false'); });
    sgRenderTyped();
  });
  $('pe-sign-text').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('pe-sign-insert').click(); } });

  /* Uploaded photo: keep the dark ink, fade the paper to transparent. */
  $('pe-sign-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) { return; }
    U.loadImage(f).then(function (img) {
      var s = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
      var x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
      var d = x.getImageData(0, 0, c.width, c.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) {
        var luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        var keep = Math.max(0, Math.min(1, (225 - luma) / 70));
        px[i + 3] = Math.round(px[i + 3] * keep);
        if (keep > 0) { px[i] = px[i + 1] = px[i + 2] = Math.min(luma, 60); }
      }
      x.putImageData(d, 0, 0); sgUploaded = c; sgSay('');
      var pv = sgUp.getContext('2d'), r = Math.min(sgUp.width / c.width, sgUp.height / c.height);
      pv.clearRect(0, 0, sgUp.width, sgUp.height); pv.drawImage(c, (sgUp.width - c.width * r) / 2, (sgUp.height - c.height * r) / 2, c.width * r, c.height * r);
    }, function () { sgUploaded = null; sgSay('That image could not be read. Try a JPG or PNG.'); });
  });

  function sgTrim(c) {
    var w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) { if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) { x0 = x; } if (x > x1) { x1 = x; } if (y < y0) { y0 = y; } if (y > y1) { y1 = y; } } } }
    if (x1 < 0) { return null; }
    var pad = 8; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    var o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
  }
  function sgSource() { return sgMode === 'draw' ? sgPad : (sgMode === 'type' ? sgTyped : sgUploaded); }

  function sgSetTab(m) {
    sgMode = m; sgSay('');
    Array.prototype.forEach.call(sgDlg.querySelectorAll('[data-sg-tab]'), function (b) { var on = b.getAttribute('data-sg-tab') === m; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    Array.prototype.forEach.call(sgDlg.querySelectorAll('[data-sg-panel]'), function (p) { p.hidden = p.getAttribute('data-sg-panel') !== m; });
    $('pe-sign-inkrow').hidden = m === 'upload';
    if (m === 'type') { sgPaintCards(); sgRenderTyped(); $('pe-sign-text').focus(); }
  }
  sgDlg.addEventListener('click', function (e) { var b = e.target.closest('[data-sg-tab]'); if (b) { sgSetTab(b.getAttribute('data-sg-tab')); } });

  function sgStored() { try { return window.localStorage.getItem(SG_KEY) || ''; } catch (e) { return ''; } }
  function sgOpen() {
    if (!pages.length) { return; }
    sgStrokes = []; sgLive = null; sgUploaded = null; $('pe-sign-text').value = ''; $('pe-sign-file').value = ''; $('pe-sign-save').checked = false;
    sgUp.getContext('2d').clearRect(0, 0, sgUp.width, sgUp.height); sgRenderPad(); sgSetTab('draw');
    $('pe-sign-saved').hidden = !sgStored();
    if (typeof sgDlg.showModal === 'function') { sgDlg.showModal(); } else { sgDlg.setAttribute('open', ''); }
  }
  function sgClose() { if (typeof sgDlg.close === 'function') { sgDlg.close(); } else { sgDlg.removeAttribute('open'); } }
  $('pe-sign-cancel').addEventListener('click', sgClose);
  var SG_DONE = 'Signature added. Drag it to move, or drag the corner square to resize. Remember to download your PDF.';
  $('pe-sign-insert').addEventListener('click', function () {
    var src = sgSource(), c = src ? sgTrim(src) : null;
    if (!c) { sgSay(sgMode === 'draw' ? 'Draw your signature in the box first.' : (sgMode === 'type' ? 'Type your name first.' : 'Choose a photo of your signature first.')); return; }
    if ($('pe-sign-save').checked) { try { window.localStorage.setItem(SG_KEY, c.toDataURL('image/png')); } catch (e) { /* storage unavailable: skip */ } }
    sgClose(); placeCanvas(c, 0.28, SG_DONE);
  });
  $('pe-sign-usesaved').addEventListener('click', function () {
    var data = sgStored(); if (!data) { return; }
    var im = new Image();
    im.onload = function () { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); sgClose(); placeCanvas(c, 0.28, SG_DONE); };
    im.onerror = function () { sgSay('The saved signature could not be loaded.'); };
    im.src = data;
  });
  $('pe-sign-forget').addEventListener('click', function () { try { window.localStorage.removeItem(SG_KEY); } catch (e) { /* ignore */ } $('pe-sign-saved').hidden = true; });

  /* ------------------------------------------------------------------ open */
  function resetState() {
    srcBytes = null; pdfDoc = null; pdfPages = []; pages = []; images = {}; cur = 0; sel = null; draft = null; drag = null; editing = null;
    hist = []; histPos = -1; dirty = false; thumbCache = {}; forceRaster = false;
  }
  var pending = null;   /* {file, bytes} while we wait for a password */
  var passForm = $('pe-pass'), passInput = $('pe-pass-input');
  function finishOpen(f, bytes, doc, locked) {
    var n = doc.numPages, jobs = [];
    for (var i = 1; i <= n; i++) { jobs.push(doc.getPage(i)); }
    return Promise.all(jobs).then(function (list) {
      resetState(); srcBytes = bytes; pdfDoc = doc; pdfPages = list; fileName = U.baseName(f.name); forceRaster = !!locked;
      pages = pdfPages.map(function (pg, k) {
        var vp = pg.getViewport({ scale: 1 });
        return { id: uid(), src: k, w: vp.width, h: vp.height, rot: 0, annots: [] };
      });
      passForm.hidden = true; pending = null;
      app.hidden = false; $('pe-drop').hidden = true;
      setTool('text'); fitZoom(); pushHist(); buildThumbs(); renderPage(); updateUi();
      status('Opened ' + f.name + ' (' + pages.length + (pages.length === 1 ? ' page' : ' pages') + ', ' + U.formatBytes(f.size) + '). Click any text on the page to edit it, or click empty space to add new text.');
    });
  }
  function openBytes(f, bytes, password) {
    return ensureWorker().then(function () { return pdfjs.getDocument({ data: bytes.slice(), password: password || undefined }).promise; }).then(function (doc) { return finishOpen(f, bytes, doc, !!password); }, function (err) {
      if (err && err.message === 'worker') { passForm.hidden = true; status('The PDF engine file (pdf.worker.min.js) could not be loaded. Check that /static/js/vendor/pdf.worker.min.js exists, or that you are online, then reload.', true); return; }
      if (err && err.name === 'PasswordException') {
        pending = { file: f, bytes: bytes }; passForm.hidden = false; passInput.value = ''; passInput.focus();
        status(password ? 'That password is not correct. Please try again.' : 'This PDF is password protected.', !!password);
        return;
      }
      passForm.hidden = true; status('This file could not be opened as a PDF.', true);
    });
  }
  function loadFile(files) {
    var f = files.filter(isPdf)[0];
    if (!f) { status('Please choose a PDF file.', true); return; }
    if (dirty && !window.confirm('Opening another file will discard your current edits. Continue?')) { return; }
    status('Opening ' + f.name + '\u2026'); passForm.hidden = true;
    readBytes(f).then(function (bytes) { return openBytes(f, bytes, ''); }, function () { status('That file could not be read.', true); });
  }
  passForm.addEventListener('submit', function (e) {
    e.preventDefault(); if (!pending || !passInput.value) { return; }
    status('Opening\u2026'); openBytes(pending.file, pending.bytes, passInput.value);
  });
  $('pe-pass-cancel').addEventListener('click', function () { passForm.hidden = true; pending = null; status(''); });
  U.bindDrop($('pe-drop'), $('pe-file'), loadFile);
  U.bindDrop(stage, null, loadFile);

  /* ---------------------------------------------------------------- export */
  function hexRgb(h) {
    h = String(h).replace('#', ''); if (h.length === 3) { h = h.split('').map(function (c) { return c + c; }).join(''); }
    return PL.rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  }
  function cleanText(t) { return Array.from(t).map(function (ch) { return WINANSI.test(ch) ? ch : '?'; }).join(''); }

  /* Render one source page to a JPEG so a protected PDF can still be exported (text is no longer selectable). */
  function rasterPage(out, p) {
    var pg = pdfPages[p.src], vp1 = pg.getViewport({ scale: 1, rotation: pg.rotate });
    var sc = Math.max(1, Math.min(3, 2200 / Math.max(vp1.width, vp1.height))), vp = pg.getViewport({ scale: sc, rotation: pg.rotate });
    var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    return pg.render({ canvasContext: cx, viewport: vp }).promise.then(function () { return U.canvasToBlob(c, 'image/jpeg', 0.92); })
      .then(function (blob) { return readBytes(blob); }).then(function (bytes) { return out.embedJpg(bytes); })
      .then(function (img) { var page = out.addPage([p.w, p.h]); page.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h }); return page; });
  }

  function buildPdf() {
    var load = forceRaster ? Promise.resolve(null) : PL.PDFDocument.load(srcBytes).catch(function () { return null; });
    return load.then(function (src) {
      var raster = !src; lastRaster = raster;
      return PL.PDFDocument.create().then(function (out) {
        var fonts = {}, embeddedImgs = {}, chain = Promise.resolve(), done = 0;
        function getFont(a) {
          var key = a.font + (a.bold ? 'B' : '') + (a.italic ? 'I' : ''), names = { Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] };
          if (!fonts[key]) { fonts[key] = out.embedFont(PL.StandardFonts[names[a.font][(a.bold ? 1 : 0) + (a.italic ? 2 : 0)]]); }
          return fonts[key];
        }
        function getImage(id) {
          if (!embeddedImgs[id]) { embeddedImgs[id] = out.embedPng(images[id].bytes); }
          return embeddedImgs[id];
        }
        pages.forEach(function (p) {
          chain = chain.then(function () {
            var pagePromise;
            if (p.src !== null && !raster) { pagePromise = out.copyPages(src, [p.src]).then(function (r) { return out.addPage(r[0]); }); }
            else if (p.src !== null) { status('Saving page ' + (++done) + ' of ' + pages.length + '\u2026'); pagePromise = rasterPage(out, p); }
            else { pagePromise = Promise.resolve(out.addPage([p.w, p.h])); }
            return pagePromise.then(function (page) {
              var plain = raster || p.src === null;
              var r0 = plain ? 0 : ((page.getRotation().angle % 360) + 360) % 360;
              var crop = plain ? { x: 0, y: 0, width: p.w, height: p.h } : page.getCropBox();
              var cw = crop.width, ch = crop.height;
              function toU(x, y) {
                switch (r0) { case 0: return [x, y]; case 90: return [y, ch - x]; case 180: return [cw - x, ch - y]; default: return [cw - y, x]; }
              }
              function toPdf(x, y) { var u = toU(x, y); return [crop.x + u[0], crop.y + ch - u[1]]; }
              function svgPath(points, close) {
                return points.map(function (q, i) { var u = toU(q[0], q[1]); return (i ? 'L ' : 'M ') + u[0].toFixed(3) + ' ' + u[1].toFixed(3); }).join(' ') + (close ? ' Z' : '');
              }
              var origin = { x: crop.x, y: crop.y + ch };
              var tasks = Promise.resolve();
              p.annots.forEach(function (a) {
                tasks = tasks.then(function () {
                  switch (a.t) {
                    case 'text':
                      return getFont(a).then(function (font) {
                        textLines(a).forEach(function (line, i) {
                          if (!line) { return; }
                          var pt = toPdf(a.x, a.y + a.size * 0.82 + i * a.size * 1.2);
                          page.drawText(cleanText(line), { x: pt[0], y: pt[1], size: a.size, font: font, color: hexRgb(a.color), rotate: PL.degrees(r0) });
                        });
                      });
                    case 'ink':
                      if (a.pts.length === 1) { a = { t: 'ink', color: a.color, width: a.width, pts: [a.pts[0], [a.pts[0][0] + 0.01, a.pts[0][1]]] }; }
                      page.drawSvgPath(svgPath(a.pts, false), Object.assign({ borderColor: hexRgb(a.color), borderWidth: a.width, borderLineCap: PL.LineCapStyle.Round }, origin));
                      return null;
                    case 'line':
                      page.drawSvgPath(svgPath([[a.x1, a.y1], [a.x2, a.y2]], false), Object.assign({ borderColor: hexRgb(a.color), borderWidth: a.width, borderLineCap: PL.LineCapStyle.Round }, origin));
                      return null;
                    case 'rect': case 'ellipse':
                      var opts = { borderColor: hexRgb(a.color), borderWidth: a.width };
                      if (a.fill) { opts.color = hexRgb(a.color); }
                      page.drawSvgPath(svgPath(a.t === 'rect' ? rectPts(a) : ellipsePts(a), true), Object.assign(opts, origin));
                      return null;
                    case 'hl':
                      page.drawSvgPath(svgPath(rectPts(a), true), Object.assign({ color: hexRgb(a.color), opacity: 0.38, borderWidth: 0 }, origin));
                      return null;
                    case 'white':
                      page.drawSvgPath(svgPath(rectPts(a), true), Object.assign({ color: a.bg ? hexRgb(a.bg) : PL.rgb(1, 1, 1), borderWidth: 0 }, origin));
                      return null;
                    case 'img':
                      return getImage(a.img).then(function (img) {
                        var bl = toPdf(Math.min(a.x1, a.x2), Math.max(a.y1, a.y2));
                        page.drawImage(img, { x: bl[0], y: bl[1], width: Math.abs(a.x2 - a.x1), height: Math.abs(a.y2 - a.y1), rotate: PL.degrees(r0) });
                      });
                  }
                  return null;
                });
              });
              return tasks.then(function () { page.setRotation(PL.degrees((r0 + p.rot) % 360)); });
            });
          });
        });
        return chain.then(function () { out.setProducer('FreeHandyly PDF Editor'); return out.save({ useObjectStreams: true }); });
      });
    });
  }
  function download() {
    closeEditor();
    var btns = Array.prototype.slice.call(app.querySelectorAll('[data-act="download"]')); btns.forEach(function (b) { b.disabled = true; }); status('Building your PDF\u2026');
    buildPdf().then(function (bytes) {
      U.download(new Blob([bytes], { type: 'application/pdf' }), fileName + '-edited.pdf');
      status('Done. Your edited PDF (' + U.formatBytes(bytes.length) + ') was downloaded.' + (coveredText() ? ' Edited text is covered and replaced, not erased: the original may still be readable in the file data, so do not rely on this to hide sensitive information.' : '') + (lastRaster ? ' Because this PDF is protected or could not be edited exactly, its pages were saved as images, so the text in the file cannot be selected.' : ''));
      dirty = false;
    }, function (e) { status('Could not build the PDF: ' + (e && e.message ? e.message : e), true); }).then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }

  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', function () { if (pages.length) { updateUi(); } });
  window.FHPdfEditor = { buildPdf: buildPdf, state: function () { return { pages: pages, cur: cur, zoom: zoom }; } };
})();
