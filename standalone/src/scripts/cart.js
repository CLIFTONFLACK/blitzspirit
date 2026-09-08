/* ============================================================
   cart.js — SYSTEM_LEDGER drawer

   Ported from the Shopify theme. The drawer's open/close behaviour, focus trap,
   keyboard handling and DOM hooks are unchanged; what changed is where the cart
   lives.

   WAS: every mutation POSTed to /cart/add.js or /cart/change.js, and Shopify's
   Section Rendering API returned fresh HTML that got swapped into #CartDrawer.
   NOW: the cart is an array in localStorage and this file renders the rows, using
   a stripped product index fetched once from /cart-index.json. Checkout POSTs the
   lines to /api/checkout, which re-prices them server-side and returns a Stripe
   Checkout Session URL.

   Hooks (unchanged): #CartDrawer, [data-cart-overlay], [data-cart-close],
   [data-cart-toggle], [data-cart-count], [data-cart-items], [data-cart-subtotal],
   [data-cart-error], [data-cart-fsb], [data-qty-change][data-line-key],
   [data-remove][data-line-key], [data-line-qty], [data-checkout].
   Adding: [data-add-to-cart] anywhere on the page.
   Open state = `.open` + aria-hidden flip + `inert`.
   Event: `cart:updated` on document, as before.

   The line key is the variant id, so a line is uniquely identified without the
   server-issued keys Shopify used to hand out.
   ============================================================ */
import { formatMoney } from '../lib/money';

