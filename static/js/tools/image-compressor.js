/* FreeHandyly - Image Compressor (canvas re-encode, quality + max width, ZIP download). */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var listEl = $('icmp-list'); if (!listEl) { return; }
  var items = [], run = 0, MAX = 30, lastSig = '';
  var fmtEl = $('icmp-format'), qEl = $('icmp-quality'), wEl = $('icmp-maxw'), zipBtn = $('icmp-zip'),
      clearBtn = $('icmp-clear'), statusEl = $('icmp-status'), sumEl = $('icmp-summary');

  function syncControls() { qEl.disabled = fmtEl.value === 'image/png'; $('icmp-quality-val').textContent = qEl.value; }

  function compress(item) {
    var mime = fmtEl.value, iw = item.img.naturalWidth, ih = item.img.naturalHeight;
    var maxW = parseInt(wEl.value, 10) || 0;
    var scale = maxW > 0 && iw > maxW ? maxW / iw : 1;
    return U.renderToBlob(item.img, {
      w: Math.max(1, Math.round(iw * scale)), h: Math.max(1, Math.round(ih * scale)),
      mime: mime, q: qEl.value / 100, bg: mime === 'image/jpeg' ? '#ffffff' : null
    }).then(function (r) {
      item.failed = !r.blob; item.fallback = !!r.blob && !r.ok;
      if (r.blob && r.blob.size >= item.file.size) { item.blob = item.file; item.kept = true; item.out = item.file.name; }
      else { item.blob = r.blob; item.kept = false; item.out = U.baseName(item.file.name) + '-compressed.' + U.extFor(r.blob ? r.blob.type : mime); }
    });
  }

  function render() {
    listEl.textContent = '';
    var totalIn = 0, totalOut = 0;
    items.forEach(function (it) {
      var row = U.el('div', { 'class': 'file-row' });
      row.appendChild(U.el('img', { alt: '', src: it.img._url }));
      var meta = U.el('div', { 'class': 'file-meta' });
      meta.appendChild(U.el('div', { 'class': 'file-name' }, it.file.name));
      var sub = U.el('div', { 'class': 'file-sub' });
      if (it.failed) { sub.appendChild(U.el('span', { 'class': 'bad' }, 'This format is not supported by your browser.')); }
      else if (!it.blob) { sub.textContent = 'Compressing\u2026'; }
      else {
        totalIn += it.file.size; totalOut += it.blob.size;
        var saved = Math.round((1 - it.blob.size / it.file.size) * 100);
        sub.appendChild(document.createTextNode(U.formatBytes(it.file.size) + ' \u2192 ' + U.formatBytes(it.blob.size) + '  '));
        sub.appendChild(U.el('span', { 'class': 'good' }, it.kept ? '(already optimised, original kept)' : '(' + saved + '% saved)'));
        if (it.fallback) { sub.appendChild(document.createTextNode('  Your browser cannot create the chosen format, so PNG was used. Try JPG.')); }
      }
      meta.appendChild(sub); row.appendChild(meta);
      var btn = U.el('button', { type: 'button', 'class': 'btn btn-outline-ink btn-sm' }, 'Download');
      btn.disabled = !it.blob;
      btn.addEventListener('click', function () { U.download(it.blob, it.out); });
      row.appendChild(btn); listEl.appendChild(row);
    });
    sumEl.textContent = totalIn ? 'Total: ' + U.formatBytes(totalIn) + ' \u2192 ' + U.formatBytes(totalOut) + ' (' + Math.round((1 - totalOut / totalIn) * 100) + '% saved)' : '';
    zipBtn.disabled = !items.some(function (i) { return i.blob; }); clearBtn.disabled = !items.length;
  }

  function compressAll() {
    /* skip when nothing changed (a blur-triggered change event must not rebuild the list under the user's click) */
    var sig = [fmtEl.value, qEl.value, wEl.value, items.length].join('|');
    if (sig === lastSig) { return Promise.resolve(); }
    lastSig = sig;
    var token = ++run, chain = Promise.resolve();
    items.forEach(function (it) { it.blob = null; it.failed = false; });
    render();
    items.forEach(function (it) {
      chain = chain.then(function () { if (token !== run) { return; } return compress(it).then(function () { if (token === run) { render(); } }); });
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
      compressAll();
    });
  }

  U.bindDrop($('icmp-drop'), $('icmp-files'), addFiles);
  [fmtEl, qEl, wEl].forEach(function (e) {
    e.addEventListener('input', syncControls);
    e.addEventListener('change', function () { syncControls(); compressAll(); });
  });
  zipBtn.addEventListener('click', function () {
    var ready = items.filter(function (i) { return i.blob; });
    FHZip.fromBlobs(ready.map(function (i) { return { name: i.out, blob: i.blob }; })).then(function (z) { U.download(z, 'compressed-images.zip'); });
  });
  clearBtn.addEventListener('click', function () {
    run++; lastSig = ''; items.forEach(function (i) { URL.revokeObjectURL(i.img._url); }); items = []; render();
  });
  syncControls(); render();
})();
