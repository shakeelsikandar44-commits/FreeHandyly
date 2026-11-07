/* FreeHandyly homepage: live tool search + spotlight slider (no dependencies). */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- live search ---------- */
  var input = document.getElementById('toolSearch');
  var items = Array.prototype.slice.call(document.querySelectorAll('.tool-item'));
  var empty = document.getElementById('noResults');
  function filter() {
    var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean), visible = 0;
    items.forEach(function (el) {
      var hay = el.getAttribute('data-search') || '';
      var show = terms.every(function (t) { return hay.indexOf(t) !== -1; });
      el.hidden = !show;
      if (show) { visible += 1; el.classList.add('in'); }
    });
    if (empty) { empty.hidden = visible !== 0; }
  }
  if (input && items.length) { input.addEventListener('input', filter); }

  /* ---------- spotlight slider ---------- */
  var root = document.querySelector('[data-slider]');
  if (!root) { return; }
  var track = root.querySelector('.slides');
  var slides = Array.prototype.slice.call(root.querySelectorAll('.slide'));
  var dotsBox = root.querySelector('.slider-dots');
  var n = slides.length, idx = 0, timer = null, paused = false, scrollT = null;
  if (n < 2) { root.classList.add('single'); return; }

  var dots = slides.map(function (_, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'dot'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
    b.addEventListener('click', function () { go(i); restart(); });
    dotsBox.appendChild(b); return b;
  });

  function mark() {
    dots.forEach(function (d, i) { d.classList.toggle('on', i === idx); d.setAttribute('aria-selected', i === idx ? 'true' : 'false'); });
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === idx); });
  }
  var programmatic = false, target = 0, endT = null, maxT = null;
  function syncFromScroll() {
    var i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== idx) { idx = Math.max(0, Math.min(n - 1, i)); mark(); }
  }
  function go(i) {
    idx = (i + n) % n;
    target = idx * track.clientWidth;
    programmatic = !reduce && Math.abs(track.scrollLeft - target) > 2;   /* our own smooth scroll: do not read the index from it */
    clearTimeout(maxT); maxT = setTimeout(function () { programmatic = false; syncFromScroll(); }, 4000);
    track.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
    mark();
  }
  track.addEventListener('scroll', function () {
    if (programmatic) {
      if (Math.abs(track.scrollLeft - target) <= 2) { programmatic = false; clearTimeout(maxT); }   /* arrived */
      return;
    }
    clearTimeout(endT); endT = setTimeout(syncFromScroll, 80);   /* user swipe: settle on the nearest slide */
  }, { passive: true });
  window.addEventListener('resize', function () { track.scrollLeft = idx * track.clientWidth; });

  root.querySelector('.prev').addEventListener('click', function () { go(idx - 1); restart(); });
  root.querySelector('.next').addEventListener('click', function () { go(idx + 1); restart(); });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { go(idx - 1); restart(); }
    if (e.key === 'ArrowRight') { go(idx + 1); restart(); }
  });

  function stop() { clearInterval(timer); timer = null; }
  function start() { if (reduce || paused || timer || document.hidden) { return; } timer = setInterval(function () { go(idx + 1); }, 5500); }
  function restart() { stop(); start(); }
  ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) { root.addEventListener(ev, function () { paused = true; stop(); }, { passive: true }); });
  ['mouseleave', 'focusout'].forEach(function (ev) { root.addEventListener(ev, function () { paused = false; start(); }); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else { start(); } });

  mark(); start();
})();
