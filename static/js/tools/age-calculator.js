/* FreeHandyly - Age & Date Calculator. */
(function () {
  'use strict';
  var C = window.FHCalc; if (!C) { return; }
  var nf0 = function (n) { return C.fmt(n, 0); };

  function pd(s) { var p = s.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function utc(o) { return Date.UTC(o.y, o.m - 1, o.d); }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function dim(y, m) { return new Date(y, m, 0).getDate(); } /* days in month m (1-based) */
  function ymd(a, b) { /* a <= b, objects {y,m,d}; borrows whole months from the end date backwards */
    var y = b.y - a.y, m = b.m - a.m, d = b.d - a.d, pm = b.m, py = b.y;
    while (d < 0) {
      pm -= 1; if (pm === 0) { pm = 12; py -= 1; }
      d += dim(py, pm); m -= 1;
    }
    if (m < 0) { y -= 1; m += 12; }
    return { y: y, m: m, d: d };
  }
  function days(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function human(r) { return plural(r.y, 'year') + ', ' + plural(r.m, 'month') + ', ' + plural(r.d, 'day'); }

  C.mount({
    age: function (c) {
      var dobS = C.field(c, 'dob'); if (!dobS) { return null; }
      var b = pd(dobS), tp = (C.field(c, 'tob') || '00:00').split(':').map(Number);
      var start = new Date(b.y, b.m - 1, b.d, tp[0] || 0, tp[1] || 0);
      var asofS = C.field(c, 'asof'), end, e;
      if (asofS) { e = pd(asofS); end = new Date(e.y, e.m - 1, e.d, 0, 0); }
      else { end = new Date(); e = { y: end.getFullYear(), m: end.getMonth() + 1, d: end.getDate() }; }
      if (end < start) { return { error: asofS ? 'The \u201Cage on\u201D date is before the date of birth.' : 'The date of birth is in the future.' }; }
      var r = ymd(b, e), totalDays = days(b, e), ms = end - start;
      var bd = function (y) { return { y: y, m: b.m, d: (b.m === 2 && b.d === 29 && !isLeap(y)) ? 28 : b.d }; };
      var nb = bd(e.y); if (utc(nb) < utc(e)) { nb = bd(e.y + 1); }
      var untilNb = days(e, nb), turning = nb.y - b.y;
      return {
        label: asofS ? 'Age on ' + asofS : 'Your age today',
        value: human(r),
        detail: 'Born on a ' + new Date(b.y, b.m - 1, b.d).toLocaleDateString('en-US', { weekday: 'long' }),
        rows: [
          ['Total months', nf0(r.y * 12 + r.m)],
          ['Total weeks', nf0(Math.floor(totalDays / 7))],
          ['Total days', nf0(totalDays)],
          ['Total hours', nf0(Math.floor(ms / 3600000))],
          ['Total minutes', nf0(Math.floor(ms / 60000))],
          ['Next birthday', untilNb === 0 ? 'Today!' : 'in ' + plural(untilNb, 'day') + ' (turning ' + turning + ')']
        ]
      };
    },
    diff: function (c) {
      var as = C.field(c, 'a'), bs = C.field(c, 'b');
      if (!as || !bs) { return null; }
      var a = pd(as), b = pd(bs), swapped = false;
      if (utc(a) > utc(b)) { var t = a; a = b; b = t; swapped = true; }
      var r = ymd(a, b), total = days(a, b), weekdays = 0;
      for (var i = 0; i < total; i++) { var day = new Date(a.y, a.m - 1, a.d + i).getDay(); if (day !== 0 && day !== 6) { weekdays++; } }
      return {
        label: swapped ? 'Difference (dates were swapped)' : 'Difference',
        value: human(r),
        detail: '',
        rows: [
          ['Total days', nf0(total)],
          ['Weeks and days', plural(Math.floor(total / 7), 'week') + ', ' + plural(total % 7, 'day')],
          ['Total months (approx.)', nf0(r.y * 12 + r.m)],
          ['Weekdays Mon\u2013Fri (end date excluded)', nf0(weekdays)]
        ]
      };
    }
  }, 'btn-reset');
})();
