/* FreeHandyly - Video & audio tools (trim, resize, remove logo).
   FFmpeg runs in the browser as WebAssembly (self-hosted in /static/js/vendor/ffmpeg/). Files are never uploaded. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var root = $('vt-tool'); if (!root) { return; }
  var mode = root.getAttribute('data-mode');
  var MAX_BYTES = 1024 * 1024 * 1024;
  var BASE = '/static/js/vendor/ffmpeg/';
  var drop = $('vt-drop'), input = $('vt-file'), work = $('vt-work'), stage = $('vt-stage'), video = $('vt-video'), ov = $('vt-ov');
  var runBtn = $('vt-run'), cancelBtn = $('vt-cancel'), prog = $('vt-prog'), bar = $('vt-bar'), statusEl = $('vt-status');
  var file = null, isAudio = false, ff = null, busy = false, cancelled = false, outUrl = null, lastLog = [];

  function setStatus(msg, bad) { statusEl.textContent = msg || ''; statusEl.className = 'status-line' + (bad ? ' err' : ''); }
  function setBar(p) { bar.style.width = p + '%'; bar.setAttribute('aria-valuenow', p); bar.textContent = p ? p + '%' : ''; }
  function fmt(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60); return m + ':' + (t - m * 60).toFixed(1).padStart(4, '0'); }
  function parseTime(s) {
    var p = String(s).trim().split(':').map(parseFloat), t = 0, i;
    for (i = 0; i < p.length; i++) { if (isNaN(p[i])) { return NaN; } t = t * 60 + p[i]; }
    return t;
  }
  function extOf(name) { var m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function abs(p) { return location.origin + p; }

  /* ---------- choose a file ---------- */
  function onFiles(files) {
    var f = files[0]; if (!f) { return; }
    var audioExt = /^(mp3|wav|m4a|aac|ogg|flac)$/.test(extOf(f.name));
    if (!/^(video|audio)\//.test(f.type) && !audioExt && !/^(mp4|mov|m4v|webm|mkv|avi)$/.test(extOf(f.name))) { setStatus('Please choose a video or audio file.', true); return; }
    if (f.size > MAX_BYTES) { setStatus('This file is larger than 1 GB, which is too big to process in a browser tab. Try a shorter clip.', true); return; }
    isAudio = /^audio\//.test(f.type) || audioExt;
    if (isAudio && mode !== 'trim') { setStatus('This tool needs a video file. For audio, use the Video & Audio Trimmer.', true); return; }
    file = f; rects = []; drawRects(); clearResult(); setStatus('');
    if (video.src) { URL.revokeObjectURL(video.src); }
    video.src = URL.createObjectURL(f);
    stage.classList.toggle('is-audio', isAudio);
    $('vt-name').textContent = f.name + ' (' + U.formatBytes(f.size) + ')';
    drop.hidden = true; work.hidden = false;
  }
  U.bindDrop(drop, input, onFiles);
  $('vt-change').addEventListener('click', function () { if (!busy) { input.click(); } });

  video.addEventListener('loadedmetadata', function () {
    var d = video.duration || 1;
    if (mode === 'trim') { sEl.max = eEl.max = d; sEl.value = 0; eEl.value = d; syncTrim(); }
    if (mode === 'resize') { $('vt-orig').textContent = 'Original: ' + video.videoWidth + ' x ' + video.videoHeight + ' px'; }
    sizeOverlay();
  });
  video.addEventListener('error', function () { setStatus('Your browser cannot preview this file, but it may still convert. Try MP4 if it fails.', true); });

  /* ---------- trim controls ---------- */
  var sEl = $('vt-start'), eEl = $('vt-end');
  function syncTrim(from) {
    var s = parseFloat(sEl.value), e = parseFloat(eEl.value);
    if (s > e - 0.1) { if (from === 'e') { s = Math.max(0, e - 0.1); sEl.value = s; } else { e = Math.min(video.duration, s + 0.1); eEl.value = e; } }
    $('vt-start-t').value = fmt(s); $('vt-end-t').value = fmt(e); $('vt-len').textContent = fmt(e - s);
  }
  if (mode === 'trim') {
    sEl.addEventListener('input', function () { syncTrim('s'); video.currentTime = parseFloat(sEl.value); });
    eEl.addEventListener('input', function () { syncTrim('e'); video.currentTime = parseFloat(eEl.value); });
    [['vt-start-t', sEl, 's'], ['vt-end-t', eEl, 'e']].forEach(function (a) {
      $(a[0]).addEventListener('change', function () {
        var t = parseTime(this.value); if (!isNaN(t)) { a[1].value = Math.min(Math.max(t, 0), video.duration || t); }
        syncTrim(a[2]);
      });
    });
    $('vt-set-start').addEventListener('click', function () { sEl.value = video.currentTime; syncTrim('s'); });
    $('vt-set-end').addEventListener('click', function () { eEl.value = video.currentTime; syncTrim('e'); });
    $('vt-play').addEventListener('click', function () { video.currentTime = parseFloat(sEl.value); video.play(); });
    video.addEventListener('timeupdate', function () { if (!video.paused && video.currentTime >= parseFloat(eEl.value)) { video.pause(); } });
    $('vt-trimmode').addEventListener('change', function () { $('vt-quality-row').hidden = this.value === 'fast'; });
  }

  /* ---------- resize controls ---------- */
  if (mode === 'resize') {
    var pbtns = Array.prototype.slice.call(document.querySelectorAll('.vt-presets .btn'));
    pbtns.forEach(function (b) {
      b.addEventListener('click', function () {
        $('vt-w').value = b.getAttribute('data-w'); $('vt-h').value = b.getAttribute('data-h');
        pbtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      });
    });
    ['vt-w', 'vt-h'].forEach(function (id) { $(id).addEventListener('input', function () { pbtns.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); }); });
  }

  /* ---------- logo areas ---------- */
  var rects = [], start = null, cur = null;
  function sizeOverlay() { if (!ov) { return; } ov.width = video.clientWidth; ov.height = video.clientHeight; drawRects(); }
  function drawRects() {
    if (!ov) { return; }
    var c = ov.getContext('2d'); c.clearRect(0, 0, ov.width, ov.height);
    c.lineWidth = 2; c.strokeStyle = '#FFB020'; c.fillStyle = 'rgba(255,176,32,.3)';
    rects.concat(cur ? [cur] : []).forEach(function (r) { c.fillRect(r.x, r.y, r.w, r.h); c.strokeRect(r.x, r.y, r.w, r.h); });
    var n = $('vt-count'); if (n) { n.textContent = rects.length + (rects.length === 1 ? ' area selected' : ' areas selected'); }
  }
  if (mode === 'logo') {
    stage.classList.add('is-logo');
    video.controls = false;
    $('vt-pp').addEventListener('click', function () { if (video.paused) { video.play(); } else { video.pause(); } });
    video.addEventListener('play', function () { $('vt-pp').textContent = 'Pause'; });
    video.addEventListener('pause', function () { $('vt-pp').textContent = 'Play'; });
    video.addEventListener('loadedmetadata', function () { $('vt-seek').max = video.duration || 1; });
    video.addEventListener('timeupdate', function () { $('vt-seek').value = video.currentTime; $('vt-pos').textContent = fmt(video.currentTime); });
    $('vt-seek').addEventListener('input', function () { video.currentTime = parseFloat(this.value); });
    if (window.ResizeObserver) { new ResizeObserver(sizeOverlay).observe(video); } else { window.addEventListener('resize', sizeOverlay); }
    var pos = function (e) { var r = ov.getBoundingClientRect(); return { x: Math.min(Math.max(e.clientX - r.left, 0), r.width), y: Math.min(Math.max(e.clientY - r.top, 0), r.height) }; };
    ov.addEventListener('pointerdown', function (e) { start = pos(e); ov.setPointerCapture(e.pointerId); });
    ov.addEventListener('pointermove', function (e) { if (!start) { return; } var p = pos(e); cur = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) }; drawRects(); });
    ov.addEventListener('pointerup', function () { if (cur && cur.w > 6 && cur.h > 6) { rects.push(cur); } start = cur = null; drawRects(); });
    $('vt-undo').addEventListener('click', function () { rects.pop(); drawRects(); });
    $('vt-clear').addEventListener('click', function () { rects = []; drawRects(); });
  }

  /* ---------- FFmpeg ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = function () { rej(new Error('Could not load the video engine. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  function getFF() {
    if (ff) { return Promise.resolve(ff); }
    var ready = window.FFmpegWASM ? Promise.resolve() : loadScript(BASE + 'util.js').then(function () { return loadScript(BASE + 'ffmpeg.js'); });
    return ready.then(function () {
      var inst = new window.FFmpegWASM.FFmpeg();
      inst.on('progress', function (e) { setBar(Math.max(0, Math.min(100, Math.round((e.progress || 0) * 100)))); });
      inst.on('log', function (e) { lastLog.push(e.message); if (lastLog.length > 40) { lastLog.shift(); } });
      return inst.load({ coreURL: abs(BASE + 'ffmpeg-core.js'), wasmURL: abs(BASE + 'ffmpeg-core.wasm') })
        .then(function () { ff = inst; return inst; });
    });
  }

  function enc() {
    var q = ($('vt-quality') || {}).value || 'balanced';
    var p = { fast: ['ultrafast', '28'], balanced: ['superfast', '24'], high: ['veryfast', '20'] }[q] || ['superfast', '24'];
    return ['-c:v', 'libx264', '-preset', p[0], '-crf', p[1], '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
  }
  var even = function (n) { return Math.max(2, Math.round(n / 2) * 2); };

  function buildJob() {
    var ext = extOf(file.name) || (isAudio ? 'mp3' : 'mp4'), tag, out, args;
    if (mode === 'trim') {
      var s = parseFloat(sEl.value), e = parseFloat(eEl.value);
      if (!(e - s >= 0.1)) { throw new Error('Choose an end time that is after the start time.'); }
      var fast = $('vt-trimmode').value === 'fast';
      tag = 'trimmed';
      if (fast) { out = 'out.' + ext; args = ['-ss', String(s), '-i', 'IN', '-t', String(e - s), '-c', 'copy', '-avoid_negative_ts', 'make_zero', out]; }
      else if (isAudio) { out = 'out.mp3'; args = ['-ss', String(s), '-i', 'IN', '-t', String(e - s), '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out]; }
      else { out = 'out.mp4'; args = ['-ss', String(s), '-i', 'IN', '-t', String(e - s)].concat(enc(), [out]); }
    } else if (mode === 'resize') {
      var W = parseInt($('vt-w').value, 10), H = parseInt($('vt-h').value, 10);
      if (!(W >= 64 && H >= 64 && W <= 3840 && H <= 3840)) { throw new Error('Width and height must be between 64 and 3840 pixels.'); }
      W = even(W); H = even(H);
      var fit = $('vt-fit').value;
      var vf = fit === 'pad' ? 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2:black,setsar=1'
        : fit === 'crop' ? 'scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',setsar=1'
        : 'scale=' + W + ':' + H + ',setsar=1';
      tag = W + 'x' + H; out = 'out.mp4';
      args = ['-i', 'IN', '-vf', vf].concat(enc(), [out]);
    } else {
      if (!rects.length) { throw new Error('Drag on the video to cover the logo first.'); }
      var k = video.videoWidth / video.clientWidth, iw = video.videoWidth, ih = video.videoHeight;
      var R = rects.map(function (r) {
        var x = Math.max(1, Math.round(r.x * k)), y = Math.max(1, Math.round(r.y * k));
        return { x: x, y: y, w: Math.max(2, Math.min(Math.round(r.w * k), iw - x - 1)), h: Math.max(2, Math.min(Math.round(r.h * k), ih - y - 1)) };
      });
      tag = 'no-logo'; out = 'out.mp4';
      if ($('vt-method').value === 'erase') {
        args = ['-i', 'IN', '-vf', R.map(function (r) { return 'delogo=x=' + r.x + ':y=' + r.y + ':w=' + r.w + ':h=' + r.h; }).join(',')].concat(enc(), [out]);
      } else {
        var g = R.map(function (r, i) {
          return '[v' + i + ']split[a' + i + '][b' + i + '];[b' + i + ']crop=' + r.w + ':' + r.h + ':' + r.x + ':' + r.y + ',gblur=sigma=15:steps=2[c' + i + '];[a' + i + '][c' + i + ']overlay=' + r.x + ':' + r.y + '[v' + (i + 1) + ']';
        }).join(';');
        args = ['-i', 'IN', '-filter_complex', '[0:v]null[v0];' + g, '-map', '[v' + R.length + ']', '-map', '0:a?'].concat(enc(), [out]);
      }
    }
    return { ext: ext, tag: tag, out: out, args: args };
  }

  function clearResult() { $('vt-out').hidden = true; if (outUrl) { URL.revokeObjectURL(outUrl); outUrl = null; } }
  function finish() {
    busy = false; runBtn.disabled = false; cancelBtn.hidden = true; $('vt-change').disabled = false; prog.hidden = true;
  }

  function run() {
    if (busy || !file) { return; }
    var job; try { job = buildJob(); } catch (err) { setStatus(err.message, true); return; }
    busy = true; cancelled = false; lastLog = []; clearResult();
    runBtn.disabled = true; cancelBtn.hidden = false; $('vt-change').disabled = true; prog.hidden = false; setBar(0);
    var inName = 'input.' + (job.ext || 'mp4'), args = job.args.map(function (a) { return a === 'IN' ? inName : a; }), eng;
    setStatus('Loading the video engine (first time only)...');
    getFF().then(function (inst) {
      eng = inst; setStatus('Reading your file...');
      return file.arrayBuffer().then(function (buf) { return eng.writeFile(inName, new Uint8Array(buf)); });
    }).then(function () {
      setStatus('Working. Keep this tab open.'); return eng.exec(args);
    }).then(function (code) {
      if (code !== 0) { throw new Error('This file could not be processed. Try an MP4 file, or a shorter clip.'); }
      return eng.readFile(job.out);
    }).then(function (data) {
      var type = job.out.slice(-3) === 'mp3' ? 'audio/mpeg' : (file.type || 'video/mp4');
      if (/\.mp4$/.test(job.out)) { type = 'video/mp4'; }
      var blob = new Blob([data.buffer], { type: type }), name = U.baseName(file.name) + '-' + job.tag + '.' + job.out.split('.').pop();
      outUrl = URL.createObjectURL(blob);
      $('vt-outvideo').src = outUrl;
      $('vt-info').textContent = name + ': ' + U.formatBytes(blob.size) + ' (original ' + U.formatBytes(file.size) + ')';
      $('vt-dl').onclick = function () { U.download(blob, name); };
      $('vt-out').hidden = false; setBar(100); setStatus('Done. Check the preview, then download.');
      eng.deleteFile(inName).catch(function () {}); eng.deleteFile(job.out).catch(function () {});
    }).catch(function (err) {
      if (window.console) { console.warn(lastLog.join('\n')); }
      setStatus(cancelled ? 'Cancelled.' : (err && err.message && err.message.indexOf('terminate') < 0 ? err.message : 'Something went wrong. Try a smaller file.'), !cancelled);
    }).then(finish);
  }
  runBtn.addEventListener('click', run);
  cancelBtn.addEventListener('click', function () { cancelled = true; if (ff) { ff.terminate(); ff = null; } });
})();
