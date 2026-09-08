/* ============================================================
   newsletter.js — email capture without a page reload

   Replaces Shopify's {% form 'customer' %} POST-and-reload cycle. Submits to
   /api/newsletter and swaps the form for the success block that ships beside
   it in the markup, then dispatches `newsletter:success` (bubbling) so
   modal.js can mark the visitor signed up and reveal the discount code.

   DOM contract (NewsletterForm.astro):
     form[data-newsletter-form]   the form itself, data-tags carries the list tags
     .nlf-error                   error line inside the form, [hidden] when clean
     [data-signup-success]        sibling success block, [hidden] until success
   ============================================================ */
(function () {
  'use strict';

  var ERROR_TEXT = 'COULD NOT SIGN YOU UP // TRY AGAIN';

  document.querySelectorAll('form[data-newsletter-form]').forEach(function (form) {
    var wrap = form.closest('.nlf');
    var success = wrap && wrap.querySelector('[data-signup-success]');
    var errorEl = form.querySelector('.nlf-error');
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = '[ ' + msg + ' ]';
      errorEl.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;

      if (!input || !input.value || !input.checkValidity()) {
        showError('ENTER A VALID EMAIL ADDRESS');
        if (input) input.focus();
        return;
      }

      if (button) button.disabled = true;

      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value, tags: form.dataset.tags || '' }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('signup failed: ' + res.status);
          return res.json();
        })
        .then(function () {
          form.hidden = true;
          if (success) {
            success.hidden = false;
            success.dispatchEvent(new CustomEvent('newsletter:success', { bubbles: true }));
          }
        })
        .catch(function () {
          showError(ERROR_TEXT);
        })
        .finally(function () {
          if (button) button.disabled = false;
        });
    });
  });
})();
