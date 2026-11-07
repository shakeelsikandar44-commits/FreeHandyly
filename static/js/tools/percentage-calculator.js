/* FreeHandyly - Percentage Calculator. Pure client-side vanilla JS. */
(function () {
  'use strict';

  var nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
  function fmt(n) { return nf.format(Math.abs(n) < 1e-12 ? 0 : n); }

  function field(card, name) {
    var el = card.querySelector('[data-field="' + name + '"]');
    return el ? el.value.trim() : '';
  }
  function num(card, name) {
    var v = field(card, name);
    if (v === '') { return NaN; }
    var n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function decimals(n) {
    var s = String(n);
    if (s.indexOf('e') !== -1) { return 6; }
    var i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(6, s.length - i - 1);
  }
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  var calculators = {
    // X% of Y
    of: function (c) {
      var x = num(c, 'x'), y = num(c, 'y');
      if (isNaN(x) || isNaN(y)) { return null; }
      var r = x / 100 * y;
      return { label: fmt(x) + '% of ' + fmt(y) + ' is', value: fmt(r),
               detail: '(' + fmt(x) + ' \u00f7 100) \u00d7 ' + fmt(y) + ' = ' + fmt(r) };
    },
    // X is what % of Y
    is: function (c) {
      var x = num(c, 'x'), y = num(c, 'y');
      if (isNaN(x) || isNaN(y)) { return null; }
      if (y === 0) { return { error: 'The whole (Y) cannot be zero.' }; }
      var r = x / y * 100;
      return { label: fmt(x) + ' is this percent of ' + fmt(y), value: fmt(r) + '%',
               detail: '(' + fmt(x) + ' \u00f7 ' + fmt(y) + ') \u00d7 100 = ' + fmt(r) + '%' };
    },
    // % change from A to B
    change: function (c) {
      var a = num(c, 'a'), b = num(c, 'b');
      if (isNaN(a) || isNaN(b)) { return null; }
      if (a === 0) { return { error: 'The starting value cannot be zero, because the change would be undefined.' }; }
      var diff = b - a;
      var pct = diff / Math.abs(a) * 100;
      var word = diff > 0 ? 'Percentage increase' : (diff < 0 ? 'Percentage decrease' : 'No change');
      return { label: word, value: (diff > 0 ? '+' : '') + fmt(pct) + '%',
               detail: '(' + fmt(b) + ' \u2212 ' + fmt(a) + ') \u00f7 ' + fmt(Math.abs(a)) + ' \u00d7 100 = ' + fmt(pct) + '%  (difference ' + fmt(diff) + ')' };
    },
    // base +/- pct%
    adjust: function (c) {
      var base = num(c, 'base'), pct = num(c, 'pct');
      if (isNaN(base) || isNaN(pct)) { return null; }
      var up = field(c, 'mode') === 'up';
      var amount = base * pct / 100;
      var r = up ? base + amount : base - amount;
      return { label: fmt(base) + (up ? ' increased by ' : ' decreased by ') + fmt(pct) + '% is', value: fmt(r),
               detail: fmt(base) + (up ? ' + ' : ' \u2212 ') + fmt(amount) + ' = ' + fmt(r) + '  (' + fmt(pct) + '% of ' + fmt(base) + ' is ' + fmt(amount) + ')' };
    },
    // X is P% of what
    reverse: function (c) {
      var x = num(c, 'x'), p = num(c, 'p');
      if (isNaN(x) || isNaN(p)) { return null; }
      if (p === 0) { return { error: 'The percentage cannot be zero.' }; }
      var r = x / (p / 100);
      return { label: fmt(x) + ' is ' + fmt(p) + '% of', value: fmt(r),
               detail: fmt(x) + ' \u00f7 (' + fmt(p) + ' \u00f7 100) = ' + fmt(r) };
    },
    // discount + optional extra discount + tax
    discount: function (c) {
      var price = num(c, 'price'), d1 = num(c, 'd1'), d2 = num(c, 'd2'), tax = num(c, 'tax');
      if (isNaN(price) || isNaN(d1)) { return null; }
      if (isNaN(d2)) { d2 = 0; }
      if (isNaN(tax)) { tax = 0; }
      if (price < 0 || d1 < 0 || d1 > 100 || d2 < 0 || d2 > 100 || tax < 0) { return { error: 'Use a price of 0 or more and discounts between 0 and 100.' }; }
      var after1 = price * (1 - d1 / 100), after2 = after1 * (1 - d2 / 100), total = after2 * (1 + tax / 100);
      var saved = price - after2, combined = price ? saved / price * 100 : 0;
      var rows = [['You save', fmt(saved)], ['Total discount', fmt(combined) + '%'], ['Price after discount', fmt(after2)]];
      if (tax) { rows.push(['Tax added', fmt(total - after2)]); }
      return { label: tax ? 'Final price including tax' : 'Final price', value: fmt(total),
               detail: fmt(price) + ' \u00d7 (1 \u2212 ' + fmt(d1) + '%)' + (d2 ? ' \u00d7 (1 \u2212 ' + fmt(d2) + '%)' : '') + (tax ? ' \u00d7 (1 + ' + fmt(tax) + '%)' : '') + ' = ' + fmt(total),
               rows: rows };
    },
    // simplify ratio A:B
    ratio: function (c) {
      var a = num(c, 'a'), b = num(c, 'b');
      if (isNaN(a) || isNaN(b)) { return null; }
      if (a <= 0 || b <= 0) { return { error: 'Enter two numbers greater than zero.' }; }
      var k = Math.pow(10, Math.max(decimals(a), decimals(b)));
      var ai = Math.round(a * k), bi = Math.round(b * k);
      var g = gcd(ai, bi);
      var sa = ai / g, sb = bi / g;
      var share = a / (a + b) * 100;
      return { label: fmt(a) + ' : ' + fmt(b) + ' simplifies to', value: nfInt(sa) + ' : ' + nfInt(sb),
               detail: 'A \u00f7 B = ' + fmt(a / b) + '  \u2022  A is ' + fmt(share) + '% of the total (A + B)' };
    }
  };

  function nfInt(n) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n); }

  var cards = Array.prototype.slice.call(document.querySelectorAll('.calc-card'));
  if (!cards.length) { return; }

  function defaults(card) {
    var out = card.querySelector('.calc-out');
    out.classList.remove('has-error', 'has-result');
    var dl0 = out.querySelector('.calc-rows'); if (dl0) { dl0.textContent = ''; }
    out.querySelector('.calc-label').textContent = card.getAttribute('data-default-label');
    out.querySelector('.calc-value').innerHTML = '&nbsp;';
    out.querySelector('.calc-detail').textContent = '';
  }

  function render(card) {
    var fn = calculators[card.getAttribute('data-calc')];
    var out = card.querySelector('.calc-out');
    var res = fn ? fn(card) : null;
    var dl1 = out.querySelector('.calc-rows'); if (dl1) { dl1.textContent = ''; }
    if (!res) { defaults(card); return; }
    out.classList.toggle('has-error', !!res.error);
    out.classList.toggle('has-result', !res.error);
    if (res.error) {
      out.querySelector('.calc-label').textContent = res.error;
      out.querySelector('.calc-value').innerHTML = '&nbsp;';
      out.querySelector('.calc-detail').textContent = '';
    } else {
      out.querySelector('.calc-label').textContent = res.label;
      out.querySelector('.calc-value').textContent = res.value;
      out.querySelector('.calc-detail').textContent = res.detail;
      var dl = out.querySelector('.calc-rows');
      if (dl && res.rows) {
        res.rows.forEach(function (r) {
          var d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = r[0]; dd.textContent = r[1]; d.appendChild(dt); d.appendChild(dd); dl.appendChild(d);
        });
      }
    }
  }

  cards.forEach(function (card) {
    card.setAttribute('data-default-label', card.querySelector('.calc-label').textContent);
    card.addEventListener('input', function () { render(card); });
    card.addEventListener('change', function () { render(card); });
  });

  var reset = document.getElementById('btn-reset');
  if (reset) {
    reset.addEventListener('click', function () {
      cards.forEach(function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('input'), function (i) { i.value = ''; });
        Array.prototype.forEach.call(card.querySelectorAll('select'), function (s) { s.selectedIndex = 0; });
        defaults(card);
      });
    });
  }
})();
