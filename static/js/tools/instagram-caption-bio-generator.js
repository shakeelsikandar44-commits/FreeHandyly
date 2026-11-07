/* FreeHandyly - Instagram Caption & Bio Generator with Unicode font styles. Fully client-side. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  if (!$('ig-font-input')) { return; }
  var statusEl = $('ig-status');

  /* ---------- Unicode font styles ---------- */
  function mapper(o) {
    return function (str) {
      return Array.from(str).map(function (ch) {
        if (o.ex && o.ex[ch]) { return o.ex[ch]; }
        var c = ch.charCodeAt(0);
        if (c >= 65 && c <= 90 && o.U) { return String.fromCodePoint(o.U + c - 65); }
        if (c >= 97 && c <= 122 && o.L) { return String.fromCodePoint(o.L + c - 97); }
        if (c >= 48 && c <= 57 && o.D) { return String.fromCodePoint(o.D + c - 48); }
        return ch;
      }).join('');
    };
  }
  var circledDigits = { '0': '\u24EA' };
  for (var i = 1; i <= 9; i++) { circledDigits[String(i)] = String.fromCodePoint(0x2460 + i - 1); }
  var SMALL = Array.from('\u1D00\u0299\u1D04\u1D05\u1D07\uA730\u0262\u029C\u026A\u1D0A\u1D0B\u029F\u1D0D\u0274\u1D0F\u1D18\u01EB\u0280s\u1D1B\u1D1C\u1D20\u1D21x\u028F\u1D22');
  function combining(mark) {
    return function (s) { return Array.from(s).map(function (ch) { return /\s/.test(ch) ? ch : ch + mark; }).join(''); };
  }
  var STYLES = [
    { name: 'Bold', fn: mapper({ U: 0x1D5D4, L: 0x1D5EE, D: 0x1D7EC }) },
    { name: 'Italic', fn: mapper({ U: 0x1D608, L: 0x1D622 }) },
    { name: 'Bold italic', fn: mapper({ U: 0x1D63C, L: 0x1D656, D: 0x1D7EC }) },
    { name: 'Serif bold', fn: mapper({ U: 0x1D400, L: 0x1D41A, D: 0x1D7CE }) },
    { name: 'Serif italic', fn: mapper({ U: 0x1D434, L: 0x1D44E, ex: { h: '\u210E' } }) },
    { name: 'Script', fn: mapper({ U: 0x1D4D0, L: 0x1D4EA }) },
    { name: 'Gothic', fn: mapper({ U: 0x1D56C, L: 0x1D586 }) },
    { name: 'Double struck', fn: mapper({ U: 0x1D538, L: 0x1D552, D: 0x1D7D8,
        ex: { C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124' } }) },
    { name: 'Monospace', fn: mapper({ U: 0x1D670, L: 0x1D68A, D: 0x1D7F6 }) },
    { name: 'Circled', fn: mapper({ U: 0x24B6, L: 0x24D0, ex: circledDigits }) },
    { name: 'Squared', fn: function (s) { return mapper({ U: 0x1F130 })(s.toUpperCase()); } },
    { name: 'Small caps', fn: function (s) {
        return Array.from(s).map(function (ch) {
          var c = ch.toLowerCase().charCodeAt(0);
          return (c >= 97 && c <= 122) ? SMALL[c - 97] : ch;
        }).join('');
      } },
    { name: 'Strikethrough', fn: combining('\u0336') },
    { name: 'Underline', fn: combining('\u0332') }
  ];

  var fontInput = $('ig-font-input'), fontList = $('ig-font-list');
  function copyRow(text) {
    U.copyText(text).then(function (ok) { U.flash(statusEl, ok ? 'Copied.' : 'Copy failed.'); });
  }
  function renderFonts() {
    var text = fontInput.value || 'Your text here';
    fontList.textContent = '';
    STYLES.forEach(function (st) {
      var out = st.fn(text);
      var row = U.el('div', { 'class': 'style-row' });
      var left = U.el('div', { 'class': 'file-meta' });
      left.appendChild(U.el('div', { 'class': 'style-name' }, st.name));
      left.appendChild(U.el('div', { 'class': 'style-text' }, out));
      var btn = U.el('button', { type: 'button', 'class': 'btn btn-outline-ink btn-sm' }, 'Copy');
      btn.addEventListener('click', function () { copyRow(out); });
      row.appendChild(left); row.appendChild(btn); fontList.appendChild(row);
    });
  }
  fontInput.addEventListener('input', renderFonts);

  /* ---------- Captions ---------- */
  var TEMPLATES = {
    fun: ['Currently obsessed with {t}. No regrets.', '{T} is my love language.', 'Plot twist: it was {t} all along.',
          'Just here for the {t} and good vibes.', 'Me, myself and {t}. Best trio.', 'Today\u2019s mood: {t}.'],
    inspire: ['Small steps toward {t} still move you forward.', 'Start where you are. Use what you have. Do {t}.',
              'Your {t} journey is yours. Keep going.', 'Progress over perfection, one {t} moment at a time.',
              'Believe in the work you put into {t}.', 'Every expert in {t} was once a beginner.'],
    pro: ['A few lessons learned about {t} this week. Save this for later.', 'Three things worth knowing about {t}. Which one surprised you?',
          'Behind the scenes of our latest {t} project.', 'Quality {t} starts with consistent effort. Here is how we approach it.',
          'Question for the community: what is your biggest challenge with {t}?', 'New update on {t}: here is what changed and why it matters.'],
    minimal: ['{T}.', 'All about {t}.', 'Just {t}.', 'More {t}, less noise.', '{T} today.', 'Simply {t}.']
  };
  var EMOJI = { fun: ['\u2728', '\uD83D\uDE04', '\uD83D\uDD25', '\uD83D\uDE4C', '\uD83D\uDE0E'], inspire: ['\uD83C\uDF1F', '\uD83D\uDCAB', '\uD83C\uDF31', '\uD83D\uDE80', '\uD83D\uDCAA'],
                pro: ['\uD83D\uDCCC', '\u2705', '\uD83D\uDCBC', '\uD83D\uDCC8', '\uD83D\uDCA1'], minimal: [] };
  var GENERIC_TAGS = { fun: ['#goodvibes', '#instadaily'], inspire: ['#motivation', '#mindset'], pro: ['#tips', '#learning'], minimal: ['#simple'] };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function topicTags(topic) {
    var words = topic.toLowerCase().split(/\s+/).map(function (w) { return w.replace(/[^\p{L}\p{N}]+/gu, ''); }).filter(Boolean);
    var tags = [];
    var joined = words.join('');
    if (joined) { tags.push('#' + joined); }
    if (words.length > 1) { words.slice(0, 3).forEach(function (w) { if (w.length > 2) { tags.push('#' + w); } }); }
    return tags;
  }
  function addRow(listEl, text, extraNote) {
    var row = U.el('div', { 'class': 'style-row' });
    var left = U.el('div', { 'class': 'file-meta' });
    var body = U.el('div', { 'class': 'style-text' }, text); body.style.whiteSpace = 'pre-wrap';
    left.appendChild(body);
    if (extraNote) { left.appendChild(extraNote); }
    var btn = U.el('button', { type: 'button', 'class': 'btn btn-outline-ink btn-sm' }, 'Copy');
    btn.addEventListener('click', function () { copyRow(text); });
    row.appendChild(left); row.appendChild(btn); listEl.appendChild(row);
  }
  function generateCaptions() {
    var topic = $('ig-topic').value.trim();
    var list = $('ig-cap-list'); list.textContent = '';
    if (!topic) { list.appendChild(U.el('p', { 'class': 'status-line err' }, 'Enter a topic first, for example \u201Ccoffee\u201D.')); return; }
    var tone = $('ig-tone').value, useEmoji = $('ig-emoji').checked;
    var T = topic.charAt(0).toUpperCase() + topic.slice(1);
    var emojis = EMOJI[tone] || [];
    var tags = topicTags(topic).concat(GENERIC_TAGS[tone] || []).join(' ');
    shuffle(TEMPLATES[tone]).slice(0, 5).forEach(function (tpl, i) {
      var line = tpl.replace(/\{T\}/g, T).replace(/\{t\}/g, topic);
      if (useEmoji && emojis.length) { line += ' ' + emojis[i % emojis.length]; }
      addRow(list, line + '\n\n' + tags);
    });
  }
  $('ig-cap-gen').addEventListener('click', generateCaptions);
  $('ig-topic').addEventListener('keydown', function (e) { if (e.key === 'Enter') { generateCaptions(); } });

  /* ---------- Bio ---------- */
  function generateBios() {
    var name = $('ig-bio-name').value.trim(), what = $('ig-bio-do').value.trim(), cta = $('ig-bio-cta').value.trim();
    var ints = $('ig-bio-int').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 4);
    var list = $('ig-bio-list'); list.textContent = '';
    if (!name && !what && !ints.length) { list.appendChild(U.el('p', { 'class': 'status-line err' }, 'Fill in at least your name or what you do.')); return; }
    function join(lines) { return lines.filter(Boolean).join('\n'); }
    var intDot = ints.join(' \u2022 '), intBar = ints.join(' | '), intComma = ints.join(', ');
    var bios = [
      join([[name, what].filter(Boolean).join(' | '), intDot, cta ? '\uD83D\uDC47 ' + cta : '']),
      join([what ? what + ' \u2728' : name, intBar, cta]),
      join([name, [what, ints.slice(0, 2).join(' & ')].filter(Boolean).join(' \u00B7 '), cta ? cta + ' \u2193' : '']),
      [what, intComma, cta].filter(Boolean).join(' | '),
      join([name ? '\uD83D\uDCCD ' + name : '', what ? '\uD83D\uDCBC ' + what : '', intComma ? '\u2764\uFE0F ' + intComma : '', cta ? '\uD83D\uDC47 ' + cta : ''])
    ];
    bios.forEach(function (b) {
      var len = Array.from(b).length;
      var note = U.el('div', { 'class': 'file-sub' });
      var span = U.el('span', { 'class': len > 150 ? 'bad' : 'good' }, len + ' / 150 characters');
      note.appendChild(span);
      if (len > 150) { note.appendChild(document.createTextNode(' \u2013 too long for Instagram, trim it')); }
      addRow(list, b, note);
    });
  }
  $('ig-bio-gen').addEventListener('click', generateBios);

  U.tabs();
  renderFonts();
})();
