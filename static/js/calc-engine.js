/* FreeHandyly calculator engine: wires .calc-card[data-calc] cards to calculator functions.
   A calculator returns null (waiting for input), {error}, or {label, value, detail, rows:[[k,v],...]}. */
window.FHCalc = (function () {
  'use strict';

  var nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
  function fmt(n, max) {
    if (max != null) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 }).format(n); }
    return nf.format(Math.abs(n) < 1e-12 ? 0 : n);
  }
  function field(card, name) { var el = card.querySelector('[data-field="' + name + '"]'); return el ? el.value.trim() : ''; }
  function num(card, name) {
    var v = field(card, name);
    if (v === '') { return NaN; }
    var n = Number(v);
    return isFinite(n) ? n : NaN;
  }

  function setOut(card, res) {
    var out = card.querySelector('.calc-out');
    var label = out.querySelector('.calc-label'), value = out.querySelector('.calc-value'),
        detail = out.querySelector('.calc-detail'), rows = out.querySelector('.calc-rows');
    out.classList.remove('has-error', 'has-result');
    if (rows) { rows.textContent = ''; }
    if (!res) {
      label.textContent = card._defaultLabel; value.innerHTML = '&nbsp;'; detail.textContent = '';
      return;
    }
    if (res.error) {
      out.classList.add('has-error');
      label.textContent = res.error; value.innerHTML = '&nbsp;'; detail.textContent = '';
      return;
    }
    out.classList.add('has-result');
    label.textContent = res.label || '';
    value.textContent = res.value || '';
    detail.textContent = res.detail || '';
    if (rows && res.rows) {
      res.rows.forEach(function (r) {
        var d = document.createElement('div');
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        d.appendChild(dt); d.appendChild(dd); rows.appendChild(d);
      });
    }
  }

  function mount(calculators, resetId) {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.calc-card'));
    function render(card) {
      var fn = calculators[card.getAttribute('data-calc')];
      var res = null;
      try { res = fn ? fn(card) : null; } catch (e) { res = { error: 'Something went wrong with that input.' }; }
      setOut(card, res);
    }
    cards.forEach(function (card) {
      card._defaultLabel = card.querySelector('.calc-label').textContent;
      card.addEventListener('input', function () { render(card); });
      card.addEventListener('change', function () { render(card); });
      render(card);
    });
    var reset = resetId ? document.getElementById(resetId) : null;
    if (reset) {
      reset.addEventListener('click', function () {
        cards.forEach(function (card) {
          Array.prototype.forEach.call(card.querySelectorAll('input'), function (i) { i.value = i.getAttribute('value') || ''; });
          Array.prototype.forEach.call(card.querySelectorAll('select'), function (s) {
            var def = 0;
            Array.prototype.forEach.call(s.options, function (o, idx) { if (o.defaultSelected) { def = idx; } });
            s.selectedIndex = def;
          });
          card.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
    return { render: function () { cards.forEach(render); } };
  }

  return { mount: mount, num: num, field: field, fmt: fmt };
})();
