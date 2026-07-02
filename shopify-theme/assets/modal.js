/* ============================================================
   modal.js — signup modal lead-gen logic (workstream E)

   Ports the static site's main.js behaviour onto the Liquid-rendered
   <dialog id="SignupModal"> (sections/signup-modal.liquid):
   - timed trigger (data-delay seconds, default 16)
   - optional exit intent (mouseout above the viewport top)
   - localStorage keys VERBATIM from the old site:
       bs_signed_up  = '1' once subscribed  -> never show again
       bs_modal_seen = Date.now() when seen -> suppress data-suppress-days
   - [data-open-signup] elements anywhere open it explicitly
   - Escape (native dialog cancel) + backdrop click close; focus returns
     to the opener via the dialog 'close' event
   - after a successful {% form 'customer' %} POST the page reloads with
     the snippet's [data-signup-success] block rendered; if it sits inside
     the dialog we reopen the dialog to show the code
   ============================================================ */
(function () {
  'use strict';

  /* A successful signup anywhere on the page (band, promo, modal,
     password splash) marks the visitor as signed up permanently. */
  var successAnywhere = document.querySelector('[data-signup-success]');
  if (successAnywhere) {
    try { localStorage.setItem('bs_signed_up', '1'); } catch (err) { /* private mode */ }
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

  /* Posted-successfully reopen flow: show the success + code state. */
  if (dlg.querySelector('[data-signup-success]')) {
    openModal();
    return; /* no timed/exit triggers needed on this view */
  }

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
