/* FreeHandyly - Image Format Converter (PNG / JPG / WebP, batch, ZIP download). */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var listEl = $('ic-list'); if (!listEl) { return; }
  var items = [], run = 0, MAX = 30, lastSig = '';
  var fmtEl = $('ic-format'), qEl = $('ic-quality'), bgEl = $('ic-bg'), zipBtn = $('ic-zip'), clearBtn = $('ic-clear'), statusEl = $('ic-status');

  function syncControls() {
    var lossy = fmtEl.value !== 'image/png';
    qEl.disabled = !lossy;
    bgEl.disabled = fmtEl.value !== 'image/jpeg';
    $('ic-quality-val').textContent = qEl.value;
  }

  function convert(item) {
    var mime = fmtEl.value;
    return U.renderToBlob(item.img, {
      w: item.img.naturalWidth || 1024, h: item.img.naturalHeight || 1024,
      mime: mime, q: qEl.value / 100, bg: mime === 'image/jpeg' ? bgEl.value : null
    }).then(function (r) {
      item.blob = r.blob; item.fallback = !!r.blob && !r.ok; item.failed = !r.blob;
      item.out = U.baseName(item.file.name) + '.' + U.extFor(r.blob ? r.blob.type : mime);
    });
  }

  function render() {
    listEl.textContent = '';
    items.forEach(function (it) {
      var row = U.el('div', { 'class': 'file-row' });
      var th = U.el('img', { alt: '', src: it.img._url }); row.appendChild(th);
      var meta = U.el('div', { 'class': 'file-meta' });
      meta.appendChild(U.el('div', { 'class': 'file-name' }, it.blob ? it.out : it.file.name));
      var sub = U.el('div', { 'class': 'file-sub' });
      if (it.failed) { sub.appendChild(U.el('span', { 'class': 'bad' }, 'Your browser could not create this format.')); }
      else if (!it.blob) { sub.textContent = 'Converting\u2026'; }
      else {
        var diff = Math.round((1 - it.blob.size / it.file.size) * 100);
        sub.appendChild(document.createTextNode(U.formatBytes(it.file.size) + ' \u2192 ' + U.formatBytes(it.blob.size) + '  '));
        sub.appendChild(U.el('span', { 'class': diff >= 0 ? 'good' : 'bad' }, diff >= 0 ? '(' + diff + '% smaller)' : '(' + (-diff) + '% larger)'));
        if (it.fallback) { sub.appendChild(document.createTextNode('  Saved as PNG: this browser cannot encode the chosen format.')); }
      }
      meta.appendChild(sub); row.appendChild(meta);
      var btn = U.el('button', { type: 'button', 'class': 'btn btn-outline-ink btn-sm' }, 'Download');
      btn.disabled = !it.blob;
      btn.addEventListener('click', function () { U.download(it.blob, it.out); });
      row.appendChild(btn); listEl.appendChild(row);
    });
    var ready = items.filter(function (i) { return i.blob; }).length;
    zipBtn.disabled = ready < 1 || items.some(function (i) { return !i.blob && !i.failed; }); clearBtn.disabled = !items.length;
  }

  function convertAll() {
    var sig = [fmtEl.value, qEl.value, bgEl.value, items.length].join('|');
    if (sig === lastSig) { return Promise.resolve(); }
    lastSig = sig;
    var token = ++run, chain = Promise.resolve();
    items.forEach(function (it) { it.blob = null; it.failed = false; });
    render();
    items.forEach(function (it) {
      chain = chain.then(function () { if (token !== run) { return; } return convert(it).then(function () { if (token === run) { render(); } }); });
    });
    return chain;
  }

  function addFiles(files) {
    files = files.filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) { U.flash(statusEl, 'Please choose image files.'); return; }
    var room = MAX - items.length;
    if (files.length > room) { U.flash(statusEl, 'Limit is ' + MAX + ' images. Extra files were skipped.', 4000); files = files.slice(0, Math.max(room, 0)); }
    Promise.all(files.map(function (f) {
      return U.loadImage(f).then(function (img) { return { file: f, img: img, blob: null }; }, function () { return null; });
    })).then(function (loaded) {
      loaded.forEach(function (l) { if (l) { items.push(l); } else { U.flash(statusEl, 'One file could not be read.', 4000); } });
      convertAll();
    });
  }

  U.bindDrop($('ic-drop'), $('ic-files'), addFiles);
  [fmtEl, qEl, bgEl].forEach(function (e) { e.addEventListener('input', function () { syncControls(); }); e.addEventListener('change', function () { syncControls(); convertAll(); }); });
  zipBtn.addEventListener('click', function () {
    var ready = items.filter(function (i) { return i.blob; });
    FHZip.fromBlobs(ready.map(function (i) { return { name: i.out, blob: i.blob }; })).then(function (z) { U.download(z, 'converted-images.zip'); });
  });
  clearBtn.addEventListener('click', function () {
    run++; lastSig = ''; items.forEach(function (i) { URL.revokeObjectURL(i.img._url); }); items = []; render();
  });
  syncControls(); render();
})();
