/* ============================================================
   nav.js — the [ MENU ] toggle for the masthead at ≤860px

   Contract:
   - [data-nav-toggle] (Masthead.astro) flips .nav-open on .masthead and keeps
     its own aria-expanded in step. theme.css only hides the menu under
     html.js, so without this script the links stay visible.
   - Closes on Escape (focus goes back to the button), on a click outside the
     masthead, on following a menu link, and when the viewport grows past the
     breakpoint, where the menu is an ordinary row again.
   ============================================================ */
(function () {
  'use strict';

  var masthead = document.querySelector('.masthead');
  var toggle = masthead && masthead.querySelector('[data-nav-toggle]');
  if (!masthead || !toggle) return;

  function isOpen() {
    return masthead.classList.contains('nav-open');
  }

  function setOpen(open) {
    masthead.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function () {
    setOpen(!isOpen());
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });

  document.addEventListener('click', function (event) {
    if (!isOpen()) return;
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (!masthead.contains(target) || target.closest('.mh-link, [data-cart-toggle]')) setOpen(false);
  });

  var wide = window.matchMedia('(min-width: 861px)');
  wide.addEventListener('change', function (event) {
    if (event.matches) setOpen(false);
  });
})();
