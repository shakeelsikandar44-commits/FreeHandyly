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
    first: 'Ana', last: 'Smith', jd: '', title: 'Digital Marketing Manager', email: 'hello@example.com', phone: '+1 000 000 0000',
    location: 'Chicago, IL', link1: 'linkedin.com/in/anasmith', link2: '',
    summary: 'Results-driven marketing manager with 6+ years of experience growing brands through SEO, paid media and content strategy. Skilled at turning data into clear campaigns that increase traffic, leads and revenue.',
    exp: [
      { role: 'Digital Marketing Manager', company: 'BrightPath Agency', place: 'Chicago, IL', start: '2021-03', end: '', current: true,
        bullets: 'Led a team of 5 to manage campaigns for 20+ clients\nIncreased organic traffic by 120% in 12 months through SEO and content\nReduced cost per lead by 28% by optimising paid campaigns' },
      { role: 'Marketing Executive', company: 'Nova Retail', place: 'Austin, TX', start: '2018-06', end: '2021-02', current: false,
        bullets: 'Planned and ran social media campaigns reaching 500K+ people\nCreated weekly email newsletters with a 32% average open rate' }
    ],
    edu: [{ degree: 'BBA in Marketing', school: 'State University', place: 'Chicago, IL', start: '2014-09', end: '2018-06', details: 'First class honours. President of the marketing society.' }],
    skills: 'SEO, Google Analytics, Google Ads, Content Strategy, Social Media, Email Marketing, Team Leadership',
    langs: 'English (native), Spanish (conversational)',
    extraTitle: 'Certifications', extra: [{ title: 'Google Analytics Certification', sub: '2023', desc: '' }, { title: 'HubSpot Content Marketing', sub: '2022', desc: '' }]
  };
  var LISTS = {
    exp: { el: 'rs-exp', label: 'Position', blank: { role: '', company: '', place: '', start: '', end: '', current: false, bullets: '' },
           fields: [['role', 'Job title'], ['company', 'Company / employer'], ['place', 'Location'], ['start', 'Start (month / year)', 'month'], ['end', 'End (month / year)', 'month'], ['current', 'I currently work here', 'check'], ['bullets', 'Duties / achievements, one per line (leave empty to fill from the job description)', 'textarea']] },
    edu: { el: 'rs-edu', label: 'Education', blank: { degree: '', school: '', place: '', start: '', end: '', details: '' },
           fields: [['degree', 'Degree or course'], ['school', 'School or university'], ['place', 'Location'], ['start', 'Start (month / year)', 'month'], ['end', 'End (month / year)', 'month'], ['details', 'Details (optional)', 'textarea']] },
    extra: { el: 'rs-extra', label: 'Item', blank: { title: '', sub: '', desc: '' },
             fields: [['title', 'Title'], ['sub', 'Date or detail'], ['desc', 'Description (optional)', 'textarea']] }
  };
  var state;

  function fullName() { return [state.first, state.last].filter(Boolean).join(' ').trim() || state.name || ''; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadState() {
    try { var s = localStorage.getItem(KEY); if (s) { var o = JSON.parse(s); if (o.name && !o.first && !o.last) { var pr = String(o.name).trim().split(/\s+/); o.first = pr.shift() || ''; o.last = pr.join(' '); } return Object.assign(clone(SAMPLE), o); } } catch (e) { /* ignore */ }
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
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmt(v) { var m = /^(\d{4})-(\d{2})$/.exec(v || ''); return m ? MON[+m[2] - 1] + ' ' + m[1] : (v || ''); }
  function dates(s, e) { s = fmt(s); e = fmt(e); return s && e ? s + ' \u2013 ' + e : (s || e || ''); }
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
    info.appendChild(el('h1', 'rs-name', fullName() || 'Your Name'));
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
    if (exp.length) { var s1 = section('Experience'); exp.forEach(function (x) { entry(s1, x.role || x.company, dates(x.start, x.current ? 'Present' : x.end), [x.role ? x.company : '', x.place].filter(Boolean).join(' \u00b7 '), x.bullets); }); }
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
        if (f[2] === 'check') {
          var cw = el('div', 'full rs-cur'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'rs-' + key + '-' + i + '-' + f[0]; cb.checked = !!item[f[0]];
          var cl = el('label', '', f[1]); cl.setAttribute('for', cb.id);
          cb.addEventListener('change', function () { item[f[0]] = cb.checked; changed(); });
          cw.appendChild(cb); cw.appendChild(cl); grid.appendChild(cw); return;
        }
        var wrap = el('div', f[2] === 'textarea' || f[0] === 'role' || f[0] === 'degree' || f[0] === 'title' ? 'full' : ''), id = 'rs-' + key + '-' + i + '-' + f[0];
        var lab = el('label', 'form-label small mb-1', f[1]); lab.setAttribute('for', id);
        var inp = f[2] === 'textarea' ? el('textarea', 'form-control') : el('input', 'form-control'); inp.id = id; if (f[2] === 'textarea') { inp.rows = 4; } else { inp.type = f[2] === 'month' ? 'month' : 'text'; }
        if (f[2] !== 'month') { inp.maxLength = f[2] === 'textarea' ? 3000 : 80; } inp.value = item[f[0]] || '';
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
    state = { tpl: state.tpl, accent: state.accent, size: state.size, showPhoto: true, photo: '', first: '', last: '', jd: '', title: '', email: '', phone: '', location: '', link1: '', link2: '', summary: '',
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
    prevTitle = document.title; document.title = (fullName() ? fullName() + ' - ' : '') + 'Resume';
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


  /* ------------------------------------------------------------ ATS tailor */
  var STOP = new Set('a about above after all also an and any are as at be been being but by can could do does for from had has have he her his how i if in into is it its may more most must of on or our out over per should so such than that the their them then there these they this those to under up us use using was we were what when where which while who will with within would you your able etc including include ability work working role team experience years year strong skills skill required requirements preferred responsibilities job position candidate company looking plus new well hiring join apply benefits salary equal opportunity employer'.split(' '));
  var KW = [];
  function cap(s) { return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function keywords(jd) {
    var w = (jd.toLowerCase().match(/[a-z][a-z0-9+#.\-\/]*[a-z0-9+#]|[a-z]/g) || []).map(function (x) { return x.replace(/[.\-\/]+$/, ''); }), f = {};
    w.forEach(function (x, i) {
      if (x.length < 2 || STOP.has(x)) { return; }
      f[x] = (f[x] || 0) + 1;
      var n = w[i + 1]; if (n && n.length > 1 && !STOP.has(n)) { f[x + ' ' + n] = (f[x + ' ' + n] || 0) + 1.2; }
    });
    var arr = Object.keys(f).filter(function (k) { return k.indexOf(' ') > -1 ? f[k] >= 2.4 : f[k] >= 1; }).sort(function (a, b) { return f[b] - f[a]; }), out = [];
    for (var i = 0; i < arr.length && out.length < 20; i++) {
      var k = arr[i]; if (out.some(function (o) { return o.indexOf(k) > -1 || k.indexOf(o) > -1; })) { continue; } out.push(k);
    }
    return out;
  }
  function jdLines(jd) {
    return jd.split(/\n+|(?<=[.;])\s+/).map(function (s) { return s.replace(/^[\s\-\u2022*\u00b7\d.)]+/, '').trim(); })
      .filter(function (s) { return s.length > 35 && s.length < 170 && !/^(we|you|our|the|this|a|an|strong|must|required)\b/i.test(s); });
  }
  function resumeText() { return ' ' + paper.textContent.toLowerCase() + ' '; }
  function updateScore() {
    var box = $('rs-score'), miss = $('rs-miss'); if (!KW.length) { box.hidden = true; miss.textContent = ''; return; }
    var t = resumeText(), hit = KW.filter(function (k) { return t.indexOf(k) > -1; }), pct = Math.round(hit.length / KW.length * 100);
    box.hidden = false; box.innerHTML = 'ATS keyword match: <b class="' + (pct >= 90 ? 'ok' : 'low') + '">' + pct + '%</b> (' + hit.length + '/' + KW.length + ' keywords)';
    miss.textContent = ''; KW.filter(function (k) { return t.indexOf(k) < 0; }).forEach(function (k) { miss.appendChild(el('span', '', k)); });
  }
  var _render = render; render = function () { _render(); updateScore(); };
  $('rs-tailor').addEventListener('click', function () {
    var jd = (state.jd || '').trim();
    if (jd.length < 50) { window.alert('Please paste the full job description first.'); $('rs-jd').focus(); return; }
    KW = keywords(jd);
    var own = items(state.skills), have = own.map(function (s) { return s.toLowerCase(); });
    KW.forEach(function (k) { if (have.indexOf(k) < 0) { own.push(cap(k)); have.push(k); } });
    state.skills = own.join(', ');
    var m = /(?:hiring|seeking|looking for)\s+(?:an?\s+)?([A-Z][A-Za-z\/&\- ]{3,50}?)(?:\s+to\b|\s+for\b|\.|,|\n)/.exec(jd);
    if (!state.title && m) { state.title = m[1].trim(); }
    var pool = jdLines(jd), pi = 0;
    state.exp.filter(filled).forEach(function (x) {
      var b = bullets(x.bullets); while (b.length < 3 && pool.length) { b.push(pool[pi % pool.length].replace(/\.$/, '')); pi++; if (pi >= pool.length * 2) { break; } }
      x.bullets = b.filter(function (v, i) { return b.indexOf(v) === i; }).join('\n');
    });
    if (!String(state.summary || '').trim()) {
      state.summary = 'Results-driven ' + (state.title || 'professional') + ' with hands-on experience in ' + own.slice(0, 5).join(', ') + '. Known for accurate, timely work and for supporting team goals in fast-paced environments.';
    }
    fillForm(); render(); save();
    $('rs-score').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  /* ----------------------------------------------------------------- init */
  state = loadState(); fillForm(); render(); growAll();
  if (window.ResizeObserver) { new ResizeObserver(fitPreview).observe(scroller); }
  window.FHResume = { prepPrint: prepPrint, cleanupPrint: cleanupPrint, state: function () { return state; } };
})();
