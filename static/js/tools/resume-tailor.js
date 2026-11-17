/* FreeHandyly Resume Maker: builds job titles, bullets, skills and summary from a job description. Runs in the browser, no data leaves the device. */
(function (w) {
  'use strict';
  var STOP = new Set('a about above after all also an and any are as at be been being but by can could do does for from had has have he her his how i if in into is it its may more most must of on or our out over per should so such than that the their them then there these they this those to under up us use using was we were what when where which while who will with within would you your able etc including include ability work working role team experience years year strong skills skill required requirements preferred responsibilities job position candidate company looking plus new well hiring join apply benefits salary equal opportunity employer knowledge correctly timely accurate accuracy days questions daily high quality good great excellent duties assigned special projects primary related meet sound departmental goals decision making effectively accountable daily current established ongoing completed correct negative specific measurable between less lag through across around upon whether'.split(' '));
  var VERBS = new Set('submit follow review assign post reconcile work verify obtain communicate process prepare manage maintain coordinate monitor ensure analyze analyse develop create support handle resolve track update document schedule audit train lead collaborate perform provide conduct implement generate respond research organize identify assist answer enter file bill code collect negotiate design build write test deploy optimize plan evaluate report record contact investigate escalate reduce improve drive deliver execute oversee mentor apply use keep help flag check prioritize suggest share correct establish promote validate delegate supervise hold demonstrate'.split(' '));
  var AMB = /^(process|support|design|report|record|plan|test|file|bill|code|audit|document|schedule|update|track|research|answer|contact|drive|train|use|work|apply|post|lead|run)$/;
  var IRR = { lead: 'led', run: 'ran', build: 'built', write: 'wrote', make: 'made', hold: 'held', meet: 'met', keep: 'kept', give: 'gave', take: 'took', send: 'sent', get: 'got', do: 'did' };
  var DBL = /^(submit|plan|stop|refer|commit|admit|control|occur|prefer|transfer|drop|map|log|plot|scan|ship)$/;
  var TPL = [
    ['Follow', 'established procedures for {a} and flag problems early to avoid rework'],
    ['Review', '{a} work for errors before sign-off and correct issues at the source'],
    ['Document', '{a} procedures clearly for colleagues and new starters'],
    ['Prepare', 'clear updates on {a} for supervisors and other stakeholders'],
    ['Handle', '{a} questions from internal teams and outside contacts with clear, courteous communication'],
    ['Track', '{a} items through to completion and keep the team informed on progress'],
    ['Prioritize', '{a} tasks during busy periods to meet deadlines without lowering quality'],
    ['Coordinate', 'with other departments to resolve {a} issues quickly'],
    ['Maintain', 'accurate records of {a} activity in line with company policy'],
    ['Support', 'colleagues on {a} work and share tips that make routine tasks faster'],
    ['Identify', 'recurring problems in {a} and suggest simple fixes to improve turnaround'],
    ['Train', 'new team members on {a} so they reach full productivity sooner'],
    ['Verify', '{a} details against source records to keep output consistent and error-free'],
    ['Streamline', '{a} routines to cut repeat steps and save the team time'],
    ['Partner', 'with clients to clarify {a} requirements and expectations'],
    ['Monitor', '{a} progress daily and escalate blockers before deadlines slip'],
    ['Organize', '{a} materials so the team can find what it needs quickly'],
    ['Resolve', 'escalated {a} issues by finding the root cause and confirming the fix'],
    ['Contribute', 'ideas to improve {a} workflows during team meetings'],
    ['Manage', 'a steady flow of {a} requests while keeping response times short'],
    ['Update', 'stakeholders on {a} status through concise written and verbal reports'],
    ['Audit', '{a} output on a regular basis to confirm it meets company standards'],
    ['Collaborate', 'with teammates on {a} tasks to hit shared goals on time'],
    ['Reduce', 'turnaround time on {a} work by spotting bottlenecks and fixing them'],
    ['Standardize', '{a} steps into repeatable checklists that new hires can follow'],
    ['Respond', 'to {a} requests within agreed timeframes, keeping contacts informed'],
    ['Compile', 'weekly {a} summaries for management review'],
    ['Escalate', 'complex {a} cases to the right owner with clear notes attached'],
    ['Ensure', '{a} work meets internal policy and quality standards before delivery'],
    ['Assist', 'senior staff with {a} projects during peak workloads'],
    ['Perform', 'routine {a} checks with findings shared for team visibility'],
    ['Share', '{a} updates in team huddles so everyone stays aligned'],
    ['Plan', 'daily {a} workload to keep every deadline in view'],
    ['Analyze', '{a} trends to spot errors early and suggest practical fixes']];
  var QUAL = [
    ['Leverage', '{q} expertise to solve day-to-day problems efficiently'],
    ['Strengthen', 'team output through practical command of {q}'],
    ['Demonstrate', 'solid {q} proficiency on every assignment'],
    ['Deliver', 'reliable, high-quality results using {q}'],
    ['Resolve', 'issues involving {q} before they affect deadlines'],
    ['Streamline', 'routine tasks with {q} know-how'],
    ['Contribute', '{q} expertise to team projects and reviews'],
    ['Sharpen', '{q} skills through hands-on, real-world assignments'],
    ['Guide', 'colleagues on {q} best practices'],
    ['Integrate', '{q} into everyday workflows to save time'],
    ['Enhance', 'project quality by applying {q} consistently'],
    ['Utilize', '{q} to meet tight deadlines without cutting corners']];
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
    var seen = {}, J = [], Q = [];
    raw(jd).forEach(function (s) {
      var q = qual(s), m = /^[^:]{3,45}:\s+(.+)$/.exec(s);
      if (m && rewrite(m[1], false)) { s = m[1]; }
      if (q) { var qk = q.toLowerCase(); if (q.length <= 170 && !seen[qk]) { seen[qk] = 1; Q.push(q); } return; }
      s = s.split(';')[0];
      if (s.length < 30 || s.length > 200 || seen[s] || !rewrite(s, false)) { return; }
      seen[s] = 1; J.push(s);
    });
    return { jd: J, q: Q };
  }
  function fmtQ(q) {
    var it = q.split(/,\s*|\s+or\s+|\s+and\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return it.length > 4 ? list(it.slice(0, 4)) : q;
  }
  function mk(T, pt, d) {
    var v = pt ? past(T[0]) : T[0], rest = T[1].replace('{a}', d.a || '').replace('{q}', d.q || '');
    if (pt) { rest = rest.replace(/\b(and|or) ([a-z]+)\b/g, function (m, a, w) { var u = vb(w); return u && !AMB.test(u) ? a + ' ' + past(u) : m; }); }
    return v.charAt(0).toUpperCase() + v.slice(1) + ' ' + rest;
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
    var jd = st.jd || '', KW = keywords(jd), tt = target(jd, KW), LN = lines(jd), pool = LN.jd, used = {};
    var leaderT = LEADT.test(tt), poolNL = pool.filter(function (l) { return !/^(lead|oversee|manage|supervise|delegate|establish|promote|hold)$/.test(rewrite(l, false).split(' ')[0].toLowerCase().replace(/,$/, '')); });
    var NICE = KW.filter(function (k) { return k.indexOf(' ') > -1 || (ORIG[k] && ORIG[k] === ORIG[k].toUpperCase()); }), sk = [];
    var cand = skillItems(jd).concat(BI.map(label), ACR.map(label), NICE.map(label)); if (cand.length < 4) { cand = cand.concat(KW.map(label)); }
    cand.forEach(function (s) { var lo = s.toLowerCase(); if (sk.length < 12 && !sk.some(function (z) { var zl = z.toLowerCase(); return zl.indexOf(lo) > -1 || lo.indexOf(zl) > -1; })) { sk.push(s); } });
    var own = String(st.skills || '').split(/[,\n;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!own.length || st.skillsAuto === true) { st.skills = sk.join(', '); st.skillsAuto = true; }
    else { var have = own.map(function (s) { return s.toLowerCase(); }); sk.forEach(function (s) { if (have.indexOf(s.toLowerCase()) < 0) { own.push(s); } }); st.skills = own.join(', '); }
    var sk2 = sk.filter(function (z) { var zl = z.toLowerCase(); return tt.toLowerCase().indexOf(zl) < 0 && zl.indexOf(tt.toLowerCase()) < 0 && !/^(regarding|including|such|stack|full)\b/.test(zl); });
    if (sk2.length < 3) { sk2 = sk; }
    var slot = function (n) { return sk2.length ? slotText(sk2[n % sk2.length]) : 'daily tasks'; };
    var ex = st.exp.filter(function (x) { return x.company || x.start; }), N = [10, 9, 8];
    ex.forEach(function (x, i) {
      var pt = !(i === 0 && (x.current || !x.end)) && !x.current;
      if (!x.role || x.autoT === true) { x.role = ladder(tt, i); x.autoT = true; }
      if (!String(x.bullets || '').trim() || x.autoB === true) {
        var P = (i > 0 && leaderT) ? poolNL : pool, n = N[Math.min(i, 2)], g1 = [], g2 = [], g3 = [], b = [], c, t, r, k, T, jdMax = Math.min(P.length, 4), qMax = Math.min(LN.q.length, 2);
        var bk = function (l) { return rewrite(l, false).split(' ')[0].toLowerCase().replace(/,$/, ''); };
        var j = (i * 3) % Math.max(P.length, 1);
        for (c = 0; c < P.length && g1.length < jdMax; c++) {
          var line = P[(j + c) % P.length]; k = bk(line);
          if (!used[k]) { used[k] = 1; g1.push(rewrite(line, pt)); }
        }
        for (c = 0; c < LN.q.length && g2.length < qMax; c++) {
          var qq = fmtQ(LN.q[(i * 2 + c) % LN.q.length]);
          for (t = 0; t < QUAL.length; t++) {
            T = QUAL[(i * 5 + c * 3 + t) % QUAL.length]; k = T[0].toLowerCase();
            if (!used[k]) { used[k] = 1; g2.push(mk(T, pt, { q: qq })); break; }
          }
        }
        for (t = 0; t < TPL.length * 2 && g1.length + g2.length + g3.length < n; t++) {
          T = TPL[(i * 7 + t) % TPL.length]; k = T[0].toLowerCase();
          if (used[k]) { continue; }
          used[k] = 1; g3.push(mk(T, pt, { a: slot(i * 3 + t * 2) }));
        }
        for (c = 0; g1.length + g2.length + g3.length > 0; c++) {
          if (g1.length) { b.push(g1.shift()); }
          if (g3.length) { b.push(g3.shift()); }
          if (g2.length) { b.push(g2.shift()); }
        }
        b = b.slice(0, n);
        x.bullets = b.join('\n'); x.autoB = true;
      }
    });
    if (!st.title || st.titleAuto) { st.title = tt; st.titleAuto = true; }
    if (!String(st.summary || '').trim() || st.summaryAuto) {
      var y = years(ex), words = function (s) { return s.split(/\s+/).length; };
      var cut = function (l) { var r = rewrite(l, 'ing'); if (!r) { return null; } r = r.split(/,?\s(?:to|for|so|including)\s|\s\(/)[0]; return r.length > 90 ? r.slice(0, 90).replace(/\s\S*$/, '') : r; };
      var g = pool.filter(function (l) { return !/^apply working knowledge/i.test(l); }).slice(0, 5).map(cut).filter(Boolean), rest = sk.slice(3).map(slotText), h = Math.ceil(rest.length / 2);
      var s1 = tt + (y >= 1 ? ' with ' + y + '+ years of experience' : ' with hands-on experience') + (sk.length ? ' in ' + list(sk.slice(0, 3).map(slotText)) : '') + '.';
      var s3 = rest.length ? ' Working knowledge of ' + list(rest.slice(0, h)) + (rest.length > h ? ', along with ' + list(rest.slice(h)) : '') + '.' : '';
      var L5 = ' Known for accurate, on-time work, clear communication across departments and a steady focus on meeting team goals.', S5 = ' Known for accurate, on-time work and clear communication across departments.';
      var tries = [[3, 1, L5], [3, 0, L5], [3, 0, S5], [2, 0, S5], [1, 0, S5]], pick = '';
      for (var q = 0; q < tries.length; q++) {
        var tr = tries[q];
        pick = s1 + (g.length ? ' Hands-on background in ' + list(g.slice(0, tr[0])) + '.' : '') + s3 + (tr[1] && g.length > 3 ? ' Also experienced in ' + list(g.slice(3, 5)) + '.' : '') + tr[2];
        if (words(pick) <= 95) { break; }
      }
      st.summary = pick;
      st.summaryAuto = true;
    }
    return KW;
  }
  w.FHTailor = { apply: apply, keywords: keywords };
})(window);
