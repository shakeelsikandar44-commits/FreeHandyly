/* FreeHandyly - Word & Character Counter. Pure client-side; no text leaves the browser. */
(function () {
  'use strict';

  var READ_WPM = 225;
  var SPEAK_WPM = 130;
  var SAMPLE = 'FreeHandyly is a collection of free online tools. Each tool runs in your browser, so your text stays private.\n\n' +
    'Try pasting an article, an essay or a product description here. The counter updates as you type, shows how long the text takes to read, ' +
    'and highlights the keywords you use most. Good writing is clear, specific and easy to read. Clear writing helps readers and search engines alike.';

  var STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by ' +
    'can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its ' +
    'just me more most my no nor not of off on once only or other our ours out over own same she should so some such than that the their theirs ' +
    'them then there these they this those through to too under until up very was we were what when where which while who whom why will with ' +
    'would you your yours').split(' '));

  var WORD_RE = /[\p{L}\p{N}]+(?:['\u2019\-][\p{L}\p{N}]+)*/gu;

  function $(id) { return document.getElementById(id); }

  var el = {
    input: $('text-input'),
    words: $('stat-words'), chars: $('stat-chars'), noSpace: $('stat-chars-nospace'),
    sentences: $('stat-sentences'), paragraphs: $('stat-paragraphs'),
    reading: $('stat-reading'), speaking: $('stat-speaking'), avg: $('stat-avg'),
    limitSelect: $('limit-select'), limitText: $('limit-text'),
    limitBar: $('limit-bar'), limitProgress: $('limit-progress'),
    kwSize: $('kw-size'), kwExclude: $('kw-exclude'), kwBody: $('kw-body'), kwEmpty: $('kw-empty'),
    status: $('action-status'),
    paste: $('btn-paste'), copy: $('btn-copy'), clear: $('btn-clear'), sample: $('btn-sample')
  };
  if (!el.input) { return; }

  var nf = new Intl.NumberFormat('en-US');
  var statusTimer = null;
  var scheduled = false;

  function formatDuration(totalSeconds) {
    if (totalSeconds < 60) { return totalSeconds + ' sec'; }
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return m + ' min' + (s ? ' ' + s + ' sec' : '');
  }

  function tokenize(text) {
    var m = text.toLowerCase().match(WORD_RE);
    return m ? m : [];
  }

  function countSentences(text) {
    return text.split(/[.!?\u2026]+["')\]\u201d\u2019]*(?:\s+|$)/)
      .filter(function (s) { return /[\p{L}\p{N}]/u.test(s); }).length;
  }

  function countParagraphs(text) {
    return text.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; }).length;
  }

  function keywordRows(tokens, size, excludeCommon) {
    var counts = Object.create(null);
    var total = tokens.length - size + 1;
    if (total < 1) { return { rows: [], total: 0 }; }
    for (var i = 0; i < total; i++) {
      var gram = tokens.slice(i, i + size);
      if (excludeCommon) {
        if (STOP.has(gram[0]) || STOP.has(gram[size - 1])) { continue; }
        if (size === 1 && gram[0].length < 3) { continue; }
      }
      var key = gram.join(' ');
      counts[key] = (counts[key] || 0) + 1;
    }
    var rows = Object.keys(counts).map(function (k) { return { key: k, count: counts[k] }; });
    rows = rows.filter(function (r) { return size === 1 ? true : r.count > 1; });
    rows.sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : 1); });
    return { rows: rows.slice(0, 10), total: total };
  }

  function renderKeywords(tokens) {
    var size = parseInt(el.kwSize.value, 10) || 1;
    var result = keywordRows(tokens, size, el.kwExclude.checked);
    el.kwBody.textContent = '';
    if (!result.rows.length) {
      el.kwEmpty.hidden = false;
      el.kwEmpty.textContent = size === 1
        ? 'Type at least a few words to see your most-used keywords.'
        : 'No phrase appears more than once yet. Repeated phrases will show up here.';
      return;
    }
    el.kwEmpty.hidden = true;
    var frag = document.createDocumentFragment();
    result.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var a = document.createElement('td'); a.textContent = r.key;
      var b = document.createElement('td'); b.textContent = String(r.count); b.className = 'text-end';
      var c = document.createElement('td'); c.textContent = (r.count / result.total * 100).toFixed(2) + '%'; c.className = 'text-end';
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c);
      frag.appendChild(tr);
    });
    el.kwBody.appendChild(frag);
  }

  function renderLimit(charCount) {
    var limit = parseInt(el.limitSelect.value, 10) || 0;
    if (!limit) {
      el.limitText.textContent = '';
      el.limitBar.style.width = '0%';
      el.limitBar.className = 'progress-bar';
      el.limitProgress.setAttribute('aria-valuenow', '0');
      return;
    }
    var pct = Math.min(100, Math.round(charCount / limit * 100));
    var left = limit - charCount;
    el.limitBar.style.width = pct + '%';
    el.limitBar.className = 'progress-bar' + (left < 0 ? ' over' : (pct >= 90 ? ' near' : ''));
    el.limitProgress.setAttribute('aria-valuenow', String(pct));
    el.limitText.textContent = nf.format(charCount) + ' / ' + nf.format(limit) + ' characters (' +
      (left >= 0 ? nf.format(left) + ' left' : nf.format(-left) + ' over') + ')';
  }

  function update() {
    scheduled = false;
    var text = el.input.value;
    var tokens = tokenize(text);
    var words = tokens.length;
    var charCount = Array.from(text).length;
    var noSpaceCount = Array.from(text.replace(/\s/g, '')).length;
    var letters = tokens.reduce(function (sum, t) { return sum + Array.from(t.replace(/['\u2019\-]/g, '')).length; }, 0);

    el.words.textContent = nf.format(words);
    el.chars.textContent = nf.format(charCount);
    el.noSpace.textContent = nf.format(noSpaceCount);
    el.sentences.textContent = nf.format(countSentences(text));
    el.paragraphs.textContent = nf.format(countParagraphs(text));
    el.reading.textContent = formatDuration(Math.round(words / READ_WPM * 60));
    el.speaking.textContent = formatDuration(Math.round(words / SPEAK_WPM * 60));
    el.avg.textContent = words ? (letters / words).toFixed(1) : '0';

    renderLimit(charCount);
    renderKeywords(tokens);
  }

  function schedule() {
    if (scheduled) { return; }
    scheduled = true;
    /* requestAnimationFrame is paused in hidden tabs, so a short timeout is the fallback */
    var run = function () { if (scheduled) { update(); } };
    if (window.requestAnimationFrame) { window.requestAnimationFrame(run); }
    setTimeout(run, 120);
  }

  function say(message) {
    el.status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { el.status.textContent = ''; }, 2500);
  }

  function copyText() {
    var text = el.input.value;
    if (!text) { say('Nothing to copy yet.'); return; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { say('Copied to clipboard.'); },
        function () { fallbackCopy(); });
    } else { fallbackCopy(); }
  }

  function fallbackCopy() {
    el.input.focus();
    el.input.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    say(ok ? 'Copied to clipboard.' : 'Press Ctrl+C (or Cmd+C) to copy.');
  }

  function pasteText() {
    if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
      navigator.clipboard.readText().then(function (t) {
        el.input.value = t;
        update();
        el.input.focus();
        say(t ? 'Pasted.' : 'Clipboard is empty.');
      }, function () {
        el.input.focus();
        say('Browser blocked paste. Press Ctrl+V (or Cmd+V).');
      });
    } else {
      el.input.focus();
      say('Press Ctrl+V (or Cmd+V) to paste.');
    }
  }

  el.input.addEventListener('input', schedule);
  el.limitSelect.addEventListener('change', update);
  el.kwSize.addEventListener('change', update);
  el.kwExclude.addEventListener('change', update);
  el.copy.addEventListener('click', copyText);
  el.paste.addEventListener('click', pasteText);
  el.clear.addEventListener('click', function () { el.input.value = ''; update(); el.input.focus(); });
  el.sample.addEventListener('click', function () { el.input.value = SAMPLE; update(); });

  update();
})();
