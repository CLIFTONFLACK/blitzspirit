/* ============================================================
   cart.js — SYSTEM_LEDGER drawer (workstream A: commerce chrome)

   Contract (docs/CONTRACTS.md §5):
   - Intercepts submits of any form[action*="/cart/add"] →
     POST /cart/add.js with `sections: 'cart-drawer,<masthead id>'`
     (Section Rendering API; the drawer id is its file name because
     it is statically rendered, the masthead id is read from its
     [data-section-id] at runtime), swaps the returned HTML into
     #CartDrawer, updates [data-cart-count], opens the drawer.
   - Drawer hooks: #CartDrawer, [data-cart-overlay], [data-cart-close],
     [data-cart-toggle], [data-cart-count], [data-cart-items],
     [data-cart-subtotal]. Open state = `.open` + aria-hidden flip
     (plus `inert` so the closed offscreen drawer is unfocusable).
   - Qty steppers [data-qty-change][data-line-key] and remove buttons
     [data-remove][data-line-key] → POST /cart/change.js with the
     same sections re-render.
   - Errors (e.g. sold out): Shopify's `description` shown in
     [data-cart-error].
   - Money strings stay server-formatted Liquid — never built here.
   - No-JS: forms post natively to /cart/add and the /cart page.
   ============================================================ */
