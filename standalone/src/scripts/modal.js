/* ============================================================
   modal.js — signup modal lead-gen logic

   Ported from the Shopify theme. Behaviour, timings and localStorage keys are
   unchanged:
     bs_signed_up  = '1' once subscribed  -> never show again
     bs_modal_seen = Date.now() when seen -> suppress data-suppress-days

   One change for the standalone build. In the Liquid version a successful
   signup POSTed and reloaded the page, and the success block only existed in
   the returned HTML — so its mere presence meant "just signed up". Here the
   block is always in the DOM and starts [hidden], revealed by newsletter.js
   without a reload. So:
     - presence checks now test :not([hidden])
     - the reopen-to-show-the-code flow listens for the newsletter:success
       event newsletter.js dispatches, instead of running once on load
   ============================================================ */
(function () {
  'use strict';

  function markSignedUp() {
    try { localStorage.setItem('bs_signed_up', '1'); } catch (err) { /* private mode */ }
  }

  /* A success state already visible at load (e.g. restored bfcache page). */
  if (document.querySelector('[data-signup-success]:not([hidden])')) {
    markSignedUp();
  }

  var dlg = document.getElementById('SignupModal');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  if (dlg.dataset.enabled !== 'true') return;

  var delayMs = (parseInt(dlg.dataset.delay, 10) || 16) * 1000;
  var suppressDays = parseInt(dlg.dataset.suppressDays, 10) || 7;
  var exitIntent = dlg.dataset.exitIntent === 'true';
  var lastFocus = null;

  function suppressed() {
    try {
      if (localStorage.getItem('bs_signed_up')) return true;
      var seen = parseInt(localStorage.getItem('bs_modal_seen') || '0', 10);
      return Date.now() - seen < suppressDays * 864e5;
    } catch (err) {
      return true; /* storage unavailable: never nag */
    }
  }

  function markSeen() {
    try { localStorage.setItem('bs_modal_seen', String(Date.now())); } catch (err) { /* noop */ }
  }

  function openModal() {
    if (dlg.open) return;
    lastFocus = document.activeElement;
    dlg.showModal();
    markSeen();
  }

  function closeModal() {
    if (dlg.open) dlg.close();
  }

  /* Focus returns to the opener on any close (button, Escape, backdrop). */
  dlg.addEventListener('close', function () {
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  });

  /* Close buttons ([X], "No thanks", "Carry on shopping"). */
  dlg.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', closeModal);
  });

  /* Backdrop click: a click landing on the <dialog> itself is outside
     .signup-inner. */
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) closeModal();
  });

  /* Explicit triggers anywhere on the page (links, tiles, roster note). */
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-open-signup]');
    if (!trigger) return;
    e.preventDefault();
    openModal();
  });

  /* Signup succeeded anywhere on the page. Mark them signed up; if the form
     that succeeded was the one inside this dialog, make sure the dialog is
     open so they actually see the discount code. */
  document.addEventListener('newsletter:success', function (e) {
    markSignedUp();
    if (dlg.contains(e.target)) openModal();
  });

  /* Timed + exit-intent triggers, suppressed after seen/signup. */
  if (suppressed()) return;

  var timer = setTimeout(openModal, delayMs);

  if (exitIntent) {
    document.addEventListener('mouseout', function onExit(e) {
      if (!e.relatedTarget && e.clientY <= 0) {
        clearTimeout(timer);
        document.removeEventListener('mouseout', onExit);
        openModal();
      }
    });
  }
})();
