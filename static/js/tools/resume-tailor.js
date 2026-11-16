/* FreeHandyly Resume Maker: builds job titles, bullets, skills and summary from a job description. Runs in the browser, no data leaves the device. */
(function (w) {
  'use strict';
  var STOP = new Set('a about above after all also an and any are as at be been being but by can could do does for from had has have he her his how i if in into is it its may more most must of on or our out over per should so such than that the their them then there these they this those to under up us use using was we were what when where which while who will with within would you your able etc including include ability work working role team experience years year strong skills skill required requirements preferred responsibilities job position candidate company looking plus new well hiring join apply benefits salary equal opportunity employer knowledge'.split(' '));
  var VERBS = new Set('submit follow review assign post reconcile work verify obtain communicate process prepare manage maintain coordinate monitor ensure analyze analyse develop create support handle resolve track update document schedule audit train lead collaborate perform provide conduct implement generate respond research organize identify assist answer enter file bill code collect negotiate design build write test deploy optimize plan evaluate report record contact investigate escalate reduce improve drive deliver execute oversee mentor apply use keep help flag'.split(' '));
  var AMB = /^(process|support|design|report|record|plan|test|file|bill|code|audit|document|schedule|update|track|research|answer|contact|drive|train|use|work|apply|post|lead|run)$/;
  var IRR = { lead: 'led', run: 'ran', build: 'built', write: 'wrote', make: 'made', hold: 'held', meet: 'met', keep: 'kept', give: 'gave', take: 'took', send: 'sent', get: 'got', do: 'did' };
  var DBL = /^(submit|plan|stop|refer|commit|admit|control|occur|prefer|transfer|drop|map|log|plot|scan|ship)$/;
  var TPL = ['Apply working knowledge of {a} and {b} to keep day-to-day work accurate and on schedule',
    'Use {a} regularly and keep records for {b} up to date and easy to audit',
    'Work closely with colleagues and clients on {a}, answering questions and resolving issues promptly',
    'Follow established procedures for {a} and flag problems early to avoid rework',
    'Build solid day-to-day skills in {a} and {b}, and help newer team members learn them',
    'Prepare clear updates on {a} for supervisors and other stakeholders'];
  var ORIG = {};

  function cap(s) { return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function past(v) {
    v = v.toLowerCase(); if (IRR[v]) { return IRR[v]; }
    if (/e$/.test(v)) { return v + 'd'; } if (/[^aeiou]y$/.test(v)) { return v.slice(0, -1) + 'ied'; }
    return DBL.test(v) ? v + v.slice(-1) + 'ed' : v + 'ed';
  }
  function keywords(jd) {
    var re = /[A-Za-z][A-Za-z0-9+#.\-\/]*[A-Za-z0-9+#]|[A-Za-z]/g, t = [], m, f = {}; ORIG = {};
    while ((m = re.exec(jd))) {
      var raw = m[0].replace(/[.\-\/]+$/, ''), lo = raw.toLowerCase(), pre = jd.slice(0, m.index).replace(/[ \t]+$/, '');
      t.push(lo);
      if (/^[A-Z0-9+#\-]{2,}$/.test(raw)) { ORIG[lo] = raw; } else if (/^[A-Z]/.test(raw) && pre && !/[.!?:\n]$/.test(pre)) { ORIG[lo] = ORIG[lo] || raw; }
    }
    t.forEach(function (x, i) {
      if (x.length < 2 || STOP.has(x)) { return; }
      if (!VERBS.has(x)) { f[x] = (f[x] || 0) + 1; } var n = t[i + 1]; if (n && n.length > 1 && !STOP.has(n) && !VERBS.has(x) && !VERBS.has(n)) { f[x + ' ' + n] = (f[x + ' ' + n] || 0) + 1.2; }
    });
    var arr = Object.keys(f).filter(function (k) { return f[k] >= 1; }).sort(function (a, b) { return f[b] - f[a]; }), out = [];
    for (var i = 0; i < arr.length && out.length < 20; i++) { var k = arr[i]; if (!out.some(function (o) { return o.indexOf(k) > -1 || k.indexOf(o) > -1; })) { out.push(k); } }
    return out;
  }
  function text(k) { return k.split(' ').map(function (x) { return ORIG[x] || x; }).join(' '); }
  function label(k) { return k.split(' ').map(function (x) { return ORIG[x] || cap(x); }).join(' '); }
  function target(jd, kw) {
    var m = /(?:job title|position|role)\s*[:\-]\s*([^\n]{4,60})/i.exec(jd) || /(?:hiring|seeking|looking for|recruiting)\s+(?:an?\s+)?([A-Za-z][A-Za-z\/&\- ]{3,50}?)(?=\s+(?:to|for|who|with|in)\b|[.,\n])/i.exec(jd), t = m ? m[1].trim() : '';
    if (!t) { var l = jd.split('\n')[0].trim(); if (l.split(/\s+/).length <= 6 && !/[.!?]$/.test(l)) { t = l; } }
    return cap((t || (kw[0] ? kw[0] + ' specialist' : 'Professional')).toLowerCase());
  }
  function ladder(t, n) {
    var senior = /^(senior|sr\.?|lead|principal|head of)\s+/i.test(t), base = t.replace(/^(senior|sr\.?|lead|principal|head of|junior|jr\.?|assistant|associate)\s+/i, '');
    var L = senior ? [t, base, 'Associate ' + base, 'Junior ' + base] : [t, 'Associate ' + base, 'Junior ' + base, 'Assistant ' + base];
    return L[Math.min(n, L.length - 1)];
  }
  function rewrite(line, pt) {
    var s = line.replace(/^(you will|the (successful )?candidate will|will|responsible for|ability to|able to|must be able to|duties include|responsibilities include)[:\s]+/i, '').replace(/[.;]+$/, '');
    var wd = s.split(/\s+/), out = [], i = 0, ok = false;
    while (i < wd.length) {
      var b = wd[i].replace(/[,;]$/, '');
      if (!VERBS.has(b.toLowerCase())) { break; }
      out.push(pt ? past(b) : b.toLowerCase()); ok = true; i++;
      if (wd[i] && /^(and|or)$/i.test(wd[i]) && wd[i + 1] && VERBS.has(wd[i + 1].replace(/[,;]$/, '').toLowerCase())) { out.push(wd[i]); i++; continue; }
      break;
    }
    if (!ok) { return null; }
    var r = out.concat(wd.slice(i)).join(' ').replace(/\b(and|or) ([a-z]+)\b/g, function (m, a, v) { return VERBS.has(v) && !AMB.test(v) ? a + ' ' + (pt ? past(v) : v) : m; }); return r.charAt(0).toUpperCase() + r.slice(1);
  }
  function lines(jd) {
    var seen = {};
    return jd.split(/\n+|(?<=[.;])\s+/).map(function (s) { return s.replace(/^[\s\-\u2022*\u00b7\d.)]+/, '').trim(); })
      .filter(function (s) { if (s.length < 30 || s.length > 170 || seen[s] || !rewrite(s, false)) { return false; } seen[s] = 1; return true; });
  }
  function years(ex) {
    var d = ex.map(function (x) { return x.start; }).filter(function (s) { return /^\d{4}-\d{2}$/.test(s || ''); }).sort()[0]; if (!d) { return 0; }
    return Math.floor(((new Date()) - new Date(d + '-01')) / 31557600000);
  }
  function apply(st) {
    var jd = st.jd || '', KW = keywords(jd), tt = target(jd, KW), pool = lines(jd), NICE = KW.filter(function (k) { return k.indexOf(' ') > -1 || (ORIG[k] && ORIG[k] === ORIG[k].toUpperCase()); }), ex = st.exp.filter(function (x) { return x.company || x.start; });
    var own = String(st.skills || '').split(/[,\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean), have = own.map(function (s) { return s.toLowerCase(); });
    KW.forEach(function (k) { if (have.indexOf(label(k).toLowerCase()) < 0 && have.indexOf(k) < 0) { own.push(label(k)); } }); st.skills = own.join(', ');
    ex.forEach(function (x, i) {
      var pt = !(i === 0 && (x.current || !x.end)) && !x.current;
      if (!x.role || x.autoT === true) { x.role = ladder(tt, i); x.autoT = true; }
      if (!String(x.bullets || '').trim() || x.autoB === true) {
        var n = i === 0 ? 5 : (i === 1 ? 4 : 3), b = [], used = {}, j = (i * 3) % Math.max(pool.length, 1), tries = 0;
        while (b.length < n - 1 && pool.length && tries++ < pool.length) { var r = rewrite(pool[j % pool.length], pt), v = r.split(' ')[0]; j++; if (!used[v]) { used[v] = 1; b.push(r); } }
        for (var t = 0; b.length < n && KW.length; t++) {
          var tp = TPL[(i + t * 2) % TPL.length].replace('{a}', text(NICE.concat(KW)[(i * 2 + t * 3) % NICE.concat(KW).length])).replace('{b}', text(NICE.concat(KW)[(i * 2 + t * 3 + 1) % NICE.concat(KW).length])), q = rewrite(tp, pt);
          if (!used[q.split(' ')[0]] || t > 4) { used[q.split(' ')[0]] = 1; b.push(q); }
        }
        x.bullets = b.join('\n'); x.autoB = true;
      }
    });
    if (!st.title || st.titleAuto) { st.title = tt; st.titleAuto = true; }
    if (!String(st.summary || '').trim() || st.summaryAuto) {
      var y = years(ex), k = NICE.concat(KW.filter(function (z) { return NICE.indexOf(z) < 0; })).map(text);
      st.summary = tt + (y >= 1 ? ' with ' + y + '+ years of experience' : ' with hands-on experience') + ' in ' + (k.slice(0, 2).join(', ') + ' and ' + k[2]) + '. Comfortable working with ' + k.slice(3, 5).join(' and ') + ', and focused on accurate, on-time work that supports the whole team.';
      st.summaryAuto = true;
    }
    return KW;
  }
  w.FHTailor = { apply: apply, keywords: keywords };
})(window);
