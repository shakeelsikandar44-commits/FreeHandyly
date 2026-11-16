/* FreeHandyly Resume Maker: builds job titles, bullets, skills and summary from a job description. Runs in the browser, no data leaves the device. */
(function (w) {
  'use strict';
  var STOP = new Set('a about above after all also an and any are as at be been being but by can could do does for from had has have he her his how i if in into is it its may more most must of on or our out over per should so such than that the their them then there these they this those to under up us use using was we were what when where which while who will with within would you your able etc including include ability work working role team experience years year strong skills skill required requirements preferred responsibilities job position candidate company looking plus new well hiring join apply benefits salary equal opportunity employer knowledge correctly timely accurate accuracy days questions daily high quality good great excellent duties assigned special projects primary related meet sound departmental goals decision making effectively accountable daily current established ongoing completed correct negative specific measurable between less lag through across around upon whether'.split(' '));
  var VERBS = new Set('submit follow review assign post reconcile work verify obtain communicate process prepare manage maintain coordinate monitor ensure analyze analyse develop create support handle resolve track update document schedule audit train lead collaborate perform provide conduct implement generate respond research organize identify assist answer enter file bill code collect negotiate design build write test deploy optimize plan evaluate report record contact investigate escalate reduce improve drive deliver execute oversee mentor apply use keep help flag check prioritize suggest share correct establish promote validate delegate supervise hold demonstrate'.split(' '));
  var AMB = /^(process|support|design|report|record|plan|test|file|bill|code|audit|document|schedule|update|track|research|answer|contact|drive|train|use|work|apply|post|lead|run)$/;
  var IRR = { lead: 'led', run: 'ran', build: 'built', write: 'wrote', make: 'made', hold: 'held', meet: 'met', keep: 'kept', give: 'gave', take: 'took', send: 'sent', get: 'got', do: 'did' };
  var DBL = /^(submit|plan|stop|refer|commit|admit|control|occur|prefer|transfer|drop|map|log|plot|scan|ship)$/;
  var TPL = ['Apply working knowledge of {a} and {b} to keep day-to-day work accurate and on schedule',
    'Use {a} regularly and keep records for {b} up to date and easy to audit',
    'Work closely with colleagues and clients on {a}, answering questions and resolving issues promptly',
    'Follow established procedures for {a} and flag problems early to avoid rework',
    'Build solid day-to-day skills in {a} and {b}, and help newer team members learn them',
    'Prepare clear updates on {a} for supervisors and other stakeholders',
    'Check {a} work for errors before sign-off and correct issues at the source',
    'Document {a} procedures clearly for colleagues and new starters',
    'Handle {a} questions from internal teams and outside contacts with clear, courteous communication',
    'Track {a} items through to completion and keep the team informed on progress',
    'Prioritize {a} tasks during busy periods to meet deadlines without lowering quality',
    'Coordinate with other departments to resolve {a} issues quickly',
    'Maintain accurate records of {a} activity in line with company policy',
    'Support colleagues on {a} work and share tips that make routine tasks faster',
    'Identify recurring problems in {a} and suggest simple fixes to improve turnaround'];
  var ORIG = {}, BI = [], ACR = [];
  var DOM = ['billing', 'coding', 'credentialing', 'accounting', 'payroll', 'recruiting', 'marketing', 'sales', 'scheduling', 'compliance', 'finance', 'claims', 'collections', 'bookkeeping', 'nursing', 'engineering', 'support'];

  function cap(s) { return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function past(v) {
    v = v.toLowerCase(); if (IRR[v]) { return IRR[v]; }
    if (/e$/.test(v)) { return v + 'd'; } if (/[^aeiou]y$/.test(v)) { return v.slice(0, -1) + 'ied'; }
    return DBL.test(v) ? v + v.slice(-1) + 'ed' : v + 'ed';
  }
  function keywords(jd) {
    var P = [], re = /[A-Za-z][A-Za-z0-9+#.\-\/]*[A-Za-z0-9+#]|[A-Za-z]/g, t = [], m, f = {}; ORIG = {};
    while ((m = re.exec(jd))) {
      var raw = m[0].replace(/[.\-\/]+$/, ''), lo = raw.toLowerCase(), pre = jd.slice(0, m.index).replace(/[ \t]+$/, '');
      t.push(lo); P.push([m.index, m.index + m[0].length]);
      if (/^[A-Z0-9+#\-]{2,}$/.test(raw)) { ORIG[lo] = raw; } else if (/^[A-Z]/.test(raw) && pre && !/[.!?:\n]$/.test(pre)) { ORIG[lo] = ORIG[lo] || raw; }
    }
    t.forEach(function (x, i) {
      if (x.length < 2 || STOP.has(x)) { return; }
      if (!vb(x)) { f[x] = (f[x] || 0) + 1; } var n = t[i + 1]; if (n && n.length > 1 && !STOP.has(n) && !vb(x) && !vb(n) && !/ing$/.test(n) && /^[ \t]+$/.test(jd.slice(P[i][1], P[i + 1][0]))) { f[x + ' ' + n] = (f[x + ' ' + n] || 0) + 1.2; }
    });
    BI = Object.keys(f).filter(function (k) { return k.indexOf(' ') > -1 && f[k] >= 2.4; }).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 6);
    ACR = Object.keys(ORIG).filter(function (k) { return ORIG[k] === ORIG[k].toUpperCase() && ORIG[k].length >= 3 && !STOP.has(k) && f[k]; }).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 6);
    var arr = Object.keys(f).filter(function (k) { return f[k] >= 1; }).sort(function (a, b) { return f[b] - f[a]; }), out = [];
    for (var i = 0; i < arr.length && out.length < 20; i++) { var k = arr[i]; if (!out.some(function (o) { return o.indexOf(k) > -1 || k.indexOf(o) > -1; })) { out.push(k); } }
    return out;
  }
  function text(k) { return k.split(' ').map(function (x) { return ORIG[x] || x; }).join(' '); }
  function label(k) { return k.split(' ').map(function (x) { return ORIG[x] || cap(x); }).join(' '); }
  var LEADT = /\s(supervisor|manager|director|head)$|^(senior|sr\.?|lead|principal|head of)\s/i, LEADJD = /\b(leads?|supervis\w+|oversees?|team of|direct reports|holds? accountable)\b/i;
  function target(jd, kw) {
    var m = /(?:job title|position|role)\s*[:\-]\s*([^\n]{4,60})/i.exec(jd) || /(?:hiring|seeking|looking for|recruiting)\s+(?:an?\s+)?([A-Za-z][A-Za-z\/&\- ]{3,50}?)(?=\s+(?:to|for|who|with|in)\b|[.,\n])/i.exec(jd), t = m ? m[1].trim() : '';
    if (!t) { var l = jd.split('\n')[0].trim(); if (l.split(/\s+/).length <= 6 && !/[.!?:]$/.test(l) && !/responsib|dut(y|ies)|requirement|qualif|about|summary|overview|description/i.test(l)) { t = l; } }
    if (!t) {
      var dom = kw.filter(function (k) { return DOM.indexOf(k) > -1; })[0] || kw.filter(function (k) { return k.indexOf(' ') < 0 && k.length > 3 && !ORIG[k]; })[0] || 'professional';
      t = dom + (LEADJD.test(jd) ? ' supervisor' : ' specialist');
    }
    return cap(t.toLowerCase());
  }
  function ladder(t, n) {
    var lead = LEADT.test(t), base = t.replace(/^(senior|sr\.?|lead|principal|head of|junior|jr\.?|assistant|associate)\s+/i, '').replace(/\s+(supervisor|manager|director|head)$/i, '');
    if (lead && !/(specialist|analyst|coordinator|associate|representative|clerk)$/i.test(base)) { base += ' Specialist'; }
    var L = lead ? [t, 'Senior ' + base, base, 'Associate ' + base] : [t, 'Associate ' + base, 'Junior ' + base, 'Assistant ' + base];
    return L[Math.min(n, L.length - 1)];
  }
  function ing(v) { v = v.toLowerCase(); if (/[^e]e$/.test(v)) { return v.slice(0, -1) + 'ing'; } return DBL.test(v) ? v + v.slice(-1) + 'ing' : v + 'ing'; }
  function vb(w) {
    w = w.replace(/[,;]$/, '').toLowerCase(); if (VERBS.has(w)) { return w; }
    if (!/s$/.test(w)) { return null; } var c = [w.slice(0, -1), w.slice(0, -2), w.replace(/ies$/, 'y')];
    for (var k = 0; k < 3; k++) { if (VERBS.has(c[k])) { return c[k]; } } return null;
  }
  function rewrite(line, mode) {
    var conv = function (v) { return mode === 'ing' ? ing(v) : (mode ? past(v) : v.toLowerCase()); };
    var s = line.replace(/^(you will|the (successful )?candidate will|will|responsible for|ability to|able to|must be able to|duties include|responsibilities include)[:\s]+/i, '').replace(/[.;]+$/, '');
    var wd = s.split(/\s+/), out = [], i = 0, ok = false;
    while (i < wd.length) {
      var bv = vb(wd[i]); if (!bv) { break; }
      var comma = /[,;]$/.test(wd[i]); out.push(conv(bv) + (comma ? ',' : '')); ok = true; i++;
      if (wd[i] && /^(and|or)$/i.test(wd[i]) && wd[i + 1] && vb(wd[i + 1])) { out.push(wd[i]); i++; continue; }
      if (comma && wd[i] && vb(wd[i])) { continue; }
      break;
    }
    if (!ok) { return null; } out[out.length - 1] = out[out.length - 1].replace(/,$/, '');
    var r = out.concat(wd.slice(i)).join(' ').replace(/\b(and|or) ([a-z]+)\b/g, function (m, a, v) { var u = vb(v); return u && !AMB.test(u) ? a + ' ' + conv(u) : m; });
    return mode === 'ing' ? r : r.charAt(0).toUpperCase() + r.slice(1);
  }
  function qual(s) { var m = /^(?:strong |solid |good |proven |working )?(?:knowledge|experience|proficiency|understanding|familiarity) (?:of|with|in)\s+(.+?)(?:\s+(?:is )?(?:required|preferred))?[.;]*$/i.exec(s); return m ? m[1] : null; }
  function raw(jd) { return jd.split(/\n+|(?<=[.;])\s+/).map(function (s) { return s.replace(/^[\s\-\u2022*\u00b7\d.)]+/, '').trim(); }); }
  function lines(jd) {
    var seen = {};
    return raw(jd).map(function (s) { var q = qual(s), m = /^[^:]{3,45}:\s+(.+)$/.exec(s); if (m && rewrite(m[1], false)) { s = m[1]; } return q ? 'Apply working knowledge of ' + q + ' in daily work' : s.split(';')[0]; })
      .filter(function (s) { if (s.length < 30 || s.length > 200 || seen[s] || !rewrite(s, false)) { return false; } seen[s] = 1; return true; });
  }
  function skillItems(jd) {
    var o = []; raw(jd).forEach(function (s) { var q = qual(s); if (q) { q.split(/,|;|\band\b/i).map(function (x) { return x.trim(); }).forEach(function (x) { if (x && x.split(' ').length <= 4) { o.push(x.split(' ').map(function (w) { return w === w.toLowerCase() ? cap(w) : w; }).join(' ')); } }); } });
    return o;
  }
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function slotText(s) { return s.split(' ').map(function (x) { return ORIG[x.toLowerCase()] || x.toLowerCase(); }).join(' '); }
  function years(ex) {
    var d = ex.map(function (x) { return x.start; }).filter(function (s) { return /^\d{4}-\d{2}$/.test(s || ''); }).sort()[0]; if (!d) { return 0; }
    return Math.floor(((new Date()) - new Date(d + '-01')) / 31557600000);
  }
  function apply(st) {
    var jd = st.jd || '', KW = keywords(jd), tt = target(jd, KW), pool = lines(jd);
    var leaderT = LEADT.test(tt), poolNL = pool.filter(function (l) { return !/^(lead|oversee|manage|supervise|delegate|establish|promote|hold)$/.test(rewrite(l, false).split(' ')[0].toLowerCase().replace(/,$/, '')); });
    var NICE = KW.filter(function (k) { return k.indexOf(' ') > -1 || (ORIG[k] && ORIG[k] === ORIG[k].toUpperCase()); }), sk = [];
    var cand = skillItems(jd).concat(BI.map(label), ACR.map(label), NICE.map(label)); if (cand.length < 4) { cand = cand.concat(KW.map(label)); }
    cand.forEach(function (s) { var lo = s.toLowerCase(); if (sk.length < 12 && !sk.some(function (z) { var zl = z.toLowerCase(); return zl.indexOf(lo) > -1 || lo.indexOf(zl) > -1; })) { sk.push(s); } });
    var own = String(st.skills || '').split(/[,\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!own.length || st.skillsAuto === true) { st.skills = sk.join(', '); st.skillsAuto = true; }
    else { var have = own.map(function (s) { return s.toLowerCase(); }); sk.forEach(function (s) { if (have.indexOf(s.toLowerCase()) < 0) { own.push(s); } }); st.skills = own.join(', '); }
    var slot = function (n) { return sk.length ? slotText(sk[n % sk.length]) : 'daily tasks'; };
    var ex = st.exp.filter(function (x) { return x.company || x.start; }), N = [10, 9, 8];
    ex.forEach(function (x, i) {
      var pt = !(i === 0 && (x.current || !x.end)) && !x.current;
      if (!x.role || x.autoT === true) { x.role = ladder(tt, i); x.autoT = true; }
      if (!String(x.bullets || '').trim() || x.autoB === true) {
        var P, n = N[Math.min(i, 2)], P = (i > 0 && leaderT) ? poolNL : pool, nj = Math.min(P.length, n - 5), b = [], cnt = {}, j = (i * 3) % Math.max(P.length, 1), c, r, v;
        for (c = 0; c < nj; c++) { r = rewrite(P[(j + c) % P.length], pt); cnt[r.split(' ')[0]] = 1; b.push(r); }
        for (var t = 0; b.length < n && t < 60; t++) {
          r = rewrite(TPL[(i * 4 + t) % TPL.length].replace('{a}', slot(i * 3 + t * 2)).replace('{b}', slot(i * 3 + t * 2 + 1)), pt); v = r.split(' ')[0];
          if ((cnt[v] || 0) < 2 && b.indexOf(r) < 0) { cnt[v] = (cnt[v] || 0) + 1; b.push(r); }
        }
        x.bullets = b.join('\n'); x.autoB = true;
      }
    });
    if (!st.title || st.titleAuto) { st.title = tt; st.titleAuto = true; }
    if (!String(st.summary || '').trim() || st.summaryAuto) {
      var y = years(ex), g = pool.slice(0, 2).map(function (l, k) { var r = rewrite(l, 'ing').split(/\s(?:to|for|so)\s/)[0]; return k ? r.split(/\sand\s/)[0] : r; }), rest = sk.slice(3, 6).map(slotText);
      st.summary = tt + (y >= 1 ? ' with ' + y + '+ years of experience' : ' with hands-on experience') + (sk.length ? ' in ' + list(sk.slice(0, 3).map(slotText)) : '') + '.' +
        (g.length ? ' Hands-on background in ' + g.join(' and ') + '.' : '') + (rest.length ? ' Comfortable with ' + list(rest) + ', and committed to accurate, on-time work.' : ' Committed to accurate, on-time work.');
      st.summaryAuto = true;
    }
    return KW;
  }
  w.FHTailor = { apply: apply, keywords: keywords };
})(window);
