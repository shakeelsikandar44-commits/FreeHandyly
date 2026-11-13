/* FreeHandyly - Resume Maker. Everything is built in the browser; data is kept only in this browser's localStorage.
   "Download PDF" uses the browser print engine on a clone of the preview, which keeps text selectable
   and supports every script the device can display. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var root = $('rs-root'); if (!root) { return; }
  var KEY = 'freehandyly.resume.v1', PAGE_W = 794, MM = 96 / 25.4;

  var SAMPLE = {
    tpl: 'modern', accent: '#0A63E8', size: 'normal', showPhoto: true, photo: '',
    name: 'Ayesha Khan', title: 'Digital Marketing Manager', email: 'ayesha.khan@example.com', phone: '+92 300 1234567',
    location: 'Lahore, Pakistan', link1: 'linkedin.com/in/ayeshakhan', link2: '',
    summary: 'Results-driven marketing manager with 6+ years of experience growing brands through SEO, paid media and content strategy. Skilled at turning data into clear campaigns that increase traffic, leads and revenue.',
    exp: [
      { role: 'Digital Marketing Manager', company: 'BrightPath Agency', place: 'Lahore', start: 'Mar 2021', end: 'Present',
        bullets: 'Led a team of 5 to manage campaigns for 20+ clients\nIncreased organic traffic by 120% in 12 months through SEO and content\nReduced cost per lead by 28% by optimising paid campaigns' },
      { role: 'Marketing Executive', company: 'Nova Retail', place: 'Karachi', start: 'Jun 2018', end: 'Feb 2021',
        bullets: 'Planned and ran social media campaigns reaching 500K+ people\nCreated weekly email newsletters with a 32% average open rate' }
    ],
    edu: [{ degree: 'BBA in Marketing', school: 'Lahore University', place: 'Lahore', start: '2014', end: '2018', details: 'First class honours. President of the marketing society.' }],
    skills: 'SEO, Google Analytics, Google Ads, Content Strategy, Social Media, Email Marketing, Team Leadership',
    langs: 'English (fluent), Urdu (native)',
    extraTitle: 'Certifications', extra: [{ title: 'Google Analytics Certification', sub: '2023', desc: '' }, { title: 'HubSpot Content Marketing', sub: '2022', desc: '' }]
  };
  var LISTS = {
    exp: { el: 'rs-exp', label: 'Position', blank: { role: '', company: '', place: '', start: '', end: '', bullets: '' },
           fields: [['role', 'Job title'], ['company', 'Company'], ['place', 'Location'], ['start', 'Start (e.g. Jan 2022)'], ['end', 'End (e.g. Present)'], ['bullets', 'Achievements, one per line', 'textarea']] },
    edu: { el: 'rs-edu', label: 'Education', blank: { degree: '', school: '', place: '', start: '', end: '', details: '' },
           fields: [['degree', 'Degree or course'], ['school', 'School or university'], ['place', 'Location'], ['start', 'Start year'], ['end', 'End year'], ['details', 'Details (optional)', 'textarea']] },
    extra: { el: 'rs-extra', label: 'Item', blank: { title: '', sub: '', desc: '' },
             fields: [['title', 'Title'], ['sub', 'Date or detail'], ['desc', 'Description (optional)', 'textarea']] }
  };
  var state;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadState() {
    try { var s = localStorage.getItem(KEY); if (s) { return Object.assign(clone(SAMPLE), JSON.parse(s)); } } catch (e) { /* ignore */ }
    return clone(SAMPLE);
  }
  var saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); $('rs-saved').textContent = 'Saved in this browser only'; }
      catch (e) { $('rs-saved').textContent = 'Could not save (storage blocked or full)'; }
    }, 400);
  }

  /* ------------------------------------------------------------- helpers */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = text; } return n; }
  function dates(s, e) { return s && e ? s + ' \u2013 ' + e : (s || e || ''); }
  function bullets(t) { return String(t || '').split(/\r?\n/).map(function (l) { return l.replace(/^\s*[-\u2022*]\s*/, '').trim(); }).filter(Boolean); }
  function items(t) { return String(t || '').split(/[,\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function filled(o) { return Object.keys(o).some(function (k) { return String(o[k] || '').trim() !== ''; }); }

  /* ------------------------------------------------------------- preview */
  var paper = $('rs-paper'), sizer = $('rs-sizer'), scroller = $('rs-scroll');
  sizer.style.overflow = 'hidden';
  var FS = { small: '9.5pt', normal: '10.5pt', large: '11.5pt' };

  function section(title) { var s = el('section'); s.appendChild(el('h2', 'rs-h', title)); paper.appendChild(s); return s; }
  function entry(parent, left, right, sub, bulletText, desc) {
    var e = el('div', 'rs-entry'), line = el('div', 'rs-line');
    line.appendChild(el('span', 'rs-role', left)); if (right) { line.appendChild(el('span', 'rs-date', right)); }
    e.appendChild(line); if (sub) { e.appendChild(el('div', 'rs-sub', sub)); }
    var b = bullets(bulletText); if (b.length) { var ul = el('ul'); b.forEach(function (t) { ul.appendChild(el('li', '', t)); }); e.appendChild(ul); }
    if (desc && desc.trim()) { e.appendChild(el('p', 'rs-text', desc.trim())); }
    if ((bulletText || '').length + (desc || '').length > 450) { e.className += ' rs-long'; }   /* long entries may continue on the next page */
    parent.appendChild(e);
  }
  function render() {
    paper.className = 'rs-paper rs-' + state.tpl;
    paper.style.setProperty('--accent', state.accent); paper.style.setProperty('--fs', FS[state.size] || FS.normal);
    paper.textContent = '';

    var head = el('div', 'rs-head'), info = el('div', 'rs-info');
    info.appendChild(el('h1', 'rs-name', state.name || 'Your Name'));
    if (state.title) { info.appendChild(el('div', 'rs-jobtitle', state.title)); }
    var contact = el('div', 'rs-contact');
    [state.email, state.phone, state.location, state.link1, state.link2].filter(Boolean).forEach(function (c) { contact.appendChild(el('span', '', c)); });
    if (contact.children.length) { info.appendChild(contact); }
    var photo = null;
    if (state.photo && state.showPhoto) { photo = el('img', 'rs-photo'); photo.alt = ''; photo.src = state.photo; }
    if (photo && state.tpl === 'classic') { head.appendChild(photo); }
    head.appendChild(info); if (photo && state.tpl !== 'classic') { head.appendChild(photo); }
    if (state.tpl === 'modern') { var band = el('div', 'rs-headband'); band.appendChild(head); paper.appendChild(band); } else { paper.appendChild(head); }

    if (state.summary && state.summary.trim()) { var s0 = section('Summary'); s0.appendChild(el('p', 'rs-text', state.summary.trim())); }
    var exp = state.exp.filter(filled);
    if (exp.length) { var s1 = section('Experience'); exp.forEach(function (x) { entry(s1, x.role || x.company, dates(x.start, x.end), [x.role ? x.company : '', x.place].filter(Boolean).join(' \u00b7 '), x.bullets); }); }
    var edu = state.edu.filter(filled);
    if (edu.length) { var s2 = section('Education'); edu.forEach(function (x) { entry(s2, x.degree || x.school, dates(x.start, x.end), [x.degree ? x.school : '', x.place].filter(Boolean).join(' \u00b7 '), '', x.details); }); }
    [['Skills', state.skills], ['Languages', state.langs]].forEach(function (g) {
      var list = items(g[1]); if (!list.length) { return; }
      var s = section(g[0]), chips = el('div', 'rs-chips'); list.forEach(function (t) { chips.appendChild(el('span', 'rs-chip', t)); }); s.appendChild(chips);
    });
    var extra = state.extra.filter(filled);
    if (extra.length) { var s3 = section(state.extraTitle || 'Additional'); extra.forEach(function (x) { entry(s3, x.title, x.sub, '', '', x.desc); }); }
    fitPreview();
  }
  function fitPreview() {
    var s = Math.min(1, Math.max(0.3, (scroller.clientWidth - 24) / PAGE_W));
    paper.style.transform = 'scale(' + s + ')';
    var h = paper.scrollHeight; sizer.style.width = Math.round(PAGE_W * s) + 'px'; sizer.style.height = Math.round(h * s) + 'px';
    var content = h - 24 * MM, pageH = 297 * MM - 24 * MM, n = Math.max(1, Math.ceil(content / pageH - 0.02));
    $('rs-pages').textContent = 'About ' + n + (n === 1 ? ' page' : ' pages') + (n > 2 ? ' (consider shortening)' : '');
  }
  window.addEventListener('resize', fitPreview);

  /* ------------------------------------------------------------ form bind */
  function changed() { render(); save(); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-bind]'), function (inp) {
    inp.addEventListener('input', function () { state[inp.getAttribute('data-bind')] = inp.value; changed(); });
  });
  function fillForm() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bind]'), function (inp) { inp.value = state[inp.getAttribute('data-bind')] || ''; });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="rs-tpl"]'), function (r) { r.checked = r.value === state.tpl; });
    $('rs-accent').value = state.accent.toLowerCase(); $('rs-size').value = state.size; $('rs-showphoto').checked = !!state.showPhoto;
    markSwatch(); Object.keys(LISTS).forEach(renderList);
  }
  function markSwatch() { Array.prototype.forEach.call($('rs-swatches').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-c').toLowerCase() === state.accent.toLowerCase()); }); }
  Array.prototype.forEach.call(document.querySelectorAll('input[name="rs-tpl"]'), function (r) { r.addEventListener('change', function () { if (r.checked) { state.tpl = r.value; changed(); } }); });
  $('rs-swatches').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (b) { state.accent = b.getAttribute('data-c'); $('rs-accent').value = state.accent.toLowerCase(); markSwatch(); changed(); } });
  $('rs-accent').addEventListener('input', function () { state.accent = $('rs-accent').value.toUpperCase(); markSwatch(); changed(); });
  $('rs-size').addEventListener('change', function () { state.size = $('rs-size').value; changed(); });
  $('rs-showphoto').addEventListener('change', function () { state.showPhoto = $('rs-showphoto').checked; changed(); });

  /* ---------------------------------------------------------- repeatables */
  function renderList(key) {
    var cfg = LISTS[key], host = $(cfg.el); host.textContent = '';
    state[key].forEach(function (item, i) {
      var card = el('div', 'rs-card'), head = el('div', 'rs-card-head');
      head.appendChild(el('span', '', cfg.label + ' ' + (i + 1)));
      var tools = el('div', 'd-flex gap-1');
      [['\u2191', 'Move up', -1], ['\u2193', 'Move down', 1]].forEach(function (m) {
        var b = el('button', 'pe-mini', m[0]); b.type = 'button'; b.setAttribute('aria-label', m[1]); b.disabled = (m[2] < 0 && i === 0) || (m[2] > 0 && i === state[key].length - 1);
        b.addEventListener('click', function () { var t = state[key][i]; state[key][i] = state[key][i + m[2]]; state[key][i + m[2]] = t; renderList(key); changed(); }); tools.appendChild(b);
      });
      var rm = el('button', 'pe-mini pe-danger', '\u00d7'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove'); rm.addEventListener('click', function () { state[key].splice(i, 1); renderList(key); changed(); });
      tools.appendChild(rm); head.appendChild(tools); card.appendChild(head);
      var grid = el('div', 'rs-grid');
      cfg.fields.forEach(function (f) {
        var wrap = el('div', f[2] === 'textarea' || f[0] === 'role' || f[0] === 'degree' || f[0] === 'title' ? 'full' : ''), id = 'rs-' + key + '-' + i + '-' + f[0];
        var lab = el('label', 'form-label small mb-1', f[1]); lab.setAttribute('for', id);
        var inp = f[2] === 'textarea' ? el('textarea', 'form-control') : el('input', 'form-control'); inp.id = id; if (f[2] === 'textarea') { inp.rows = 4; } else { inp.type = 'text'; }
        inp.maxLength = f[2] === 'textarea' ? 3000 : 80; inp.value = item[f[0]] || '';
        inp.addEventListener('input', function () { item[f[0]] = inp.value; changed(); });
        wrap.appendChild(lab); wrap.appendChild(inp); grid.appendChild(wrap);
      });
      card.appendChild(grid); host.appendChild(card);
      Array.prototype.forEach.call(card.querySelectorAll('textarea'), grow);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-add]'), function (b) {
    b.addEventListener('click', function () { var k = b.getAttribute('data-add'); state[k].push(clone(LISTS[k].blank)); renderList(k); changed(); var last = $(LISTS[k].el).lastElementChild; if (last) { var f = last.querySelector('input'); if (f) { f.focus(); } } });
  });

  /* ---------------------------------------------------------------- photo */
  $('rs-photo').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) { return; }
    U.loadImage(f).then(function (img) {
      var c = document.createElement('canvas'), S = 240; c.width = S; c.height = S;
      var s = Math.max(S / img.naturalWidth, S / img.naturalHeight), w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.getContext('2d').drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      state.photo = c.toDataURL('image/jpeg', 0.86); state.showPhoto = true; $('rs-showphoto').checked = true; changed();
    });
  });
  $('rs-photo-clear').addEventListener('click', function () { state.photo = ''; changed(); });

  /* -------------------------------------------------------- sample / clear */
  $('rs-sample').addEventListener('click', function () {
    var keep = { tpl: state.tpl, accent: state.accent, size: state.size };
    state = Object.assign(clone(SAMPLE), keep); fillForm(); render(); save();
  });
  $('rs-clear').addEventListener('click', function () {
    if (!window.confirm('Clear everything you typed? This also removes the copy saved in this browser.')) { return; }
    state = { tpl: state.tpl, accent: state.accent, size: state.size, showPhoto: true, photo: '', name: '', title: '', email: '', phone: '', location: '', link1: '', link2: '', summary: '',
              exp: [clone(LISTS.exp.blank)], edu: [clone(LISTS.edu.blank)], skills: '', langs: '', extraTitle: 'Certifications', extra: [] };
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    fillForm(); render();
  });

  /* ---------------------------------------------------------------- print */
  var prevTitle = '';
  function prepPrint() {
    cleanupPrint();
    var host = el('div'); host.id = 'rs-print-root';
    var c = paper.cloneNode(true); c.removeAttribute('id'); c.style.transform = ''; host.appendChild(c);
    document.body.appendChild(host); document.body.classList.add('rs-printing');
    prevTitle = document.title; document.title = (state.name ? state.name + ' - ' : '') + 'Resume';
  }
  function cleanupPrint() {
    var h = $('rs-print-root'); if (h) { h.parentNode.removeChild(h); }
    document.body.classList.remove('rs-printing'); if (prevTitle) { document.title = prevTitle; prevTitle = ''; }
  }
  window.addEventListener('beforeprint', prepPrint);
  window.addEventListener('afterprint', cleanupPrint);
  $('rs-download').addEventListener('click', function () {
    prepPrint();                                   /* explicit: some browsers never fire beforeprint */
    setTimeout(cleanupPrint, 120000);              /* safety net if afterprint is never fired */
    window.print();
  });

  /* ------------------------------------------------- text boxes grow with the text */
  function grow(t) {
    if (!t || t.tagName !== 'TEXTAREA') { return; }
    t.style.height = 'auto';
    if (t.scrollHeight) { t.style.height = (t.scrollHeight + 2) + 'px'; }
  }
  function growAll() { Array.prototype.forEach.call(document.querySelectorAll('textarea'), grow); }
  document.addEventListener('input', function (e) { grow(e.target); });
  Array.prototype.forEach.call(document.querySelectorAll('details'), function (d) { d.addEventListener('toggle', growAll); });
  var growT; window.addEventListener('resize', function () { clearTimeout(growT); growT = setTimeout(growAll, 150); });
  window.addEventListener('load', growAll);

  /* ----------------------------------------------------------------- init */
  state = loadState(); fillForm(); render(); growAll();
  if (window.ResizeObserver) { new ResizeObserver(fitPreview).observe(scroller); }
  window.FHResume = { prepPrint: prepPrint, cleanupPrint: cleanupPrint, state: function () { return state; } };
})();
