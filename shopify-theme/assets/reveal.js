/* ============================================================
   reveal.js — scroll reveals (workstream E)

   Ports the static site's observers:
   - dossier signal-in: `.dossier .hit` AND `.dossier strong` (bold in
     dossier rich text is the metafield-era ".hit" treatment — flagged by
     the product-system workstream). Both get .hit--live when scrolled
     into view; the keyframes/hiding live in CSS behind the html.js gate,
     so no-JS visitors never see hidden text.
   - generic `.reveal` / `.reveal-stagger`: adds .in (sections that opt in
     ship their own .reveal CSS — theme.css has none by design)
   Observer tuning per main.js: threshold 0.08, rootMargin '0px 0px -8% 0px'.
   Safety flush after 3s covers observer misses. Reduced motion or no
   IntersectionObserver: everything shows immediately.
   ============================================================ */
(function () {
  'use strict';

  /* html.js gating: theme.liquid swaps no-js -> js before this runs.
     If that didn't happen nothing is visually hidden, so bail. */
  if (!document.documentElement.classList.contains('js')) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var hitEls = Array.prototype.slice.call(
    document.querySelectorAll('.dossier .hit, .dossier strong')
  );
  var revealEls = Array.prototype.slice.call(
    document.querySelectorAll('.reveal, .reveal-stagger')
  );

  function fire(el) {
    /* Anything inside a dossier is a signal-in hit; the rest are reveals. */
    el.classList.add(el.closest('.dossier') ? 'hit--live' : 'in');
  }

  function flush() {
    hitEls.forEach(fire);
    revealEls.forEach(fire);
  }

  if (reduceMotion || !('IntersectionObserver' in window)) {
    flush();
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      fire(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });

  hitEls.forEach(function (el) { io.observe(el); });
  revealEls.forEach(function (el) { io.observe(el); });

  /* Safety: reveal anything still hidden after 3s (observer miss). */
  setTimeout(flush, 3000);
})();
