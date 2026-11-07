/* FreeHandyly - YouTube Tag & Hashtag Extractor (lookup via /api/youtube-tags; formatter is local). */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var urlEl = $('yt-url'); if (!urlEl) { return; }
  var statusEl = $('yt-status'), resultEl = $('yt-result'), chipsEl = $('yt-chips'), titleEl = $('yt-title');
  var currentTags = [];

  function parseTags(text) {
    var seen = Object.create(null), out = [];
    String(text || '').split(/[,\n\r]+/).forEach(function (raw) {
      var t = raw.replace(/^[\s#"']+|[\s"']+$/g, '').replace(/\s+/g, ' ');
      var key = t.toLowerCase();
      if (t && !seen[key]) { seen[key] = true; out.push(t); }
    });
    return out;
  }
  function toHashtags(tags) {
    var seen = Object.create(null), out = [];
    tags.forEach(function (t) {
      var h = t.replace(/[^\p{L}\p{N}_]+/gu, '');
      if (h && !seen[h.toLowerCase()]) { seen[h.toLowerCase()] = true; out.push('#' + h); }
    });
    return out.join(' ');
  }
  function charCount(tags) { return tags.join(',').length; }

  function showTags(tags) {
    currentTags = tags;
    chipsEl.textContent = '';
    tags.forEach(function (t) { chipsEl.appendChild(U.el('span', { 'class': 'chip' }, t)); });
    $('yt-count').textContent = String(tags.length);
    $('yt-chars').textContent = String(charCount(tags));
  }
  function setStatus(msg, isErr) { statusEl.textContent = msg; statusEl.className = 'status-line mt-2' + (isErr ? ' err' : ''); }

  function extract() {
    var link = urlEl.value.trim();
    if (!link) { setStatus('Paste a YouTube video link first.', true); return; }
    setStatus('Looking up the video\u2026'); resultEl.hidden = true;
    $('yt-extract').disabled = true;
    fetch('/api/youtube-tags?url=' + encodeURIComponent(link), { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { setStatus(res.d.error || 'Something went wrong.', true); return; }
        if (!res.d.tags || !res.d.tags.length) {
          setStatus(res.d.message || 'No public tags found for this video.', true);
          return;
        }
        titleEl.textContent = res.d.title || 'Video tags';
        showTags(res.d.tags);
        resultEl.hidden = false;
        setStatus('Found ' + res.d.tags.length + ' tags.');
      })
      .catch(function () { setStatus('Network problem. Check your connection and try again.', true); })
      .then(function () { $('yt-extract').disabled = false; });
  }

  $('yt-extract').addEventListener('click', extract);
  urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { extract(); } });
  $('yt-copy-tags').addEventListener('click', function () {
    U.copyText(currentTags.join(', ')).then(function (ok) { U.flash($('yt-copy-status'), ok ? 'Tags copied.' : 'Copy failed.'); });
  });
  $('yt-copy-hash').addEventListener('click', function () {
    U.copyText(toHashtags(currentTags)).then(function (ok) { U.flash($('yt-copy-status'), ok ? 'Hashtags copied.' : 'Copy failed.'); });
  });

  /* Manual formatter */
  var man = $('yt-manual');
  function updateManual() {
    var tags = parseTags(man.value);
    $('yt-man-tags').value = tags.join(', ');
    $('yt-man-hash').value = toHashtags(tags);
    $('yt-man-count').textContent = String(tags.length);
    $('yt-man-chars').textContent = String(charCount(tags));
  }
  man.addEventListener('input', updateManual);
  $('yt-man-copy-tags').addEventListener('click', function () { U.copyText($('yt-man-tags').value); });
  $('yt-man-copy-hash').addEventListener('click', function () { U.copyText($('yt-man-hash').value); });
  updateManual();
})();
