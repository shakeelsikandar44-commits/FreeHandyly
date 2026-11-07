/* FreeHandyly - Calorie (Mifflin-St Jeor) & Water Intake Calculator. Estimates for healthy adults only. */
(function () {
  'use strict';
  var C = window.FHCalc; if (!C) { return; }

  var units = document.getElementById('cw-units');
  function syncUnits() {
    var imp = units.value === 'imperial';
    Array.prototype.forEach.call(document.querySelectorAll('.grp-metric'), function (e) { e.hidden = imp; });
    Array.prototype.forEach.call(document.querySelectorAll('.grp-imperial'), function (e) { e.hidden = !imp; });
    Array.prototype.forEach.call(document.querySelectorAll('.u-w'), function (e) { e.textContent = imp ? 'lb' : 'kg'; });
  }
  units.addEventListener('change', syncUnits);
  syncUnits();

  var GOALS = { '0': 'Daily calories to maintain weight', '-250': 'Daily calories for gradual weight loss',
                '-500': 'Daily calories for faster weight loss', '250': 'Daily calories for gradual weight gain' };

  C.mount({
    cal: function (c) {
      var imp = C.field(c, 'units') === 'imperial';
      var age = C.num(c, 'age'), w = C.num(c, 'weight'), h;
      if (imp) {
        var ft = C.num(c, 'ft'), inch = C.num(c, 'inch');
        h = (isNaN(ft) && isNaN(inch)) ? NaN : ((isNaN(ft) ? 0 : ft) * 12 + (isNaN(inch) ? 0 : inch)) * 2.54;
      } else { h = C.num(c, 'cm'); }
      if (isNaN(age) || isNaN(w) || isNaN(h)) { return null; }
      var kg = imp ? w * 0.45359237 : w;
      if (age < 18 || age > 99) { return { error: 'This calculator is designed for adults aged 18 to 99.' }; }
      if (kg < 30 || kg > 300) { return { error: 'Please enter a realistic weight.' }; }
      if (h < 100 || h > 250) { return { error: 'Please enter a realistic height.' }; }
      var male = C.field(c, 'sex') === 'm';
      var bmr = 10 * kg + 6.25 * h - 5 * age + (male ? 5 : -161);
      var act = parseFloat(C.field(c, 'act')) || 1.2, goal = parseInt(C.field(c, 'goal'), 10) || 0;
      var tdee = bmr * act, target = tdee + goal, floor = male ? 1500 : 1200, floored = false;
      if (target < floor) { target = floor; floored = true; }
      var ex = C.num(c, 'ex'); if (isNaN(ex) || ex < 0) { ex = 0; }
      var clim = parseInt(C.field(c, 'clim'), 10) || 0;
      var ml = Math.round((kg * 35 + ex / 30 * 350 + clim) / 50) * 50;
      var rows = [
        ['Resting energy (BMR)', C.fmt(bmr, 0) + ' kcal'],
        ['Maintenance (TDEE)', C.fmt(tdee, 0) + ' kcal'],
        ['Water per day', C.fmt(ml / 1000, 2) + ' L' + (imp ? ' (' + C.fmt(ml / 29.5735, 0) + ' fl oz)' : '')],
        ['Water in 250 ml glasses', C.fmt(ml / 250, 1)]
      ];
      return {
        label: floored ? 'Target raised to the safe minimum for your sex' : (GOALS[String(goal)] || 'Daily calories'),
        value: C.fmt(target, 0) + ' kcal / day',
        detail: 'Mifflin-St Jeor: 10 \u00d7 kg + 6.25 \u00d7 cm \u2212 5 \u00d7 age ' + (male ? '+ 5' : '\u2212 161') + ', multiplied by activity ' + act + '. Estimates only.',
        rows: rows
      };
    }
  }, 'btn-reset');
})();
