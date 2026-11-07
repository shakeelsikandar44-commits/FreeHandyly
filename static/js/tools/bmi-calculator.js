/* FreeHandyly - BMI Calculator (adults). Standard WHO and South Asian / Asia-Pacific reference ranges. */
(function () {
  'use strict';
  var C = window.FHCalc; if (!C) { return; }
  var card = document.querySelector('[data-calc="bmi"]');
  var out = card.querySelector('.calc-out');
  var scale = document.getElementById('bmi-scale'), marker = document.getElementById('bmi-marker'), ticks = document.getElementById('bmi-ticks');
  var MIN = 10, MAX = 40;

  function syncUnits() {
    var imp = card.querySelector('[data-field="units"]').value === 'imperial';
    Array.prototype.forEach.call(card.querySelectorAll('.grp-metric'), function (e) { e.hidden = imp; });
    Array.prototype.forEach.call(card.querySelectorAll('.grp-imperial'), function (e) { e.hidden = !imp; });
    Array.prototype.forEach.call(card.querySelectorAll('.u-w'), function (e) { e.textContent = imp ? 'lb' : 'kg'; });
  }
  card.querySelector('[data-field="units"]').addEventListener('change', syncUnits);
  syncUnits();

  function cuts(ref) { return ref === 'asia' ? [18.5, 23, 25] : [18.5, 25, 30]; }
  function category(b, ref) {
    if (ref === 'asia') {
      if (b < 18.5) { return { name: 'Underweight', cls: 'low' }; }
      if (b < 23) { return { name: 'Healthy weight', cls: 'ok' }; }
      if (b < 25) { return { name: 'Overweight', cls: 'warn' }; }
      return { name: b < 30 ? 'Obese (class I)' : 'Obese (class II or higher)', cls: 'high' };
    }
    if (b < 16) { return { name: 'Severely underweight', cls: 'low' }; }
    if (b < 18.5) { return { name: 'Underweight', cls: 'low' }; }
    if (b < 25) { return { name: 'Healthy weight', cls: 'ok' }; }
    if (b < 30) { return { name: 'Overweight', cls: 'warn' }; }
    if (b < 35) { return { name: 'Obese (class I)', cls: 'high' }; }
    if (b < 40) { return { name: 'Obese (class II)', cls: 'high' }; }
    return { name: 'Obese (class III)', cls: 'high' };
  }

  function read(c) {
    var imp = C.field(c, 'units') === 'imperial', age = C.num(c, 'age'), w = C.num(c, 'weight'), h;
    if (imp) {
      var ft = C.num(c, 'ft'), inch = C.num(c, 'inch');
      h = (isNaN(ft) && isNaN(inch)) ? NaN : ((isNaN(ft) ? 0 : ft) * 12 + (isNaN(inch) ? 0 : inch)) * 2.54;
    } else { h = C.num(c, 'cm'); }
    if (isNaN(age) || isNaN(w) || isNaN(h)) { return null; }
    return { imp: imp, age: age, kg: imp ? w * 0.45359237 : w, cm: h, ref: C.field(c, 'ref') || 'standard' };
  }

  function compute(c) {
    var r = read(c); if (!r) { return null; }
    if (r.age < 18 || r.age > 120) { return { error: 'The BMI categories here are for adults aged 18 and over. Children and teenagers use growth charts: ask a doctor.' }; }
    if (r.kg < 20 || r.kg > 400) { return { error: 'Please enter a realistic weight.' }; }
    if (r.cm < 100 || r.cm > 250) { return { error: 'Please enter a realistic height (100 to 250 cm).' }; }
    var m = r.cm / 100, bmi = r.kg / (m * m);
    return { r: r, bmi: bmi, m: m, cat: category(bmi, r.ref) };
  }

  C.mount({
    bmi: function (c) {
      var x = compute(c); if (!x) { return null; }
      if (x.error) { return { error: x.error }; }
      var r = x.r, hiBmi = r.ref === 'asia' ? 22.9 : 24.9;
      var lo = 18.5 * x.m * x.m, hi = hiBmi * x.m * x.m, k = r.imp ? 2.20462262 : 1, unit = r.imp ? 'lb' : 'kg';
      return {
        label: 'Your BMI is in the \u201C' + x.cat.name + '\u201D range',
        value: C.fmt(x.bmi, 1),
        detail: r.imp ? 'BMI = 703 \u00d7 weight (lb) \u00f7 height (in)\u00b2' : 'BMI = weight (kg) \u00f7 height (m)\u00b2',
        rows: [
          ['Category (' + (r.ref === 'asia' ? 'South Asian' : 'WHO') + ')', x.cat.name],
          ['Healthy weight range for your height', C.fmt(lo * k, 1) + ' \u2013 ' + C.fmt(hi * k, 1) + ' ' + unit],
          ['Healthy BMI band', '18.5 \u2013 ' + hiBmi]
        ]
      };
    }
  }, 'btn-reset');

  /* gauge + colour, updated after the engine has rendered (our listeners are registered later) */
  function updateGauge() {
    var x = compute(card);
    if (!x || x.error) { scale.hidden = true; out.setAttribute('data-cat', ''); return; }
    var cs = cuts(x.r.ref), pct = function (v) { return Math.max(0, Math.min(100, (v - MIN) / (MAX - MIN) * 100)); };
    var edges = [MIN].concat(cs, [MAX]), names = ['low', 'ok', 'warn', 'high'];
    names.forEach(function (n, i) { scale.querySelector('.seg-' + n).style.flexBasis = (pct(edges[i + 1]) - pct(edges[i])) + '%'; });
    marker.style.left = pct(x.bmi) + '%';
    ticks.textContent = '';
    cs.forEach(function (v) { var s = document.createElement('span'); s.textContent = String(v); s.style.left = pct(v) + '%'; ticks.appendChild(s); });
    scale.hidden = false; out.setAttribute('data-cat', x.cat.cls);
  }
  card.addEventListener('input', updateGauge);
  card.addEventListener('change', updateGauge);
  document.getElementById('btn-reset').addEventListener('click', function () { setTimeout(function () { syncUnits(); updateGauge(); }, 0); });
})();
