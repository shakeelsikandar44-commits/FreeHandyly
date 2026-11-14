/* FreeHandyly - Currency & Crypto Converter.
   - The From/To lists are filled immediately from a built-in list of all major currencies, so they never sit on "Loading".
   - Live rates come from our server (/api/rates); if that fails the browser tries public backup sources directly.
   - Below the converter: quick amounts for the chosen pair and a searchable table of every currency. */
(function () {
  'use strict';
  var U = window.FH, $ = U.$;
  var amountEl = $('cc-amount'); if (!amountEl) { return; }
  var fromEl = $('cc-from'), toEl = $('cc-to'), swapBtn = $('cc-swap'), labelEl = $('cc-label'), resultEl = $('cc-result'), rateEl = $('cc-rate'),
      statusEl = $('cc-status'), retryBtn = $('cc-retry'), quickEl = $('cc-quick'), allEl = $('cc-all'), filterEl = $('cc-filter');

  var CODES = ('AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP ' +
    'CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR ' +
    'IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK ' +
    'MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLL SOS ' +
    'SRD SSP STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL').split(' ');
  var CRYPTO = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC', 'ADA', 'TRX', 'USDC', 'DOT'];
  var CRYPTO_NAMES = { BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', LTC: 'Litecoin', ADA: 'Cardano', TRX: 'TRON', USDC: 'USD Coin', DOT: 'Polkadot' };
  var POPULAR = ['USD', 'PKR', 'EUR', 'GBP', 'AED', 'SAR', 'INR', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF', 'TRY', 'BDT', 'QAR', 'KWD', 'OMR', 'MYR', 'SGD', 'THB'];
  var QUICK = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
  var SOURCES = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json'
  ];
  var fiat = {}, crypto = {}, haveRates = false, failed = false, names = null, nameCache = {};
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (e) { names = null; }

  function nameOf(code) {
    if (CRYPTO_NAMES[code]) { return CRYPTO_NAMES[code]; }
    if (nameCache[code] === undefined) { try { nameCache[code] = names ? names.of(code) : ''; } catch (e) { nameCache[code] = ''; } if (nameCache[code] === code) { nameCache[code] = ''; } }
    return nameCache[code];
  }
  function isCrypto(code) { return Object.prototype.hasOwnProperty.call(crypto, code) || CRYPTO.indexOf(code) !== -1; }
  function usdValue(code) { /* value of 1 unit in USD */
    if (crypto[code] > 0) { return crypto[code]; }
    return fiat[code] > 0 ? 1 / fiat[code] : NaN;
  }
  function fmtVal(v, code) {
    if (!isFinite(v)) { return '\u2014'; }
    var c = isCrypto(code), a = Math.abs(v), o;
    if (a === 0) { return '0'; }
    if (a >= 1) { o = { maximumFractionDigits: c ? 6 : 2 }; }
    else if (a >= 0.01) { o = { maximumFractionDigits: c ? 8 : 4 }; }
    else { o = { maximumSignificantDigits: 6 }; }
    return new Intl.NumberFormat('en-US', o).format(v);
  }
  function fmtAmount(v) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(v); }

  /* ---- the currency list (static first, refined once real rates are known) ---- */
  function fiatCodes() {
    var base = haveRates ? CODES.filter(function (c) { return fiat[c] > 0; }) : CODES.slice();
    if (base.indexOf('USD') === -1) { base.push('USD'); }
    var pop = POPULAR.filter(function (c) { return base.indexOf(c) !== -1; });
    var rest = base.filter(function (c) { return pop.indexOf(c) === -1; }).sort();
    return { pop: pop, rest: rest };
  }
  function allCodes() { var f = fiatCodes(); return f.pop.concat(f.rest, haveRates ? CRYPTO.filter(function (c) { return crypto[c] > 0; }) : CRYPTO); }
  function option(code) { var n = nameOf(code); return U.el('option', { value: code }, code + (n ? ' \u2013 ' + n : '')); }
  function fillSelect(sel, keep) {
    var f = fiatCodes(), cryptos = haveRates ? CRYPTO.filter(function (c) { return crypto[c] > 0; }) : CRYPTO;
    sel.textContent = '';
    [['Popular', f.pop], ['All currencies', f.rest], ['Cryptocurrency', cryptos]].forEach(function (g) {
      if (!g[1].length) { return; }
      var og = U.el('optgroup', { label: g[0] }); g[1].forEach(function (c) { og.appendChild(option(c)); }); sel.appendChild(og);
    });
    if (keep && sel.querySelector('option[value="' + keep + '"]')) { sel.value = keep; }
  }

  /* ---- results and tables ---- */
  function pair() {
    var amt = parseFloat(amountEl.value), from = fromEl.value, to = toEl.value, a = usdValue(from), b = usdValue(to);
    return { amt: amt, from: from, to: to, unit: (isFinite(a) && isFinite(b)) ? a / b : NaN };
  }
  function renderResult() {
    var p = pair();
    if (!isFinite(p.amt) || p.amt < 0) { labelEl.textContent = 'Enter an amount'; resultEl.innerHTML = '&nbsp;'; rateEl.textContent = ''; return; }
    if (!haveRates) {
      labelEl.textContent = failed ? 'Live rates are not available right now' : 'Loading live exchange rates\u2026';
      resultEl.innerHTML = '&nbsp;'; rateEl.textContent = failed ? 'Your selection is kept. Press \u201CTry again\u201D below.' : ''; return;
    }
    if (!isFinite(p.unit)) { labelEl.textContent = 'Rate not available for this pair'; resultEl.innerHTML = '&nbsp;'; rateEl.textContent = ''; return; }
    labelEl.textContent = fmtAmount(p.amt) + ' ' + p.from + ' =';
    resultEl.textContent = fmtVal(p.amt * p.unit, p.to) + ' ' + p.to;
    rateEl.textContent = '1 ' + p.from + ' = ' + fmtVal(p.unit, p.to) + ' ' + p.to + '   \u2022   1 ' + p.to + ' = ' + fmtVal(1 / p.unit, p.from) + ' ' + p.from;
  }
  function renderQuick() {
    var p = pair(); quickEl.textContent = '';
    $('cc-q-h1').textContent = p.from; $('cc-q-h2').textContent = p.to;
    QUICK.forEach(function (a) {
      var tr = document.createElement('tr');
      tr.appendChild(U.el('td', null, new Intl.NumberFormat('en-US').format(a) + ' ' + p.from));
      tr.appendChild(U.el('td', { 'class': 'text-end fw-semibold' }, haveRates && isFinite(p.unit) ? fmtVal(a * p.unit, p.to) + ' ' + p.to : '\u2014'));
      quickEl.appendChild(tr);
    });
  }
  function renderAll() {
    var p = pair(), amt = isFinite(p.amt) && p.amt >= 0 ? p.amt : 1, q = filterEl.value.trim().toLowerCase();
    $('cc-all-title').textContent = 'All rates for ' + p.from; $('cc-h-unit').textContent = '1 ' + p.from + ' ='; $('cc-h-amt').textContent = fmtAmount(amt) + ' ' + p.from + ' =';
    allEl.textContent = '';
    allCodes().forEach(function (code) {
      if (code === p.from) { return; }
      var n = nameOf(code); if (q && (code.toLowerCase() + ' ' + n.toLowerCase()).indexOf(q) === -1) { return; }
      var unit = usdValue(p.from) / usdValue(code), ok = haveRates && isFinite(unit);
      var tr = U.el('tr', code === p.to ? { 'class': 'is-selected' } : null); tr.setAttribute('tabindex', '0'); tr.setAttribute('role', 'button'); tr.setAttribute('aria-label', 'Convert to ' + code); tr.setAttribute('data-code', code);
      var c1 = document.createElement('td'); c1.appendChild(U.el('b', null, code)); if (n) { c1.appendChild(document.createTextNode(' ' + n)); }
      tr.appendChild(c1); tr.appendChild(U.el('td', { 'class': 'text-end' }, ok ? fmtVal(unit, code) : '\u2014')); tr.appendChild(U.el('td', { 'class': 'text-end fw-semibold' }, ok ? fmtVal(unit * amt, code) : '\u2014'));
      allEl.appendChild(tr);
    });
    if (!allEl.children.length) { var tr0 = document.createElement('tr'), td0 = U.el('td', null, 'No currency matches your search.'); td0.colSpan = 3; tr0.appendChild(td0); allEl.appendChild(tr0); }
  }
  var raf = 0, lastUpdated = '';
  function refresh(full) {
    renderResult(); if (!full) { return; }
    cancelAnimationFrame(raf); raf = requestAnimationFrame(function () { renderQuick(); renderAll(); });
  }
  function setStatus(msg, isErr) { statusEl.textContent = msg || ''; statusEl.className = 'status-line mb-0' + (isErr ? ' err' : ''); }

  /* ---- crypto prices in PKR table ---- */
  function money(v, sym) {
    var d = v >= 1000 ? 0 : v >= 1 ? 2 : v >= .01 ? 4 : 6;
    return sym + new Intl.NumberFormat('en-US', { minimumFractionDigits: v >= 1 && v < 1000 ? 2 : 0, maximumFractionDigits: d }).format(v);
  }
  function renderPk() {
    var body = $('pk-body'); if (!body) { return; }
    body.textContent = '';
    var pkr = fiat && fiat.PKR, upd = $('pk-updated'), shown = 0;
    if (haveRates && pkr > 0) {
      CRYPTO.forEach(function (code) {
        var usd = crypto[code]; if (!(usd > 0)) { return; }
        var tr = document.createElement('tr'), c1 = document.createElement('td');
        c1.appendChild(U.el('b', null, code)); c1.appendChild(document.createTextNode(' ' + nameOf(code)));
        tr.appendChild(c1); tr.appendChild(U.el('td', { 'class': 'text-end fw-semibold' }, money(usd * pkr, 'Rs '))); tr.appendChild(U.el('td', { 'class': 'text-end' }, money(usd, '$')));
        body.appendChild(tr); shown++;
      });
    }
    if (!shown) { var tr0 = document.createElement('tr'), td0 = U.el('td', null, 'Live crypto prices are not available right now. Try again in a minute.'); td0.colSpan = 3; tr0.appendChild(td0); body.appendChild(tr0); }
    if (upd) { upd.textContent = shown && lastUpdated ? 'Crypto prices updated: ' + lastUpdated + (/\d:\d\d/.test(lastUpdated) ? '.' : ' (daily rate; the live price feed was unavailable).') : ''; }
  }

  /* ---- loading live rates (server first, then public backup sources straight from the browser) ---- */
  function fromServer() {
    return fetch('/api/rates', { headers: { 'Accept': 'application/json' } }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) { throw new Error(d.error || 'server'); } return d; });
    });
  }
  function fromBackup(url) {
    return fetch(url).then(function (r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.json(); }).then(function (j) {
      var u = j.usd || {}, f = { USD: 1 }, c = {};
      CODES.forEach(function (code) { var v = u[code.toLowerCase()]; if (v > 0) { f[code] = v; } });
      CRYPTO.forEach(function (code) { var v = u[code.toLowerCase()]; if (v > 0) { c[code] = 1 / v; } });
      return { fiat: f, crypto: c, fiat_updated: j.date || '', crypto_updated: j.date || '', source: 'currency-api (backup)' };
    });
  }
  function usable(d) { return d && d.fiat && Object.keys(d.fiat).length >= 5; }
  function fetchRates() {
    var chain = [fromServer].concat(SOURCES.map(function (u) { return function () { return fromBackup(u); }; }));
    return chain.reduce(function (p, step) {
      return p.then(function (d) { return d; }, function () { return step().then(function (d) { if (!usable(d)) { throw new Error('empty'); } return d; }); });
    }, Promise.reject(new Error('start')));
  }
  function apply(d) {
    fiat = d.fiat || {}; crypto = d.crypto || {}; fiat.USD = 1; haveRates = true; failed = false;
    var f = fromEl.value, t = toEl.value; fillSelect(fromEl, f); fillSelect(toEl, t);
    var parts = [];
    if (d.fiat_updated) { parts.push('Currency rates: ' + String(d.fiat_updated).replace(/ \+0000$/, ' UTC')); }
    if (d.crypto_updated && d.crypto_updated !== d.fiat_updated) { parts.push('Crypto: ' + d.crypto_updated); }
    if (d.source) { parts.push('Source: ' + d.source); }
    lastUpdated = String(d.crypto_updated || d.fiat_updated || '').replace(/ \+0000$/, ' UTC');
    setStatus(parts.join('  \u2022  ') + (d.stale ? '  (slightly out of date)' : '')); retryBtn.hidden = true; refresh(true); renderPk();
  }
  function load() {
    retryBtn.hidden = true; failed = false; setStatus('Loading live exchange rates\u2026'); refresh(false);
    return fetchRates().then(apply, function () {
      failed = true; haveRates = false; retryBtn.hidden = false;
      setStatus('Could not load live exchange rates. Check your internet connection or try again in a minute.', true); refresh(true); renderPk();
    });
  }

  /* ---- events ---- */
  amountEl.addEventListener('input', function () { refresh(true); });
  fromEl.addEventListener('change', function () { refresh(true); });
  toEl.addEventListener('change', function () { refresh(true); });
  swapBtn.addEventListener('click', function () { var f = fromEl.value; fromEl.value = toEl.value; toEl.value = f; refresh(true); });
  filterEl.addEventListener('input', function () { renderAll(); });
  retryBtn.addEventListener('click', load);
  function pickRow(e) {
    var tr = e.target.closest('tr[data-code]'); if (!tr) { return; }
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') { return; }
    e.preventDefault(); toEl.value = tr.getAttribute('data-code'); refresh(true); resultEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  allEl.addEventListener('click', pickRow); allEl.addEventListener('keydown', pickRow);

  /* ---- start ---- */
  fillSelect(fromEl, 'USD'); fillSelect(toEl, 'PKR'); refresh(true);
  load();
})();
