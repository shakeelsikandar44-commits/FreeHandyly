/* FreeHandyly global UI polish: sticky header shadow, reveal-on-scroll, count-up numbers. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 6); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  var els = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  function show(el) { el.classList.add('in'); }
  if (reduce || !('IntersectionObserver' in window)) { els.forEach(show); }
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
    /* safety net: never leave content hidden */
    setTimeout(function () { els.forEach(show); }, 2500);
  }

  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  if (counters.length && !reduce && 'IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) { return; }
        co.unobserve(e.target);
        var el = e.target, target = parseInt(el.getAttribute('data-count'), 10) || 0, t0 = null;
        if (target === 0) { return; }
        function step(t) {
          if (t0 === null) { t0 = t; }
          var p = Math.min(1, (t - t0) / 900);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
          if (p < 1) { requestAnimationFrame(step); }
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { co.observe(el); });
  }
})();
