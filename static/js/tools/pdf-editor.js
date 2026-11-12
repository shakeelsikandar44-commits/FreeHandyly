/* FreeHandyly - PDF Editor (Sejda-style). Rendering: pdf.js. Export: pdf-lib. Runs fully in the browser; files are never uploaded.
   Coordinates: every object is stored in PDF points, origin top-left, y down. */
(function () {
  'use strict';
  var root = document.getElementById('pe2-root'); if (!root) { return; }
  var $ = function (s) { return root.querySelector(s); };
  var pdfjs = window.pdfjsLib, PL = window.PDFLib;
  var statusEl = $('#pe2-status');
  function status(m, err) { statusEl.textContent = m || ''; statusEl.className = 'status-line mt-2' + (err ? ' err' : ''); }
  if (!pdfjs || !PL) { status('The editor engine failed to load. Please reload the page.', true); return; }
  pdfjs.GlobalWorkerOptions.workerSrc = '/static/js/vendor/pdf.worker.min.js';

  var pdf, srcBytes, pages = [], runCache = {}, forms = {}, fv = {}, S = 1.4, tool = 'select', pending = null, hist = [], fname = 'edited.pdf', sheets = [];
  var HINTS = { select: 'Hover an item to move, resize or delete it.', text: 'Click existing text to edit it, or click an empty spot to add new text.', link: 'Drag a box, then enter the link URL.',
    check: 'Click to place a checkmark.', field: 'Click to place a fillable text field.', whiteout: 'Drag to cover content with white.',
    highlight: 'Drag over text to highlight.', draw: 'Draw freehand.', rect: 'Drag to draw a rectangle.', ellipse: 'Drag to draw an ellipse.',
    line: 'Drag to draw a line.', arrow: 'Drag to draw an arrow.', place: 'Click on the page where you want to place it. Press Esc to cancel.' };

  function push() { hist.push(JSON.stringify(pages)); if (hist.length > 40) { hist.shift(); } }
  function undo() { if (hist.length) { pages = JSON.parse(hist.pop()); renderPages(); } }
  function setTool(t) {
    tool = t; root.dataset.tool = t; $('#pe2-hint').textContent = HINTS[t] || '';
    if (t === 'text' && pdf) { loadAllRuns(); }
    root.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === t); });
  }

  /* ---------- load ---------- */
  async function open(file, password) {
    if (!file) { return; }
    if (file.type && file.type !== 'application/pdf') { status('Please choose a PDF file.', true); return; }
    status('Opening PDF...');
    try {
      srcBytes = new Uint8Array(await file.arrayBuffer());
      var task = pdfjs.getDocument({ data: srcBytes.slice(), password: password || undefined });
      pdf = await task.promise;
      pages = []; runCache = {}; forms = {}; fv = {};
      for (var i = 1; i <= pdf.numPages; i++) {
        var p = await pdf.getPage(i), v = p.getViewport({ scale: 1 });
        pages.push({ n: i, w: v.width, h: v.height, objs: [] });
        await collectWidgets(p, i, v.height);
      }
      $('#pe2-flatw').hidden = !Object.keys(forms).length; $('#pe2-flat').checked = false;
      fname = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
      hist = []; status('');
      $('#pe2-drop').hidden = true; $('#pe2-app').hidden = false;
      S = Math.min(1.4, Math.max(.5, (root.clientWidth - 30) / pages[0].w));
      setTool('select'); renderPages();
    } catch (e) {
      if (e && e.name === 'PasswordException') {
        var pw = window.prompt('This PDF is password protected. Enter the password:');
        if (pw) { return open(file, pw); }
        status('A password is needed to open this PDF.', true);
      } else { status('Could not open this PDF. It may be damaged.', true); }
    }
  }
  $('#pe2-file').onchange = function (e) { open(e.target.files[0]); e.target.value = ''; };
  var dz = $('#pe2-drop');
  ['dragover', 'dragenter'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('hot'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('hot'); }); });
  dz.addEventListener('drop', function (e) { open(e.dataTransfer.files[0]); });

  /* ---------- render ---------- */
  function renderPages() {
    var box = $('#pe2-pages'); box.innerHTML = ''; sheets = [];
    pages.forEach(function (pg, i) {
      var el = document.createElement('div'); el.className = 'ppg';
      el.innerHTML = '<div class="ppbar"><b>' + (i + 1) + '</b><button type="button" class="pb" data-a="del">Delete page</button><button type="button" class="pb" data-a="add">Insert blank page here</button></div>' +
        '<div class="pwrap"><div class="psheet" style="width:' + pg.w * S + 'px;height:' + pg.h * S + 'px"><canvas></canvas><svg></svg><div class="pov"></div></div></div>';
      box.appendChild(el);
      var sh = el.querySelector('.psheet'); sheets.push(sh);
      el.querySelector('[data-a=del]').onclick = function () { if (pages.length < 2) { status('A PDF needs at least one page.', true); return; } push(); pages.splice(i, 1); renderPages(); };
      el.querySelector('[data-a=add]').onclick = function () { push(); pages.splice(i + 1, 0, { n: 0, w: pg.w, h: pg.h, objs: [] }); renderPages(); };
      if (pg.n) {
        pdf.getPage(pg.n).then(function (p) {
          var r = window.devicePixelRatio || 1, v = p.getViewport({ scale: S * r }), c = sh.querySelector('canvas');
          c.width = v.width; c.height = v.height; p.render({ canvasContext: c.getContext('2d', { willReadFrequently: true }), viewport: v, annotationMode: forms[pg.n] ? pdfjs.AnnotationMode.ENABLE_FORMS : pdfjs.AnnotationMode.ENABLE });
        });
      }
      bindOverlay(i, sh.querySelector('.pov'));
      draw(i);
    });
  }
  function arrowHead(a, b) {
    var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 10;
    return [[b[0] - L * Math.cos(ang - .45), b[1] - L * Math.sin(ang - .45)], [b[0] - L * Math.cos(ang + .45), b[1] - L * Math.sin(ang + .45)]];
  }
  function draw(i) {
    var sh = sheets[i], ov = sh.querySelector('.pov'), sv = sh.querySelector('svg'); ov.innerHTML = ''; sv.innerHTML = '';
    pages[i].objs.forEach(function (o, k) { mk(i, o, k, ov, sv); });
    widgets(i, ov);
    var rs = tool === 'text' && pages[i].n ? runCache[pages[i].n] : null;
    if (rs) {
      rs.forEach(function (r) {
        if (pages[i].objs.some(function (o) { return o.t === 'edit' && o.tx === r.x && Math.abs(o.base - r.base) < .5; })) { return; }
        var hb = document.createElement('div'); hb.className = 'po src'; hb.title = 'Click to edit this text';
        hb.style.left = r.x * S + 'px'; hb.style.top = (r.base - .88 * r.size) * S + 'px'; hb.style.width = r.w * S + 'px'; hb.style.height = 1.1 * r.size * S + 'px';
        hb.onpointerdown = function (e) { e.preventDefault(); e.stopPropagation(); startEdit(i, r); };
        ov.appendChild(hb);
      });
    }
  }
  function mk(i, o, k, ov, sv) {
    if (o.t === 'path') {
      var f = function (p) { return p[0] * S + ',' + p[1] * S; };
      var st = 'fill="none" stroke="' + o.c + '" stroke-width="' + o.sw * S + '" stroke-linecap="round" stroke-linejoin="round"';
      var h = '<polyline points="' + o.pts.map(f).join(' ') + '" ' + st + '/>';
      if (o.arrow && o.pts.length > 1) {
        var e = o.pts[o.pts.length - 1], hd = arrowHead(o.pts[0], e);
        h += '<polyline points="' + f(hd[0]) + ' ' + f(e) + ' ' + f(hd[1]) + '" ' + st + '/>';
      }
      sv.insertAdjacentHTML('beforeend', h); return;
    }
    if (o.t === 'edit') {
      var ed = document.createElement('div'); ed.className = 'po edit';
      ed.style.cssText = 'left:' + o.x * S + 'px;top:' + o.y * S + 'px;width:' + o.w * S + 'px;height:' + o.h * S + 'px;background:' + o.bg;
      var et = document.createElement('div'), m = MET[o.f], mt = (o.base - o.y) - ((o.h - (m[0] + m[1]) * o.size) / 2 + m[0] * o.size);
      et.className = 't'; et.contentEditable = 'true'; et.spellcheck = false; et.textContent = o.text;
      et.style.cssText = 'position:absolute;left:' + (o.tx - o.x) * S + 'px;top:0;font-family:' + FAM[o.f] + ';font-weight:' + (o.b ? 700 : 400) + ';font-style:' + (o.i ? 'italic' : 'normal') + ';font-size:' + o.size * S + 'px;line-height:' + o.h * S + 'px;height:' + o.h * S + 'px;color:' + o.c + ';margin-top:' + mt * S + 'px';
      et.oninput = function () { o.text = et.innerText.replace(/\n/g, ''); };
      et.onkeydown = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); et.blur(); } };
      et.onblur = function () { var kk = pages[i].objs.indexOf(o); if (kk > -1 && o.text === o.orig) { pages[i].objs.splice(kk, 1); hist.pop(); draw(i); } };
      ed.appendChild(et);
      var ex = document.createElement('span'); ex.className = 'x'; ex.textContent = '\u00d7'; ex.title = 'Remove this edit';
      ex.onclick = function () { push(); pages[i].objs.splice(pages[i].objs.indexOf(o), 1); draw(i); };
      ed.appendChild(ex); ov.appendChild(ed); return;
    }
    var d = document.createElement('div'); d.className = 'po ' + o.t;
    d.style.left = o.x * S + 'px'; d.style.top = o.y * S + 'px';
    if (o.t !== 'text') { d.style.width = o.w * S + 'px'; d.style.height = o.h * S + 'px'; }
    if (o.t === 'whiteout') { d.style.background = '#fff'; }
    if (o.t === 'highlight') { d.style.background = o.c; d.style.opacity = 0.4; }
    if (o.t === 'rect' || o.t === 'ellipse') { d.style.border = o.sw * S + 'px solid ' + o.c; if (o.t === 'ellipse') { d.style.borderRadius = '50%'; } }
    if (o.t === 'image') { var im = document.createElement('img'); im.src = o.src; im.alt = ''; d.appendChild(im); }
    if (o.t === 'check') { d.textContent = '\u2713'; d.style.fontSize = o.h * S * .95 + 'px'; d.style.color = o.c; }
    if (o.t === 'link') { d.title = o.url; }
    if (o.t === 'text') {
      d.innerHTML = '<span class="grip"></span><div class="t" contenteditable="true" spellcheck="false"></div>';
      var t = d.querySelector('.t'); t.textContent = o.text;
      t.style.cssText = 'font:' + o.size * S + 'px/1.2 Helvetica,Arial,sans-serif;color:' + o.c;
      var first = true; t.onfocus = function () { first = true; };
      t.oninput = function () { if (first) { push(); first = false; } o.text = t.innerText.replace(/\n$/, ''); };
      d.querySelector('.grip').onpointerdown = function (e) { move(e, o, d); };
    } else {
      d.onpointerdown = function (e) { if (e.target.classList.contains('x') || e.target.classList.contains('rz')) { return; } move(e, o, d); };
      if (o.t !== 'check') {
        var r = document.createElement('span'); r.className = 'rz';
        r.onpointerdown = function (e) {
          var ow = o.w, oh = o.h;
          track(e, function (dx, dy) { o.w = Math.max(6, ow + dx); o.h = Math.max(6, oh + dy); d.style.width = o.w * S + 'px'; d.style.height = o.h * S + 'px'; });
        };
        d.appendChild(r);
      }
    }
    var x = document.createElement('span'); x.className = 'x'; x.textContent = '\u00d7'; x.title = 'Delete';
    x.onclick = function () { push(); pages[i].objs.splice(k, 1); draw(i); };
    d.appendChild(x); ov.appendChild(d);
  }
  function track(e, fn, done) {
    e.preventDefault(); e.stopPropagation();
    var sx = e.clientX, sy = e.clientY; push();
    var mv = function (v) { fn((v.clientX - sx) / S, (v.clientY - sy) / S); };
    var up = function () { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (done) { done(); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  function move(e, o, d) {
    var ox = o.x, oy = o.y;
    track(e, function (dx, dy) { o.x = ox + dx; o.y = oy + dy; d.style.left = o.x * S + 'px'; d.style.top = o.y * S + 'px'; });
  }



  /* ---------- fill existing form fields ---------- */
  async function collectWidgets(p, n, H) {
    var list = [];
    try {
      var an = await p.getAnnotations({ intent: 'display' });
      an.forEach(function (a) {
        if (a.subtype !== 'Widget' || a.readOnly || !a.fieldName || !a.rect) { return; }
        var type = a.fieldType === 'Tx' ? 'tx' : a.fieldType === 'Ch' ? (a.combo ? 'dd' : 'lb') : a.fieldType === 'Btn' ? (a.radioButton ? 'rb' : a.checkBox ? 'cb' : '') : '';
        if (!type) { return; }
        var r = a.rect, val = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue;
        if (!(a.fieldName in fv)) { fv[a.fieldName] = type === 'cb' ? !!val && val !== 'Off' : (val == null ? '' : String(val)); }
        list.push({ name: a.fieldName, type: type, x: Math.min(r[0], r[2]), y: H - Math.max(r[1], r[3]), w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]), multi: !!a.multiLine, opts: a.options || [], bv: a.buttonValue, max: a.maxLen || 0 });
      });
    } catch (e) { list = []; }
    if (list.length) { forms[n] = list; }
  }
  function widgets(i, ov) {
    var list = pages[i].n ? forms[pages[i].n] : null;
    if (!list) { return; }
    list.forEach(function (w) {
      var el;
      if (w.type === 'tx') {
        el = document.createElement(w.multi ? 'textarea' : 'input'); el.value = fv[w.name] || ''; if (w.max) { el.maxLength = w.max; }
        el.oninput = function () { fv[w.name] = el.value; };
      } else if (w.type === 'cb') {
        el = document.createElement('input'); el.type = 'checkbox'; el.checked = !!fv[w.name]; el.onchange = function () { fv[w.name] = el.checked; };
      } else if (w.type === 'rb') {
        el = document.createElement('input'); el.type = 'radio'; el.name = 'fh-' + pages[i].n + '-' + w.name; el.checked = fv[w.name] === String(w.bv);
        el.onchange = function () { if (el.checked) { fv[w.name] = String(w.bv); } };
      } else {
        el = document.createElement('select'); if (w.type === 'lb') { el.size = Math.max(2, Math.min(6, w.opts.length)); }
        w.opts.forEach(function (o) { var op = document.createElement('option'); op.value = o.exportValue; op.textContent = o.displayValue || o.exportValue; el.appendChild(op); });
        el.value = fv[w.name]; el.onchange = function () { fv[w.name] = el.value; };
      }
      el.className = 'po fw fw-' + w.type; el.title = w.name; el.setAttribute('aria-label', w.name);
      el.style.left = w.x * S + 'px'; el.style.top = w.y * S + 'px'; el.style.width = w.w * S + 'px'; el.style.height = w.h * S + 'px';
      el.style.fontSize = Math.max(8, Math.min(w.multi ? 14 : w.h * .7, 16)) * S + 'px';
      ov.appendChild(el);
    });
  }

  /* ---------- edit existing text ---------- */
  var FAM = { sans: '"FH Lib Sans",Arial,Helvetica,sans-serif', serif: '"FH Lib Serif","Times New Roman",serif', mono: '"FH Lib Mono","Courier New",monospace' };
  var MET = { sans: [.905, .212], serif: [.891, .216], mono: [.833, .3] };
  function fontStyle(name, fam) {
    var n = (name || '').toLowerCase(), f = (fam || '').toLowerCase();
    var mono = /courier|mono|consol|menlo|typewriter/.test(n) || f === 'monospace';
    var serif = !mono && ((/times|serif|georgia|garamond|cambria|minion|palatino|book|roman|tinos/.test(n) && !/sans/.test(n)) || (f === 'serif' && !/sans|arial|helvet|calibri|verdana|tahoma/.test(n)));
    return { f: mono ? 'mono' : serif ? 'serif' : 'sans', b: /bold|black|heavy|semibold|demi/.test(n) ? 1 : 0, i: /italic|oblique/.test(n) ? 1 : 0 };
  }
  async function loadRuns(n) {
    if (runCache[n]) { return runCache[n]; }
    var runs = [];
    try {
      var p = await pdf.getPage(n);
      if (!p.rotate) {
        var H = p.getViewport({ scale: 1 }).height, tc = await p.getTextContent(), cur = null;
        var flush = function () { if (cur && cur.str.trim()) { cur.str = cur.str.replace(/\s+$/, ''); runs.push(cur); } cur = null; };
        tc.items.forEach(function (it) {
          if (!it.str) { return; }
          var T = it.transform, size = Math.hypot(T[2], T[3]);
          if (size < 2 || Math.abs(T[1]) > .05 * size) { flush(); return; }
          if (!it.str.trim()) { /* spacer item: a wide one marks a column gap, a narrow one is a normal space */
            if (it.width > 1.2 * size) { flush(); } else if (cur && Math.abs(H - T[5] - cur.base) < .3 * size) { cur.str += it.str; cur.w = T[4] + it.width - cur.x; }
            return;
          }
          var st = tc.styles[it.fontName] || {}, nm = '';
          try { if (p.commonObjs.has(it.fontName)) { nm = p.commonObjs.get(it.fontName).name || ''; } } catch (e) { nm = ''; }
          var fs = fontStyle(nm || it.fontName, st.fontFamily), x = T[4], base = H - T[5];
          if (cur) {
            var gap = x - (cur.x + cur.w), same = Math.abs(base - cur.base) < .3 * size && Math.abs(size - cur.size) < .12 * size && fs.f === cur.f && fs.b === cur.b && fs.i === cur.i;
            if (same && gap > -.6 * size && gap < .9 * size) {
              if (gap > .2 * size && !/\s$/.test(cur.str) && !/^\s/.test(it.str)) { cur.str += ' '; }
              cur.str += it.str; cur.w = x + it.width - cur.x; return;
            }
            flush();
          }
          cur = { x: x, base: base, size: size, w: it.width, str: it.str, f: fs.f, b: fs.b, i: fs.i };
        });
        flush();
      }
    } catch (e) { runs = []; }
    runCache[n] = runs; return runs;
  }
  function loadAllRuns() {
    Promise.all(pages.map(function (pg) { return pg.n ? loadRuns(pg.n) : null; })).then(function () {
      if (tool === 'text') { pages.forEach(function (pg, i) { draw(i); }); }
    });
  }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  function sample(i, b) {
    var cv = sheets[i].querySelector('canvas'), dflt = { bg: '#ffffff', c: '#000000' };
    if (!cv || !cv.width) { return dflt; }
    var k = cv.width / pages[i].w, x0 = Math.max(0, Math.floor(b.x * k)), y0 = Math.max(0, Math.floor(b.y * k));
    var w = Math.min(cv.width - x0, Math.ceil(b.w * k)), h = Math.min(cv.height - y0, Math.ceil(b.h * k)), d;
    if (w < 1 || h < 1) { return dflt; }
    try { d = cv.getContext('2d').getImageData(x0, y0, w, h).data; } catch (e) { return dflt; }
    var cnt = {}, best = 0, bc = 0, p, key;
    for (p = 0; p < d.length; p += 4) { key = (d[p] >> 3) << 10 | (d[p + 1] >> 3) << 5 | (d[p + 2] >> 3); cnt[key] = (cnt[key] || 0) + 1; if (cnt[key] > bc) { bc = cnt[key]; best = p; } }
    if (d[best + 3] < 200) { return dflt; }
    var far = -1, fp = best;
    for (p = 0; p < d.length; p += 4) { var dist = Math.abs(d[p] - d[best]) + Math.abs(d[p + 1] - d[best + 1]) + Math.abs(d[p + 2] - d[best + 2]); if (dist > far) { far = dist; fp = p; } }
    return { bg: toHex([d[best], d[best + 1], d[best + 2]]), c: far > 60 ? toHex([d[fp], d[fp + 1], d[fp + 2]]) : '#000000' };
  }
  function startEdit(i, r) {
    var top = r.base - .88 * r.size, h = 1.1 * r.size, col = sample(i, { x: r.x, y: top, w: r.w, h: h });
    push();
    var o = { t: 'edit', x: r.x - 1, y: top, w: r.w + 2, h: h, tx: r.x, base: r.base, size: r.size, text: r.str, orig: r.str, f: r.f, b: r.b, i: r.i, c: col.c, bg: col.bg };
    pages[i].objs.push(o); draw(i);
    var ts = sheets[i].querySelectorAll('.po.edit .t'), t = ts[ts.length - 1];
    if (t) { t.focus(); var rg = document.createRange(); rg.selectNodeContents(t); rg.collapse(false); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); }
  }

  /* ---------- creating objects ---------- */
  function bindOverlay(i, ov) {
    ov.addEventListener('pointerdown', function (e) {
      if (e.target !== ov || tool === 'select') { return; }
      e.preventDefault(); /* keep focus/selection on the element we are about to create */
      var r = ov.getBoundingClientRect(), px = (e.clientX - r.left) / S, py = (e.clientY - r.top) / S, objs = pages[i].objs;
      var color = $('#pe2-color').value, sw = +$('#pe2-sw').value || 2;
      var add = function (o) { objs.push(o); draw(i); return o; };
      if (tool === 'text') {
        push(); add({ t: 'text', x: px, y: py, text: 'Text', size: +$('#pe2-size').value || 14, c: color });
        var ts = sheets[i].querySelectorAll('.po.text .t'), t = ts[ts.length - 1];
        var focusIt = function () { t.focus(); getSelection().selectAllChildren(t); }; focusIt(); setTimeout(focusIt, 0); return;
      }
      if (tool === 'check') { push(); add({ t: 'check', x: px - 9, y: py - 9, w: 18, h: 18, c: color }); setTool('select'); return; }
      if (tool === 'field') { push(); add({ t: 'field', x: px, y: py - 11, w: 150, h: 22 }); setTool('select'); return; }
      if (tool === 'place' && pending) {
        push(); var w = Math.min(160, pages[i].w / 2);
        add({ t: 'image', x: px - w / 2, y: py - w * pending.r / 2, w: w, h: w * pending.r, src: pending.src });
        pending = null; setTool('select'); return;
      }
      e.preventDefault();
      if (['whiteout', 'highlight', 'rect', 'ellipse', 'link'].indexOf(tool) > -1) {
        push(); var cur = tool, o = add({ t: cur, x: px, y: py, w: 0, h: 0, c: cur === 'highlight' ? '#ffe600' : color, sw: sw });
        var sx = e.clientX, sy = e.clientY;
        var mv = function (v) { var dx = (v.clientX - sx) / S, dy = (v.clientY - sy) / S; o.x = dx < 0 ? px + dx : px; o.y = dy < 0 ? py + dy : py; o.w = Math.abs(dx); o.h = Math.abs(dy); draw(i); };
        var up = function () {
          removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
          if (o.w < 4 && o.h < 4) { objs.splice(objs.indexOf(o), 1); hist.pop(); draw(i); return; }
          if (cur === 'link') {
            var u = window.prompt('Link URL (https://...)', 'https://');
            if (!u || u === 'https://') { objs.splice(objs.indexOf(o), 1); hist.pop(); } else { o.url = u; }
            setTool('select');
          }
          draw(i);
        };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
      }
      if (['draw', 'line', 'arrow'].indexOf(tool) > -1) {
        push(); var cur2 = tool, p = add({ t: 'path', pts: [[px, py]], c: color, sw: sw, arrow: cur2 === 'arrow' });
        var mv2 = function (v) { var q = [(v.clientX - r.left) / S, (v.clientY - r.top) / S]; if (cur2 === 'draw') { p.pts.push(q); } else { p.pts = [p.pts[0], q]; } draw(i); };
        var up2 = function () { removeEventListener('pointermove', mv2); removeEventListener('pointerup', up2); if (p.pts.length < 2) { objs.splice(objs.indexOf(p), 1); hist.pop(); draw(i); } };
        addEventListener('pointermove', mv2); addEventListener('pointerup', up2);
      }
    });
  }

  /* ---------- toolbar ---------- */
  root.querySelectorAll('[data-tool]').forEach(function (b) { b.onclick = function () { setTool(b.dataset.tool); document.activeElement.blur(); }; });
  $('#pe2-undo').onclick = undo;
  $('#pe2-zin').onclick = function () { S = Math.min(3, S * 1.2); renderPages(); };
  $('#pe2-zout').onclick = function () { S = Math.max(.4, S / 1.2); renderPages(); };
  $('#pe2-imgbtn').onclick = function () { $('#pe2-img').click(); document.activeElement.blur(); };
  $('#pe2-img').onchange = function (e) {
    var f = e.target.files[0]; if (!f) { return; }
    var u = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
      pending = { src: c.toDataURL('image/png'), r: im.naturalHeight / im.naturalWidth }; setTool('place'); URL.revokeObjectURL(u);
    };
    im.src = u; e.target.value = '';
  };
  /* signature (Type / Draw / Upload Image, optional saved signatures) */
  var SIGF = [['FH Dancing', 'Dancing Script'], ['FH Vibes', 'Great Vibes'], ['FH Allura', 'Allura'], ['FH Sacramento', 'Sacramento'], ['FH Satisfy', 'Satisfy'],
    ['FH Caveat', 'Caveat'], ['FH Parisienne', 'Parisienne'], ['FH Alex', 'Alex Brush'], ['FH Yellowtail', 'Yellowtail'], ['FH Homemade', 'Homemade Apple'],
    ['FH Dafoe', 'Mr Dafoe'], ['FH Marck', 'Marck Script']];
  var sc = $('#pe2-sc'), sx = sc.getContext('2d'), drawing = false, sgMode = 'type', sgFont = SIGF[0][0], sgColor = '#111827', sgUp = null, sgVer = 'orig';
  var sgName = $('#pe2-sg-name'), optBox = $('#pe2-sgopts'), upPrev = $('#pe2-sg-upprev'), KEY = 'fh-pe-sigs';
  sx.lineWidth = 2.5; sx.lineCap = 'round'; sx.lineJoin = 'round';
  function fstr(f, px) { return px + 'px "' + f + '", cursive'; }
  SIGF.forEach(function (f, i) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'pe2-sgopt' + (i ? '' : ' on'); b.dataset.f = f[0]; b.title = f[1];
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i ? 'false' : 'true');
    b.onclick = function () { sgFont = f[0]; optBox.querySelectorAll('.pe2-sgopt').forEach(function (o) { var on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-checked', on ? 'true' : 'false'); }); };
    optBox.appendChild(b);
  });
  function sgPreview() {
    var txt = sgName.value.trim() || 'Your Name';
    optBox.querySelectorAll('.pe2-sgopt').forEach(function (b) {
      b.textContent = txt; b.style.fontFamily = '"' + b.dataset.f + '", cursive'; b.style.color = sgColor;
      if (document.fonts && document.fonts.load) { document.fonts.load(fstr(b.dataset.f, 32), txt).then(function () { b.style.fontFamily = '"' + b.dataset.f + '", cursive'; }); }
    });
  }
  function sgSetMode(m) {
    sgMode = m;
    root.querySelectorAll('[data-sg]').forEach(function (b) { b.classList.toggle('on', b.dataset.sg === m); });
    $('#pe2-sg-type').hidden = m !== 'type'; $('#pe2-sg-draw').hidden = m !== 'draw'; $('#pe2-sg-up').hidden = m !== 'up';
    $('#pe2-sclear').hidden = m !== 'draw'; $('#pe2-sg-colors').hidden = m === 'up';
  }
  root.querySelectorAll('[data-sg]').forEach(function (b) { b.onclick = function () { sgSetMode(b.dataset.sg); }; });
  root.querySelectorAll('#pe2-sg-colors button').forEach(function (b) {
    b.onclick = function () {
      sgColor = b.dataset.c; root.querySelectorAll('#pe2-sg-colors button').forEach(function (o) { o.classList.toggle('on', o === b); });
      sgPreview();
    };
  });
  sgName.oninput = sgPreview;
  function sp(e) { var r = sc.getBoundingClientRect(); return [(e.clientX - r.left) * sc.width / r.width, (e.clientY - r.top) * sc.height / r.height]; }
  sc.onpointerdown = function (e) { drawing = true; sx.strokeStyle = sgColor; sc.setPointerCapture(e.pointerId); var p = sp(e); sx.beginPath(); sx.moveTo(p[0], p[1]); };
  sc.onpointermove = function (e) { if (!drawing) { return; } var p = sp(e); sx.lineTo(p[0], p[1]); sx.stroke(); };
  sc.onpointerup = function () { drawing = false; };
  $('#pe2-sclear').onclick = function () { sx.clearRect(0, 0, sc.width, sc.height); };
  /* upload image */
  function upRender() {
    if (!sgUp) { return; }
    var w = sgUp.width, h = sgUp.height; upPrev.width = w; upPrev.height = h;
    var cx = upPrev.getContext('2d'); cx.clearRect(0, 0, w, h); cx.drawImage(sgUp, 0, 0);
    if (sgVer === 'trans') {
      var im = cx.getImageData(0, 0, w, h), d = im.data;
      for (var i = 0; i < d.length; i += 4) {
        var lum = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2], a = Math.max(0, Math.min(255, (235 - lum) * 4));
        d[i + 3] = Math.min(d[i + 3], a);
      }
      cx.putImageData(im, 0, 0);
    }
    upPrev.hidden = false; $('#pe2-sg-ver').hidden = false;
  }
  $('#pe2-sg-file').onchange = function (e) {
    var f = e.target.files[0]; if (!f) { return; }
    var u = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      var k = Math.min(1, 900 / im.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); sgUp = c; URL.revokeObjectURL(u); upRender();
    };
    im.onerror = function () { status('Sorry, that image format is not supported.', true); };
    im.src = u;
  };
  root.querySelectorAll('#pe2-sg-ver [data-v]').forEach(function (b) {
    b.onclick = function () { sgVer = b.dataset.v; root.querySelectorAll('#pe2-sg-ver [data-v]').forEach(function (o) { o.classList.toggle('on', o === b); }); upRender(); };
  });
  /* saved signatures */
  function loadSaved() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function storeSaved(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 5))); } catch (e) { /* storage full or blocked */ } }
  function renderSaved() {
    var box = $('#pe2-signlist'); box.innerHTML = '';
    loadSaved().forEach(function (s, i) {
      var row = document.createElement('div'); row.className = 'pe2-saved';
      var pick = document.createElement('button'); pick.type = 'button'; pick.className = 'pick'; pick.title = 'Use this signature';
      var im = document.createElement('img'); im.src = s.src; im.alt = 'Saved signature ' + (i + 1); pick.appendChild(im);
      pick.onclick = function () { pending = { src: s.src, r: s.r }; setTool('place'); document.activeElement.blur(); };
      var del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = '\u00d7'; del.title = 'Remove saved signature';
      del.onclick = function () { var a = loadSaved(); a.splice(i, 1); storeSaved(a); renderSaved(); };
      row.appendChild(pick); row.appendChild(del); box.appendChild(row);
    });
  }
  renderSaved();
  /* open / close / save */
  function closeModal() { $('#pe2-modal').classList.remove('on'); }
  $('#pe2-signnew').onclick = function () {
    sx.clearRect(0, 0, sc.width, sc.height); sgPreview(); sgSetMode('type');
    $('#pe2-modal').classList.add('on'); sgName.focus(); document.activeElement === sgName || sgName.focus();
  };
  $('#pe2-scancel').onclick = closeModal; $('#pe2-mx').onclick = closeModal;
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    if ($('#pe2-modal').classList.contains('on')) { closeModal(); } else if (tool === 'place') { pending = null; setTool('select'); }
  });
  function sgFinish(cv) {
    var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (var y = 0; y < cv.height; y++) { for (var x = 0; x < cv.width; x++) { if (d[(y * cv.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } } }
    if (x1 < 0) { return false; }
    var w = x1 - x0 + 8, h = y1 - y0 + 8, c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(cv, x0 - 4, y0 - 4, w, h, 0, 0, w, h);
    pending = { src: c.toDataURL('image/png'), r: h / w };
    if ($('#pe2-sg-save').checked) { var a = loadSaved(); a.unshift({ src: pending.src, r: pending.r }); storeSaved(a); renderSaved(); }
    closeModal(); setTool('place'); return true;
  }
  $('#pe2-suse').onclick = function () {
    if (sgMode === 'draw') { sgFinish(sc); return; }
    if (sgMode === 'up') { if (sgUp) { sgFinish(upPrev); } return; }
    var txt = sgName.value.trim(); if (!txt) { sgName.focus(); return; }
    var fs = fstr(sgFont, 120);
    var go = function () {
      var cv = document.createElement('canvas'); cv.width = 1400; cv.height = 300;
      var cx = cv.getContext('2d'); cx.font = fs;
      var w = cx.measureText(txt).width; if (w > 1360) { cv.width = Math.ceil(w) + 40; cx = cv.getContext('2d'); cx.font = fs; }
      cx.fillStyle = sgColor; cx.textBaseline = 'middle'; cx.textAlign = 'left'; cx.fillText(txt, 20, 150); sgFinish(cv);
    };
    if (document.fonts && document.fonts.load) { document.fonts.load(fs, txt).then(go, go); } else { go(); }
  };

  /* ---------- export ---------- */
  function ensureFontkit() {
    if (window.fontkit) { return Promise.resolve(); }
    return new Promise(function (res, rej) { var sc2 = document.createElement('script'); sc2.src = '/static/js/vendor/fontkit.umd.min.js'; sc2.onload = res; sc2.onerror = function () { rej(new Error('Could not load the font engine.')); }; document.head.appendChild(sc2); });
  }
  var rgb = PL.rgb;
  function hex(h) { var n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }
  function clean(s) { return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?'); }
  $('#pe2-save').onclick = async function () {
    var btn = $('#pe2-save'), old = btn.textContent; btn.textContent = 'Working...'; btn.disabled = true; status('');
    try {
      var src = await PL.PDFDocument.load(srcBytes, { ignoreEncryption: true }), hasForm = Object.keys(forms).length > 0;
      var out = hasForm ? src : await PL.PDFDocument.create();
      if (hasForm) { /* edit the original document in place so its form (AcroForm) stays intact */
        var keep = {}; pages.forEach(function (q) { if (q.n) { keep[q.n] = 1; } });
        for (var rm = src.getPageCount(); rm >= 1; rm--) { if (!keep[rm]) { src.removePage(rm - 1); } }
        pages.forEach(function (q, qi) { if (!q.n) { src.insertPage(qi, [q.w, q.h]); } });
      }
      var font = await out.embedFont(PL.StandardFonts.Helvetica), fk = 0, lossy = false, fcache = {};
      if (pages.some(function (q) { return q.objs.some(function (z) { return z.t === 'edit' && z.text; }); })) { await ensureFontkit(); out.registerFontkit(window.fontkit); }
      var libFont = async function (z) {
        var key = z.f + z.b + z.i;
        if (!fcache[key]) {
          var nm = { sans: 'Sans', serif: 'Serif', mono: 'Mono' }[z.f] + '-' + (z.b && z.i ? 'BoldItalic' : z.b ? 'Bold' : z.i ? 'Italic' : 'Regular');
          var rsp = await fetch('/static/fonts/pdf/Liberation' + nm + '.ttf'); if (!rsp.ok) { throw new Error('Could not load a font file.'); }
          fcache[key] = await out.embedFont(await rsp.arrayBuffer(), { subset: true });
        }
        return fcache[key];
      };
      for (var pi = 0; pi < pages.length; pi++) {
        var pg = pages[pi], page;
        if (hasForm) { page = out.getPage(pi); } else if (pg.n) { page = (await out.copyPages(src, [pg.n - 1]))[0]; out.addPage(page); } else { page = out.addPage([pg.w, pg.h]); }
        var H = pg.h, Y = function (y) { return H - y; };
        var line = function (a, b, th, c) { page.drawLine({ start: { x: a[0], y: Y(a[1]) }, end: { x: b[0], y: Y(b[1]) }, thickness: th, color: c, lineCap: 1 }); };
        for (var k = 0; k < pg.objs.length; k++) {
          var o = pg.objs[k];
          if (o.t === 'text') {
            o.text.split('\n').forEach(function (l, j) { page.drawText(clean(l), { x: o.x, y: Y(o.y + o.size * (1 + 1.2 * j)), size: o.size, font: font, color: hex(o.c) }); });
          } else if (o.t === 'whiteout') { page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: rgb(1, 1, 1) }); }
          else if (o.t === 'highlight') { page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: hex(o.c), opacity: .4 }); }
          else if (o.t === 'rect') { page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, borderColor: hex(o.c), borderWidth: o.sw }); }
          else if (o.t === 'ellipse') { page.drawEllipse({ x: o.x + o.w / 2, y: Y(o.y + o.h / 2), xScale: o.w / 2, yScale: o.h / 2, borderColor: hex(o.c), borderWidth: o.sw }); }
          else if (o.t === 'path') {
            var c = hex(o.c);
            for (var m = 1; m < o.pts.length; m++) { line(o.pts[m - 1], o.pts[m], o.sw, c); }
            if (o.arrow && o.pts.length > 1) { var e = o.pts[o.pts.length - 1]; arrowHead(o.pts[0], e).forEach(function (p) { line(e, p, o.sw, c); }); }
          } else if (o.t === 'check') {
            var cc = hex(o.c), P = function (a, b) { return [o.x + o.w * a, o.y + o.h * b]; };
            line(P(.15, .55), P(.4, .85), 2, cc); line(P(.4, .85), P(.85, .15), 2, cc);
          } else if (o.t === 'edit') {
            page.drawRectangle({ x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h, color: hex(o.bg) });
            if (o.text) {
              var lf = await libFont(o), cs = new Set(lf.getCharacterSet()), tx = '';
              for (var ch of o.text) { if (cs.has(ch.codePointAt(0))) { tx += ch; } else { tx += '?'; lossy = true; } }
              page.drawText(tx, { x: o.tx, y: Y(o.base), size: o.size, font: lf, color: hex(o.c) });
            }
          } else if (o.t === 'image') {
            var im = await out.embedPng(o.src); page.drawImage(im, { x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h });
          } else if (o.t === 'field') {
            var fm = out.getForm(), fnm; do { fnm = 'field' + (fk++); } while (fm.getFieldMaybe(fnm));
            fm.createTextField(fnm).addToPage(page, { x: o.x, y: Y(o.y + o.h), width: o.w, height: o.h });
          } else if (o.t === 'link') {
            var ctx = out.context;
            var ref = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [o.x, Y(o.y + o.h), o.x + o.w, Y(o.y)], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PL.PDFString.of(o.url) } }));
            page.node.addAnnot(ref);
          }
        }
      }
      if (hasForm) {
        var form = out.getForm();
        Object.keys(fv).forEach(function (nm) {
          var f = form.getFieldMaybe(nm), v = fv[nm]; if (!f) { return; }
          try {
            if (f instanceof PL.PDFTextField) {
              try { f.setText(v || undefined); } catch (e1) { f.setText(clean(v)); lossy = true; }
            } else if (f instanceof PL.PDFCheckBox) { if (v) { f.check(); } else { f.uncheck(); } }
            else if (f instanceof PL.PDFRadioGroup) { if (v) { f.select(v); } }
            else if (f instanceof PL.PDFDropdown || f instanceof PL.PDFOptionList) { if (v) { f.select(v); } }
          } catch (e2) { console.warn('Could not set field', nm, e2); }
        });
        if ($('#pe2-flat').checked) { form.flatten(); }
      }
      var bytes = await out.save(), a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      status('Done. Your edited PDF has been downloaded.' + (lossy ? ' Note: some characters (for example Urdu or Arabic) are not supported in edited text and were replaced with "?".' : ''));
    } catch (err) { console.error(err); status('Could not save the PDF: ' + err.message, true); }
    btn.textContent = old; btn.disabled = false;
  };
})();

/* Keep the editing toolbar (incl. Apply/Download) visible below the sticky site header while scrolling */
(function(){
  function setTop(){
    var h=document.querySelector('.site-header');
    var root=document.getElementById('pe2-root');
    if(root) root.style.setProperty('--pe2-top',(h?h.offsetHeight:0)+'px');
  }
  window.addEventListener('resize',setTop);
  window.addEventListener('load',setTop);
  document.addEventListener('DOMContentLoaded',setTop);
  setTop();
})();
