/* FreeHandyly - Engagement Rate & Video Retention Calculator. */
(function () {
  'use strict';
  var C = window.FHCalc; if (!C) { return; }

  function parseTime(str) {
    str = (str || '').trim();
    if (!str) { return NaN; }
    if (/^\d+(\.\d+)?$/.test(str)) { return parseFloat(str); }
    var p = str.split(':');
    if (p.length > 3 || p.some(function (x) { return !/^\d+(\.\d+)?$/.test(x); })) { return NaN; }
    return p.reduce(function (s, x) { return s * 60 + parseFloat(x); }, 0);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(sec) {
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  C.mount({
    rate: function (c) {
      var base = C.num(c, 'base'), posts = C.num(c, 'posts');
      if (isNaN(posts)) { posts = 1; }
      var parts = ['likes', 'comments', 'shares', 'saves'].map(function (n) { return C.num(c, n); });
      var any = parts.some(function (x) { return !isNaN(x); });
      if (isNaN(base) || !any) { return null; }
      if (base <= 0) { return { error: 'Followers or views must be greater than zero.' }; }
      if (posts < 1) { return { error: 'Number of posts must be at least 1.' }; }
      if (parts.some(function (x) { return x < 0; })) { return { error: 'Interactions cannot be negative.' }; }
      var total = parts.reduce(function (s, x) { return s + (isNaN(x) ? 0 : x); }, 0);
      var avg = total / posts, rate = avg / base * 100;
      var rating = rate < 1 ? 'Low' : (rate < 3 ? 'Average' : (rate < 6 ? 'Good' : 'Excellent'));
      var byViews = C.field(c, 'mode') === 'views';
      return {
        label: 'Engagement rate ' + (byViews ? '(by views)' : '(by followers)'),
        value: C.fmt(rate, 2) + '%',
        detail: '(' + C.fmt(avg, 2) + ' \u00f7 ' + C.fmt(base) + ') \u00d7 100 = ' + C.fmt(rate, 2) + '%',
        rows: [['Total interactions', C.fmt(total, 0)], ['Average per post', C.fmt(avg, 1)], ['Rule-of-thumb rating', rating]]
      };
    },
    retention: function (c) {
      var len = parseTime(C.field(c, 'len')), avd = parseTime(C.field(c, 'avd'));
      if (C.field(c, 'len') === '' || C.field(c, 'avd') === '') { return null; }
      if (isNaN(len) || isNaN(avd)) { return { error: 'Use mm:ss, hh:mm:ss or seconds, for example 10:30.' }; }
      if (len <= 0) { return { error: 'Video length must be greater than zero.' }; }
      if (avd > len) { return { error: 'Average view duration cannot be longer than the video.' }; }
      var pct = avd / len * 100;
      return {
        label: 'Average audience retention', value: C.fmt(pct, 1) + '%',
        detail: fmtTime(avd) + ' \u00f7 ' + fmtTime(len) + ' \u00d7 100',
        rows: [['Video length', fmtTime(len)], ['Average watched', fmtTime(avd)], ['Average time not watched', fmtTime(len - avd)]]
      };
    }
  }, 'btn-reset');
})();
