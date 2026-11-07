/* FreeHandyly shared helpers: clipboard, downloads, images, tabs, drag & drop. */
window.FH = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function formatBytes(n) {
    if (n < 1024) { return n + ' B'; }
    if (n < 1048576) { return (n / 1024).toFixed(1) + ' KB'; }
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function flash(el, message, ms) {
    if (!el) { return; }
    el.textContent = message;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; }, ms || 2500);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) { a.parentNode.removeChild(a); } }, 2000);
  }

  function baseName(name) { return (name || 'file').replace(/\.[^.\/\\]+$/, '') || 'file'; }
  function extFor(mime) { return mime === 'image/jpeg' ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png'); }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { img._url = url; resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read ' + file.name)); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) { canvas.toBlob(function (b) { resolve(b); }, mime, quality); }
      else { resolve(null); }
    });
  }

  /* Draw an image into a new canvas of w x h and encode it. bg fills transparency. */
  function renderToBlob(img, o) {
    var c = document.createElement('canvas');
    c.width = o.w; c.height = o.h;
    var ctx = c.getContext('2d');
    if (o.bg) { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, o.w, o.h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, o.w, o.h);
    return canvasToBlob(c, o.mime, o.q).then(function (blob) {
      return { blob: blob, ok: !!blob && blob.type === o.mime };
    });
  }

  function bindDrop(zone, input, onFiles) {
    if (!zone) { return; }
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { onFiles(Array.prototype.slice.call(e.dataTransfer.files)); }
    });
    if (input) {
      input.addEventListener('change', function () {
        onFiles(Array.prototype.slice.call(input.files || []));
        try { input.value = ''; } catch (e) { /* ignore */ }
      });
    }
  }

  function tabs(onChange) {
    var btns = Array.prototype.slice.call(document.querySelectorAll('.tool-tab[data-tab]'));
    function show(name) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
      Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.hidden = p.id !== 'tab-' + name; });
      if (onChange) { onChange(name); }
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
    return show;
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) { Object.keys(attrs).forEach(function (k) { if (k === 'class') { n.className = attrs[k]; } else { n.setAttribute(k, attrs[k]); } }); }
    if (text != null) { n.textContent = text; }
    return n;
  }

  return { $: $, formatBytes: formatBytes, flash: flash, copyText: copyText, download: download, baseName: baseName,
           extFor: extFor, loadImage: loadImage, canvasToBlob: canvasToBlob, renderToBlob: renderToBlob,
           bindDrop: bindDrop, tabs: tabs, el: el };
})();