(function () {
  'use strict';

  const STORAGE_KEY = 'bs_cart';
  // The index ships with this site, so it sits under the deployment base.
  const BASE = import.meta.env.BASE_URL;
  const INDEX_URL = BASE.replace(/\/$/, '') + '/cart-index.json';
  // The serverless functions belong to the ROOT Vercel project, outside this base.
  const CHECKOUT_URL = '/api/checkout';

  let lastFocus = null;
  let busy = false;
  let index = null; // { variantId: { title, url, price, available, options, thumb } }

  const getDrawer = () => document.getElementById('CartDrawer');
  const getOverlay = () => document.querySelector('[data-cart-overlay]');
  const isOpen = () => {
    const d = getDrawer();
    return !!d && d.classList.contains('open');
  };

  /* ---- state ---------------------------------------------------- */

  /* Storage can throw outright (private mode, blocked site data), so every read
     and write is guarded and an unreadable cart is treated as an empty one. */
  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (line) => line && typeof line.id === 'string' && Number.isInteger(line.quantity) && line.quantity > 0
      );
    } catch (err) {
      return [];
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* Cart still works for this page view; it just will not survive a reload. */
    }
  }

  let state = readState();

  const itemCount = () => state.reduce((n, line) => n + line.quantity, 0);

  function subtotal() {
    if (!index) return 0;
    return state.reduce((total, line) => {
      const item = index[line.id];
      return item ? total + item.price * line.quantity : total;
    }, 0);
  }

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch(INDEX_URL, { headers: { Accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error('cart index ' + res.status);
        return res.json();
      })
      .then((json) => {
        index = json.variants;
        // Drop any line whose variant no longer exists (catalogue changed under a
        // stored cart) rather than rendering a blank row.
        const before = state.length;
        state = state.filter((line) => !!index[line.id]);
        if (state.length !== before) writeState(state);
        return index;
      });
  }

  /* ---- open / close --------------------------------------------- */

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
      el.textContent = String(value);
    });
  }

  function showError(message) {
    const region = document.querySelector('[data-cart-error]');
    if (!region) return;
    region.textContent = message;
    region.hidden = !message;
  }

  function lineMarkup(line, item) {
    const meta = item.options.map((o) => o.name.toUpperCase() + ': ' + o.value.toUpperCase()).join(' / ');
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.setAttribute('data-line-item', '');
    row.setAttribute('data-line-key', line.id);

    const plate = document.createElement('a');
    plate.className = 'ci-plate';
    plate.href = item.url;
    plate.tabIndex = -1;
    plate.setAttribute('aria-hidden', 'true');
    if (item.thumb) {
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = '';
      img.width = 128;
      img.loading = 'lazy';
      plate.appendChild(img);
    }

    const body = document.createElement('div');
    body.className = 'ci-body';

    const name = document.createElement('div');
    name.className = 'ci-name';
    const nameLink = document.createElement('a');
    nameLink.href = item.url;
    nameLink.textContent = item.title;
    name.appendChild(nameLink);
    body.appendChild(name);

    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'ci-meta';
      metaEl.textContent = meta;
      body.appendChild(metaEl);
    }

    const controls = document.createElement('div');
    controls.className = 'ci-controls';

    const qty = document.createElement('div');
    qty.className = 'ci-qty';
    qty.innerHTML =
      '<button type="button" class="ci-qty-btn snap" data-qty-change="-1" data-line-key="' +
      line.id +
      '" aria-label="QTY -1">−</button>' +
      '<span class="ci-qty-val" data-line-qty>' +
      line.quantity +
      '</span>' +
      '<button type="button" class="ci-qty-btn snap" data-qty-change="1" data-line-key="' +
      line.id +
      '" aria-label="QTY +1">+</button>';
    controls.appendChild(qty);

    const price = document.createElement('span');
    price.className = 'ci-price';
    price.innerHTML =
      '<span class="price"><span class="price__current">' +
      formatMoney(item.price * line.quantity) +
      '</span></span>';
    controls.appendChild(price);

    body.appendChild(controls);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ci-rm snap';
    remove.setAttribute('data-remove', '');
    remove.setAttribute('data-line-key', line.id);
    remove.textContent = '[ REMOVE ]';

    row.appendChild(plate);
    row.appendChild(body);
    row.appendChild(remove);
    return row;
  }

  function renderFreeShipping(total) {
    const bar = document.querySelector('[data-cart-fsb]');
    if (!bar) return;
    const threshold = parseInt(bar.getAttribute('data-threshold'), 10);
    if (!threshold) return;
    const remaining = threshold - total;
    const pct = total >= threshold ? 100 : Math.floor((total * 100) / threshold);
    bar.style.setProperty('--fsb-pct', pct + '%');
    const msg = bar.querySelector('[data-fsb-msg]');
    if (!msg) return;
    if (remaining > 0) {
      msg.classList.remove('fsb-msg--ok');
      msg.textContent = '[ ' + formatMoney(remaining) + ' MORE FOR FREE UK DELIVERY ]';
    } else {
      msg.classList.add('fsb-msg--ok');
      msg.textContent = '[ SHIPS FREE // WELL DONE ]';
    }
  }

  function render() {
    setCount(itemCount());

    const items = document.querySelector('[data-cart-items]');
    if (items) {
      items.textContent = '';
      if (!state.length || !index) {
        const empty = document.createElement('div');
        empty.className = 'cart-empty';
        empty.textContent = '[ LEDGER EMPTY // NO ASSETS ALLOCATED ]';
        items.appendChild(empty);
      } else {
        state.forEach((line) => {
          const item = index[line.id];
          if (item) items.appendChild(lineMarkup(line, item));
        });
      }
    }

    const total = subtotal();
    document.querySelectorAll('[data-cart-subtotal]').forEach((el) => {
      el.textContent = formatMoney(total);
    });
    renderFreeShipping(total);

    document.querySelectorAll('[data-checkout]').forEach((btn) => {
      btn.disabled = state.length === 0;
    });

    document.dispatchEvent(
      new CustomEvent('cart:updated', { detail: { lines: state.slice(), subtotal: total } })
    );
  }

  function commit() {
    writeState(state);
    render();
  }

  /* ---- mutations ------------------------------------------------ */

  function addLine(variantId, quantity) {
    const existing = state.find((line) => line.id === variantId);
    if (existing) existing.quantity += quantity;
    else state.push({ id: variantId, quantity: quantity });
    commit();
  }

  function changeLine(variantId, quantity) {
    if (quantity <= 0) state = state.filter((line) => line.id !== variantId);
    else {
      const existing = state.find((line) => line.id === variantId);
      if (existing) existing.quantity = quantity;
    }
    commit();
  }

  /* ---- checkout -------------------------------------------------- */

  function checkout() {
    if (busy || !state.length) return;
    busy = true;
    showError('');
    document.querySelectorAll('[data-checkout]').forEach((btn) => {
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    });

    fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: state }),
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || !json.url) throw new Error(json.error || 'no checkout url');
        window.location.assign(json.url);
      })
      .catch(() => {
        openDrawer();
        showError('CHECKOUT UNREACHABLE // TRY AGAIN');
      })
      .finally(() => {
        busy = false;
        document.querySelectorAll('[data-checkout]').forEach((btn) => {
          btn.removeAttribute('aria-busy');
          btn.disabled = state.length === 0;
        });
      });
  }

  /* ---- clicks ---------------------------------------------------- */

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    const addBtn = t.closest('[data-add-to-cart]');
    if (addBtn) {
      e.preventDefault();
      if (addBtn.disabled) return;

      /* The variant id comes from the scoped hidden input product-form.js keeps in
         sync; a button that stands alone (quick-add on a card) carries its own. */
      const scope = addBtn.closest('[data-product-wrap]');
      const idInput = scope && scope.querySelector('input[name="id"]');
      const variantId = addBtn.getAttribute('data-variant-id') || (idInput && idInput.value);
      if (!variantId) return;

      const qtyInput = scope && scope.querySelector('input[name="quantity"]');
      const quantity = Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1);

      addBtn.setAttribute('aria-busy', 'true');
      loadIndex()
        .then(() => {
          if (!index[variantId]) throw new Error('unknown variant ' + variantId);
          addLine(variantId, quantity);
          openDrawer();
        })
        .catch(() => {
          openDrawer();
          showError('COULD NOT ADD TO BAG // TRY AGAIN');
        })
        .finally(() => addBtn.removeAttribute('aria-busy'));
      return;
    }

    const toggle = t.closest('[data-cart-toggle]');
    if (toggle && getDrawer()) {
      e.preventDefault();
      if (isOpen()) closeDrawer();
      else openDrawer();
      return;
    }

    if (t.closest('[data-cart-close]') || t.closest('[data-cart-overlay]')) {
      closeDrawer();
      return;
    }

    if (t.closest('[data-checkout]')) {
      e.preventDefault();
      checkout();
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

  const d0 = getDrawer();
  if (d0 && !d0.classList.contains('open')) {
    d0.inert = true;
    d0.setAttribute('aria-hidden', 'true');
  }

  /* Paint the stored count immediately, then fill in the rows once the index
     lands - the badge should not sit at 0 while the fetch is in flight. */
  setCount(itemCount());
  if (state.length) {
    loadIndex().then(render).catch(() => {});
  } else {
    render();
  }

  /* Another tab changed the cart. */
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = readState();
    if (index) render();
    else setCount(itemCount());
  });

  /* Returning via bfcache, or back from an abandoned Stripe session. */
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    state = readState();
    if (index) render();
    else setCount(itemCount());
  });
})();
