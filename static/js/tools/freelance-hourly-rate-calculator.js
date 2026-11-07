/* FreeHandyly - Freelance Hourly Rate Calculator. */
(function () {
  'use strict';
  var C = window.FHCalc; if (!C) { return; }
  C.mount({
    rate: function (c) {
      var income = C.num(c, 'income');
      if (isNaN(income)) { return null; }
      function opt(name, dflt) { var v = C.num(c, name); return isNaN(v) ? dflt : v; }
      var exp = opt('exp', 0), tax = opt('tax', 0), hours = opt('hours', 40), bill = opt('bill', 60), off = opt('off', 0), buf = opt('buf', 0);
      var cur = C.field(c, 'cur');
      if (income < 0 || exp < 0) { return { error: 'Income and expenses cannot be negative.' }; }
      if (tax < 0 || tax >= 100) { return { error: 'Tax rate must be between 0 and 99.' }; }
      if (hours < 1 || hours > 100) { return { error: 'Work hours per week must be between 1 and 100.' }; }
      if (bill < 1 || bill > 100) { return { error: 'Billable share must be between 1 and 100 percent.' }; }
      if (off < 0 || off > 51) { return { error: 'Weeks off must be between 0 and 51.' }; }
      if (buf < 0) { return { error: 'Buffer cannot be negative.' }; }
      var weeks = 52 - off;
      var billableHours = hours * weeks * bill / 100;
      var revenue = (income / (1 - tax / 100) + exp * 12) * (1 + buf / 100);
      var rate = revenue / billableHours, allHours = revenue / (hours * weeks);
      return {
        label: 'Minimum hourly rate to charge',
        value: cur + C.fmt(rate, 2) + ' / hour',
        detail: '(' + cur + C.fmt(income, 0) + ' \u00f7 (1 \u2212 ' + C.fmt(tax, 1) + '%) + ' + cur + C.fmt(exp * 12, 0) + ' expenses) \u00d7 (1 + ' + C.fmt(buf, 1) + '% buffer) \u00f7 ' + C.fmt(billableHours, 0) + ' billable hours',
        rows: [
          ['Revenue needed per year', cur + C.fmt(revenue, 0)],
          ['Revenue needed per month', cur + C.fmt(revenue / 12, 0)],
          ['Billable hours per year', C.fmt(billableHours, 0)],
          ['Billable hours per week (average)', C.fmt(billableHours / weeks, 1)],
          ['Effective rate on all hours worked', cur + C.fmt(allHours, 2)],
          ['Full day rate (8 hours)', cur + C.fmt(rate * 8, 0)]
        ]
      };
    }
  }, 'btn-reset');
})();
