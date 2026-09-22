/* ============================================================
   carousel.js — homepage product carousel (CollectionGrid `carousel`)

   Below 861px the product grid is a one-row scroll-snap track (the CSS
   lives in CollectionGrid.astro). Swiping is native scrolling and needs no
   JS; this adds:
   - auto-advance: one card every ADVANCE_MS, wrapping from the last card
     back to the first
   - manual override: any swipe, wheel, key or dot tap hands control to the
     visitor, and auto-advance only picks up again after RESUME_MS of quiet
   - dots that follow the scroll position and jump to a card when tapped
   - a pause/resume toggle, so the movement can be stopped (WCAG 2.2.2)

   Auto-advance also holds while the carousel is off-screen, the tab is
   hidden, a mouse is over it, or keyboard focus is inside it. Under
   prefers-reduced-motion it never starts and the toggle is hidden.
   Above 860px the grid is a static 3-up row and none of this runs.
   ============================================================ */
(function () {
  'use strict';

  var ADVANCE_MS = 5000;
  var RESUME_MS = 8000;

  var roots = document.querySelectorAll('[data-carousel]');
  if (!roots.length) return;

  var layout = window.matchMedia('(max-width: 860px)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  Array.prototype.forEach.call(roots, init);

  function isFocusVisible(el) {
    try {
      return el.matches(':focus-visible');
    } catch (err) {
      return true; // no :focus-visible support: treat all focus as keyboard focus
    }
  }

  function init(root) {
    var track = root.querySelector('[data-carousel-track]');
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-carousel-dot]'));
    var toggle = root.querySelector('[data-carousel-toggle]');
    if (!track) return;
    var slides = Array.prototype.slice.call(track.children);
    if (slides.length < 2) return;

    var timer = null;
    var paused = false;   // the visitor pressed pause
    var onScreen = false;
    var hovered = false;
    var focused = false;
    var holdUntil = 0;    // Date.now() before which a manual hold blocks autoplay
    var frame = 0;

    /* Where the track rests with slide i centred, clamped to what the track
       can actually scroll (the first and last cards can't reach centre). */
    function restingLeft(i) {
      var slide = slides[i];
      var max = track.scrollWidth - track.clientWidth;
      var left = slide.offsetLeft + slide.offsetWidth / 2 - track.clientWidth / 2;
      return Math.max(0, Math.min(max, left));
    }

    function currentIndex() {
      var best = 0;
      var bestDistance = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var distance = Math.abs(restingLeft(i) - track.scrollLeft);
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      }
      return best;
    }

    function markDots() {
      var active = currentIndex();
      dots.forEach(function (dot, i) {
        if (i === active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function goTo(i) {
      track.scrollTo({
        left: restingLeft(i),
        behavior: reduceMotion.matches ? 'auto' : 'smooth',
      });
    }

    function canRun() {
      return layout.matches && !reduceMotion.matches && !paused &&
        onScreen && !document.hidden && !hovered && !focused;
    }

    // Never fires before a manual hold has run out, whoever reschedules: focus,
    // visibility and hover events all call this with ADVANCE_MS mid-hold.
    function schedule(delay) {
      clearTimeout(timer);
      timer = null;
      if (canRun()) timer = setTimeout(advance, Math.max(delay, holdUntil - Date.now()));
    }

    function advance() {
      timer = null;
      if (!canRun()) return;
      goTo((currentIndex() + 1) % slides.length);
      schedule(ADVANCE_MS);
    }

    /* The visitor took over: stop the clock and restart it only after a
       quiet spell, so a card they've swiped to isn't pulled away mid-read. */
    function takeOver() {
      holdUntil = Date.now() + RESUME_MS;
      schedule(RESUME_MS);
    }

    track.addEventListener('scroll', function () {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        markDots();
      });
    }, { passive: true });

    // Programmatic scrollTo fires scroll events too, so manual input is
    // detected from the input events that only a person produces.
    track.addEventListener('pointerdown', takeOver, { passive: true });
    track.addEventListener('wheel', takeOver, { passive: true });
    track.addEventListener('keydown', takeOver);

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goTo(i);
        takeOver();
      });
    });

    function syncToggle() {
      if (!toggle) return;
      toggle.hidden = reduceMotion.matches;
      toggle.toggleAttribute('data-paused', paused);
      toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause);
    }

    if (toggle) {
      toggle.addEventListener('click', function () {
        paused = !paused;
        syncToggle();
        schedule(ADVANCE_MS);
      });
    }

    // Hover only counts for a real mouse: touch fires emulated mouse events
    // on tap that never "leave", which would stall the carousel for good.
    root.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      hovered = true;
      schedule(ADVANCE_MS);
    });
    root.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      hovered = false;
      schedule(ADVANCE_MS);
    });
    // Only keyboard focus holds it. Android Chrome focuses a button on tap, so
    // counting every focus would leave the carousel stuck after a dot or the
    // resume toggle was tapped.
    root.addEventListener('focusin', function (e) {
      focused = isFocusVisible(e.target);
      schedule(ADVANCE_MS);
    });
    root.addEventListener('focusout', function (e) {
      if (root.contains(e.relatedTarget)) return;
      focused = false;
      schedule(ADVANCE_MS);
    });

    if ('IntersectionObserver' in window) {
      // isIntersecting is true for any overlap at all; the threshold only sets
      // when the callback fires, so "on screen" is read from the ratio.
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].intersectionRatio >= 0.5;
        schedule(ADVANCE_MS);
      }, { threshold: 0.5 }).observe(track);
    } else {
      onScreen = true;
    }

    document.addEventListener('visibilitychange', function () {
      schedule(ADVANCE_MS);
    });

    function onEnvironmentChange() {
      syncToggle();
      markDots();
      schedule(ADVANCE_MS);
    }
    layout.addEventListener('change', onEnvironmentChange);
    reduceMotion.addEventListener('change', onEnvironmentChange);

    onEnvironmentChange();
  }
})();
