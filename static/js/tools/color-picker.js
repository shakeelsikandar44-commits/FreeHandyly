/* FreeHandyly - Color Picker & HEX Code Extractor. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var native = $('cp-native'); if (!native) { return; }
  var hexEl = $('cp-hex'), rgbEl = $('cp-rgb'), hslEl = $('cp-hsl'), swatch = $('cp-swatch'),
      contrastEl = $('cp-contrast'), statusEl = $('cp-status'), canvas = $('cp-canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });

  function hexToRgb(h) {
    h = String(h).trim().replace(/^#/, '');
    if (h.length === 3) { h = h.split('').map(function (c) { return c + c; }).join(''); }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) { return null; }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { var s = v.toString(16); return (s.length < 2 ? '0' : '') + s; }).join('').toUpperCase(); }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) { h = (g - b) / d + (g < b ? 6 : 0); } else if (max === g) { h = (b - r) / d + 2; } else { h = (r - g) / d + 4; }
      h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }
  function luminance(r, g, b) {
    var a = [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function ratio(l1, l2) { var hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
  function grade(r) { return r >= 7 ? 'AAA' : (r >= 4.5 ? 'AA' : (r >= 3 ? 'AA large text only' : 'fails')); }

  function setColor(rgb, typing) {
    var hex = rgbToHex(rgb[0], rgb[1], rgb[2]), hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    swatch.style.background = hex;
    native.value = hex.toLowerCase();
    if (!typing) { hexEl.value = hex; }
    rgbEl.value = 'rgb(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ')';
    hslEl.value = 'hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)';
    var L = luminance(rgb[0], rgb[1], rgb[2]), w = ratio(L, 1), k = ratio(L, 0);
    contrastEl.textContent = 'Contrast: white text ' + w.toFixed(1) + ':1 (' + grade(w) + '), black text ' + k.toFixed(1) + ':1 (' + grade(k) + ').';
  }

  native.addEventListener('input', function () { setColor(hexToRgb(native.value)); });
  hexEl.addEventListener('input', function () { var rgb = hexToRgb(hexEl.value); if (rgb) { setColor(rgb, true); } });
  hexEl.addEventListener('blur', function () { var rgb = hexToRgb(hexEl.value); if (rgb) { setColor(rgb); } });
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (b) {
    b.addEventListener('click', function () {
      U.copyText($(b.getAttribute('data-copy')).value).then(function (ok) { U.flash(statusEl, ok ? 'Copied.' : 'Copy failed.'); });
    });
  });

  if ('EyeDropper' in window) {
    var eye = $('cp-eye'); eye.hidden = false;
    eye.addEventListener('click', function () {
      new window.EyeDropper().open().then(function (r) { var rgb = hexToRgb(r.sRGBHex); if (rgb) { setColor(rgb); } }, function () { /* cancelled */ });
    });
  }

  /* ---- image sampling + palette ---- */
  function palette(img) {
    var c = document.createElement('canvas'), s = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
    var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
    var d = x.getImageData(0, 0, c.width, c.height).data, buckets = {};
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 125) { continue; }
      var key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      var b = buckets[key] || (buckets[key] = { n: 0, r: 0, g: 0, b: 0 });
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    }
    var list = Object.keys(buckets).map(function (k) { var b = buckets[k]; return { n: b.n, c: [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var chosen = [];
    list.forEach(function (e) {
      if (chosen.length >= 8) { return; }
      var far = chosen.every(function (o) {
        var dr = o[0] - e.c[0], dg = o[1] - e.c[1], db = o[2] - e.c[2];
        return Math.sqrt(dr * dr + dg * dg + db * db) > 48;
      });
      if (far) { chosen.push(e.c); }
    });
    return chosen;
  }

  function showPalette(colors) {
    var box = $('cp-palette'); box.textContent = '';
    colors.forEach(function (rgb) {
      var hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
      var b = U.el('button', { type: 'button', title: hex, 'aria-label': 'Use color ' + hex });
      b.style.background = hex;
      b.addEventListener('click', function () { setColor(rgb); });
      box.appendChild(b);
    });
    $('cp-pal-wrap').hidden = !colors.length;
  }

  function loadFile(files) {
    var f = files[0]; if (!f) { return; }
    U.loadImage(f).then(function (img) {
      var s = Math.min(1, 1000 / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * s); canvas.height = Math.round(img.naturalHeight * s);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.hidden = false; canvas.style.cursor = 'crosshair';
      showPalette(palette(img));
      statusEl.textContent = 'Click anywhere on the image to pick a color.';
    }, function () { statusEl.textContent = 'That image could not be read.'; });
  }
  U.bindDrop($('cp-drop'), $('cp-file'), loadFile);

  function pick(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.max(0, Math.min(canvas.width - 1, Math.floor((e.clientX - r.left) * canvas.width / r.width)));
    var y = Math.max(0, Math.min(canvas.height - 1, Math.floor((e.clientY - r.top) * canvas.height / r.height)));
    var p = ctx.getImageData(x, y, 1, 1).data;
    if (p[3] === 0) { return; }
    setColor([p[0], p[1], p[2]]);
  }
  canvas.addEventListener('click', pick);

  setColor(hexToRgb(native.value));
})();
