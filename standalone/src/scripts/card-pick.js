/* ============================================================
   card-pick.js — the modal size picker behind a product card's
   [ ADD TO CART ]

   Contract (ProductCard.astro):
   - [data-card-pick] opens the <dialog class="card-pick-modal"> its
     aria-controls names, as a modal. The browser supplies the focus trap,
     Escape to close, and the return of focus to the button on close. A click
     that starts and ends on the backdrop, or one on [data-card-pick-close],
     also closes it.
   - A tap on a size pill inside the dialog is the add. By the time this
     document-level handler runs, product-form.js (which listens on the pill
     group, nearer the target) has already written the matching variant id
     into the dialog's hidden input. This then presses the dialog's hidden
     [data-add-to-cart], which cart.js handles like any other add button, so
     the bag logic lives in one place, and closes the dialog.
   - A colour pill only changes the selection (and the dialog's photo); it
     never adds.
   - Where <dialog> is not supported the button goes to the product page.
   ============================================================ */
(function () {
  'use strict';

  function clearSizes(dialog) {
    // Leave no size looking chosen: the next open starts from a clean slate.
    dialog.querySelectorAll('.size-pill[aria-pressed="true"]').forEach(function (pill) {
      pill.setAttribute('aria-pressed', 'false');
    });
  }

  document.querySelectorAll('dialog.card-pick-modal').forEach(function (dialog) {
    dialog.addEventListener('close', function () {
      clearSizes(dialog);
    });
  });

  // The dialog a press started on, when it started on the backdrop itself.
  var pressedBackdrop = null;
  document.addEventListener('pointerdown', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    pressedBackdrop = target && target.matches('dialog.card-pick-modal') ? target : null;
  });

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    var toggle = target.closest('[data-card-pick]');
    if (toggle) {
      var dialog = document.getElementById(toggle.getAttribute('aria-controls'));
      if (!dialog || typeof dialog.showModal !== 'function') {
        var fallback = toggle.getAttribute('data-fallback-href');
        if (fallback) window.location.href = fallback;
        return;
      }
      // Closing a dialog hands focus back to whatever had it when it opened.
      // Not every browser focuses a button on click, so make sure it is this one.
      toggle.focus();
      if (!dialog.open) dialog.showModal();
      var first = dialog.querySelector('.size-pill:not([disabled])');
      if (first) first.focus();
      return;
    }

    var open = target.closest('dialog.card-pick-modal');
    if (!open) return;

    // The dialog element itself is only the target when the click landed on its
    // backdrop: its content fills the box edge to edge. The press must have
    // started there too, or a drag that begins on a pill or the title and is
    // released outside the box would count as a backdrop click and close it.
    if (target === open) {
      if (pressedBackdrop === open) open.close();
      return;
    }
    if (target.closest('[data-card-pick-close]')) {
      open.close();
      return;
    }

    var pill = target.closest('.size-pill');
    if (!pill || pill.disabled) return;
    var add = open.querySelector('[data-add-to-cart]');
    if (!add || add.disabled) return;

    // Close first: closing hands focus back to the card's button, and cart.js
    // remembers whatever has focus when the drawer opens as the place to return
    // to when the drawer closes.
    open.close();
    add.click();
  });
})();
