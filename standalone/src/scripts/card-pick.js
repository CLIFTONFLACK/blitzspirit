/* ============================================================
   card-pick.js — the size picker behind a product card's [ ADD TO CART ]

   Contract (ProductCard.astro):
   - [data-card-pick] opens and closes the <product-form class="coll-pick">
     its aria-controls names, and keeps its own aria-expanded in step. Only
     one picker is open at a time; a click anywhere outside the open picker
     and its button closes it.
   - A tap on a size pill inside that picker is the add. By the time this
     document-level handler runs, product-form.js (which listens on the pill
     group, nearer the target) has already written the matching variant id
     into the picker's hidden input. This then presses the picker's hidden
     [data-add-to-cart], which cart.js handles like any other add button, so
     the bag logic lives in one place.
   - A colour pill only changes the selection (and the card photo); it never
     adds. Escape closes an open picker and returns focus to its button.
   ============================================================ */
(function () {
  'use strict';

  function toggleFor(panel) {
    return document.querySelector('[data-card-pick][aria-controls="' + panel.id + '"]');
  }

  function setOpen(panel, open) {
    panel.hidden = !open;
    var toggle = toggleFor(panel);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (!open) {
      // Leave no size looking chosen: the next open starts from a clean slate.
      panel.querySelectorAll('.size-pill[aria-pressed="true"]').forEach(function (pill) {
        pill.setAttribute('aria-pressed', 'false');
      });
    }
  }

  function closeAll(except) {
    document.querySelectorAll('.coll-pick:not([hidden])').forEach(function (panel) {
      if (panel !== except) setOpen(panel, false);
    });
  }

  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    var toggle = target.closest('[data-card-pick]');
    if (toggle) {
      var panel = document.getElementById(toggle.getAttribute('aria-controls'));
      if (!panel) return;
      var open = panel.hidden;
      closeAll(panel);
      setOpen(panel, open);
      if (open) {
        var first = panel.querySelector('.size-pill:not([disabled])');
        if (first) first.focus();
      }
      return;
    }

    var picker = target.closest('.coll-pick');
    if (!picker) {
      // Not the hidden add button's own synthetic click (it is inside a picker),
      // so this is a click elsewhere on the page.
      closeAll(null);
      return;
    }

    var pill = target.closest('.size-pill');
    if (!pill || pill.disabled) return;
    var add = picker.querySelector('[data-add-to-cart]');
    if (!add || add.disabled) return;

    // Focus goes back to the card's button BEFORE the add: hiding the picker
    // would otherwise drop it to <body>, and cart.js remembers whatever has
    // focus when the drawer opens as the place to return to when it closes.
    var owner = toggleFor(picker);
    if (owner) owner.focus();
    add.click();
    setOpen(picker, false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    var picker = target.closest('.coll-pick');
    var toggle = target.closest('[data-card-pick]');
    if (!picker && toggle) picker = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!picker || picker.hidden) return;
    setOpen(picker, false);
    var owner = toggleFor(picker);
    if (owner) owner.focus();
  });
})();