(function () {
  'use strict';

  const DRAWER_SECTION = 'cart-drawer';
  const ROOT = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  let lastFocus = null;
  let busy = false;

  const getDrawer = () => document.getElementById('CartDrawer');
  const getOverlay = () => document.querySelector('[data-cart-overlay]');
  const isOpen = () => {
    const d = getDrawer();
    return !!d && d.classList.contains('open');
  };

  /* ---- Section Rendering API ids ------------------------------ */

  function sectionIds() {
    const ids = [DRAWER_SECTION];
    const masthead = document.querySelector('.masthead[data-section-id]');
    const mhId = masthead && masthead.getAttribute('data-section-id');
    if (mhId && !ids.includes(mhId)) ids.push(mhId);
    return ids.join(',');
  }

  /* ---- open / close -------------------------------------------- */

  function setToggles(expanded) {
    document.querySelectorAll('[data-cart-toggle]').forEach((el) => {
      el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
  }

  function openDrawer() {
    const d = getDrawer();
    if (!d || isOpen()) return;
    const o = getOverlay();
    lastFocus = document.activeElement;
    d.inert = false;
    d.setAttribute('aria-hidden', 'false');
    if (o) {
      o.removeAttribute('hidden');
      requestAnimationFrame(() => o.classList.add('open'));
    }
    d.classList.add('open');
    document.body.classList.add('cart-open');
    setToggles(true);
    const target = d.querySelector('[data-cart-close]') || d;
    target.focus();
  }

  function closeDrawer() {
    const d = getDrawer();
    if (!d || !isOpen()) return;
    const o = getOverlay();
    if (d.contains(document.activeElement)) document.activeElement.blur();
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    d.inert = true;
    if (o) o.classList.remove('open');
    document.body.classList.remove('cart-open');
    setToggles(false);
    if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  /* ---- rendering ------------------------------------------------ */

  function setCount(value) {
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = value;
    });
  }

  function renderSections(sections) {
    if (!sections) return;
    const parser = new DOMParser();
    Object.keys(sections).forEach((id) => {
      if (!sections[id]) return;
      const doc = parser.parseFromString(sections[id], 'text/html');
      const freshDrawer = doc.getElementById('CartDrawer');
      if (freshDrawer) {
        const d = getDrawer();
        if (d) d.innerHTML = freshDrawer.innerHTML;
        return;
      }
      /* Masthead section: lift only the fresh count (keeps focus). */
      const freshCount = doc.querySelector('[data-cart-count]');
      if (freshCount) setCount(freshCount.textContent.trim());
    });
  }

  function showError(message) {
    const d = getDrawer();
    const region = d && d.querySelector('[data-cart-error]');
    if (!region) return;
    region.textContent = message;
    region.hidden = false;
  }

  function syncCount() {
    fetch(ROOT + 'cart.js', { headers: { Accept: 'application/json' } })
      .then((res) => res.json())
      .then((cart) => setCount(String(cart.item_count)))
      .catch(() => {});
  }

  function restoreFocus() {
    const d = getDrawer();
    if (!d || !isOpen()) return;
    if (!d.contains(document.activeElement)) {
      (d.querySelector('[data-cart-close]') || d).focus();
    }
  }

  /* ---- requests -------------------------------------------------- */

  function request(url, options) {
    return fetch(url, options).then((res) =>
      res.json().then((json) => ({ ok: res.ok, json }))
    );
  }

  function changeLine(key, quantity) {
    if (!key || busy) return;
    busy = true;
    const d = getDrawer();
    const items = d && d.querySelector('[data-cart-items]');
    if (items) items.setAttribute('aria-busy', 'true');
    request(ROOT + 'cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: key,
        quantity: quantity,
        sections: sectionIds(),
        sections_url: window.location.pathname + window.location.search
      })
    })
      .then(({ ok, json }) => {
        if (!ok) {
          showError(json.description || json.message || '');
          return;
        }
        renderSections(json.sections);
        if (typeof json.item_count === 'number') setCount(String(json.item_count));
        restoreFocus();
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: json } }));
      })
      .catch(() => {})
      .finally(() => {
        busy = false;
        const fresh = getDrawer() && getDrawer().querySelector('[data-cart-items]');
        if (fresh) fresh.removeAttribute('aria-busy');
      });
  }

  /* ---- add to bag ------------------------------------------------ */

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (e.defaultPrevented) return;
    const action = form.getAttribute('action') || '';
    if (!action.includes('/cart/add')) return;
    if (!getDrawer()) return; /* no drawer on page: keep native flow */

    e.preventDefault();
    if (busy) return;
    busy = true;

    const submitBtn = form.querySelector('[name="add"]') || form.querySelector('[type="submit"]');
    const wasDisabled = !!(submitBtn && submitBtn.disabled);
    if (submitBtn) {
      submitBtn.setAttribute('aria-busy', 'true');
      submitBtn.disabled = true;
    }

    const body = new FormData(form);
    body.append('sections', sectionIds());
    body.append('sections_url', window.location.pathname + window.location.search);

    request(ROOT + 'cart/add.js', {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: body
    })
      .then(({ ok, json }) => {
        if (!ok) {
          /* e.g. sold out / insufficient stock — Shopify sends a
             human-readable `description`. Surface it in the ledger. */
          openDrawer();
          showError(json.description || json.message || '');
          return;
        }
        renderSections(json.sections);
        const gotMasthead = Object.keys(json.sections || {}).some(
          (id) => id !== DRAWER_SECTION && json.sections[id]
        );
        if (!gotMasthead) syncCount();
        openDrawer();
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: { added: json } }));
      })
      .catch(() => {
        /* Network failure: fall back to the native POST (submit()
           bypasses this listener, so no loop). */
        form.submit();
      })
      .finally(() => {
        busy = false;
        if (submitBtn) {
          submitBtn.removeAttribute('aria-busy');
          submitBtn.disabled = wasDisabled;
        }
      });
  });

  /* ---- clicks: toggle / close / qty / remove --------------------- */

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    const toggle = t.closest('[data-cart-toggle]');
    if (toggle && getDrawer()) {
      e.preventDefault();
      if (isOpen()) closeDrawer();
      else openDrawer();
      return;
    }

    if (t.closest('[data-cart-close]')) {
      closeDrawer();
      return;
    }

    if (t.closest('[data-cart-overlay]')) {
      closeDrawer();
      return;
    }

    const qtyBtn = t.closest('[data-qty-change]');
    if (qtyBtn) {
      const row = qtyBtn.closest('[data-line-item]');
      const qtyEl = row && row.querySelector('[data-line-qty]');
      const current = qtyEl ? parseInt(qtyEl.textContent, 10) || 0 : 0;
      const delta = parseInt(qtyBtn.getAttribute('data-qty-change'), 10) || 0;
      changeLine(qtyBtn.getAttribute('data-line-key'), Math.max(0, current + delta));
      return;
    }

    const removeBtn = t.closest('[data-remove]');
    if (removeBtn) {
      e.preventDefault();
      changeLine(removeBtn.getAttribute('data-line-key'), 0);
    }
  });

  /* ---- keyboard: Escape + focus trap ----------------------------- */

  function focusables(container) {
    return Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.key !== 'Tab') return;
    const d = getDrawer();
    const items = focusables(d);
    if (!items.length) {
      e.preventDefault();
      d.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !d.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !d.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---- lifecycle -------------------------------------------------- */

  /* Belt-and-braces: enforce the closed state at load in case the
     markup ever ships without `inert`. */
  const d0 = getDrawer();
  if (d0 && !d0.classList.contains('open')) {
    d0.inert = true;
    d0.setAttribute('aria-hidden', 'true');
  }

  /* Stale count after bfcache restore. */
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) syncCount();
  });

  /* Theme editor: open the drawer while its section is selected. */
  document.addEventListener('shopify:section:select', (e) => {
    if (e.target && e.target.querySelector && e.target.querySelector('#CartDrawer')) openDrawer();
  });
  document.addEventListener('shopify:section:deselect', (e) => {
    if (e.target && e.target.querySelector && e.target.querySelector('#CartDrawer')) closeDrawer();
  });
})();
