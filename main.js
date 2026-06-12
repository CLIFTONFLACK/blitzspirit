/* BlitzSpirit — shared interactivity
   Scroll reveals, mobile drawer, quick-add toasts, PDP options,
   newsletter + signup modal (lead gen). No dependencies. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- toast ---------- */
  var toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* ---------- cart count ---------- */
  function bumpCart() {
    document.querySelectorAll('.cart-count').forEach(function (c) {
      c.textContent = String((parseInt(c.textContent, 10) || 0) + 1);
    });
  }

  /* ---------- quick add / add to basket ---------- */
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.quick-add, [data-add-to-cart]');
    if (!btn) return;
    bumpCart();
    var card = btn.closest('.product-card');
    var name = card ? (card.querySelector('h3') || {}).textContent : document.querySelector('.pdp-info h1') && document.querySelector('.pdp-info h1').textContent;
    toast((name ? name.trim().toUpperCase() : 'ITEM') + ' — ADDED TO BASKET');
  });

  /* ---------- mobile drawer ---------- */
  var navToggle = document.querySelector('.nav-toggle');
  if (navToggle) {
    var backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    var drawer = document.createElement('nav');
    drawer.className = 'drawer';
    drawer.setAttribute('aria-label', 'Mobile navigation');
    var head = document.createElement('div');
    head.className = 'drawer-head';
    head.innerHTML = '<span class="logo-mark">blitzspirit</span>' +
      '<button class="drawer-close" type="button" aria-label="Close menu">&times;</button>';
    drawer.appendChild(head);
    document.querySelectorAll('.main-nav a').forEach(function (a) {
      drawer.appendChild(a.cloneNode(true));
    });
    var cta = document.createElement('a');
    cta.className = 'btn btn-primary drawer-cta';
    cta.href = 'collection.html';
    cta.textContent = 'Shop the collection';
    drawer.appendChild(cta);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    function openDrawer() { document.body.classList.add('drawer-open'); drawer.querySelector('a').focus(); }
    function closeDrawer() { document.body.classList.remove('drawer-open'); navToggle.focus(); }
    navToggle.addEventListener('click', openDrawer);
    backdrop.addEventListener('click', closeDrawer);
    head.querySelector('.drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer();
    });
  }

  /* ---------- PDP: gallery thumbs ---------- */
  var mainImg = document.querySelector('.gallery-main img');
  if (mainImg) {
    document.querySelectorAll('.thumb').forEach(function (t) {
      t.addEventListener('click', function () {
        var img = t.querySelector('img');
        if (!img) return;
        mainImg.src = img.getAttribute('src');
        mainImg.className = img.className;
        document.querySelectorAll('.thumb').forEach(function (x) { x.removeAttribute('aria-current'); });
        t.setAttribute('aria-current', 'true');
      });
    });
  }

  /* ---------- PDP: colour swatches swap image ---------- */
  var colourMap = { 'Black': 'assets/tee-boudica-black.jpg', 'Off white': 'assets/tee-boudica-offwhite.jpg' };
  document.querySelectorAll('.colour-opt').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.colour-opt').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      var label = b.getAttribute('aria-label');
      var hint = document.querySelector('#colour-label .hint');
      if (hint) hint.textContent = label;
      if (mainImg && colourMap[label]) { mainImg.src = colourMap[label]; mainImg.className = ''; }
    });
  });

  /* ---------- PDP: size pills ---------- */
  document.querySelectorAll('.size-opt:not([disabled])').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.size-opt').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
    });
  });

  /* ---------- PDP: quantity ---------- */
  var qty = document.querySelector('.qty');
  if (qty) {
    var input = qty.querySelector('input');
    qty.querySelectorAll('button').forEach(function (b, i) {
      b.addEventListener('click', function () {
        var v = parseInt(input.value, 10) || 1;
        input.value = Math.max(1, i === 0 ? v - 1 : v + 1);
      });
    });
  }

  /* ---------- newsletter forms (any page) ---------- */
  document.querySelectorAll('form[data-newsletter]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = f.querySelector('input[type="email"]');
      if (!email || !email.value) return;
      try { localStorage.setItem('bs_signed_up', '1'); } catch (err) {}
      f.innerHTML = '<p class="signup-success" style="width:100%">WELCOME TO THE HOME GUARD.<br>' +
        'Your 10&#37; code: <span class="code">BACKBONE10</span></p>';
      toast('SIGNED UP — CODE BACKBONE10');
    });
  });

  /* ---------- signup modal (lead gen) ---------- */
  var SUPPRESS_DAYS = 7;
  function modalSuppressed() {
    try {
      if (localStorage.getItem('bs_signed_up')) return true;
      var t = parseInt(localStorage.getItem('bs_modal_seen') || '0', 10);
      return Date.now() - t < SUPPRESS_DAYS * 864e5;
    } catch (err) { return true; }
  }
  function markModalSeen() {
    try { localStorage.setItem('bs_modal_seen', String(Date.now())); } catch (err) {}
  }

  var dlg = document.createElement('dialog');
  dlg.className = 'signup-modal';
  dlg.innerHTML =
    '<div class="signup-inner">' +
      '<span class="frame-tick tl" aria-hidden="true"></span><span class="frame-tick br" aria-hidden="true"></span>' +
      '<button class="modal-close" type="button" aria-label="Close">&times;</button>' +
      '<p class="eyebrow">Conscription Office</p>' +
      '<h2>Join the Home Guard.<br>Take <span class="red">10&#37; off</span> your first order.</h2>' +
      '<p>First word on new drops and restocks, stories worth telling, and a code for 10&#37; off. No spam &mdash; that would be nonsense.</p>' +
      '<form data-newsletter>' +
        '<label for="modal-email">Email address</label>' +
        '<input id="modal-email" type="email" name="email" placeholder="YOUR@EMAIL.CO.UK" required>' +
        '<button class="btn btn-primary btn-block" type="submit">Sign me up</button>' +
      '</form>' +
      '<button class="no-thanks" type="button">No thanks &mdash; I&rsquo;ll pay full price</button>' +
    '</div>';
  document.body.appendChild(dlg);

  function openModal() {
    if (!dlg.open && typeof dlg.showModal === 'function') { dlg.showModal(); markModalSeen(); }
  }
  function closeModal() { if (dlg.open) dlg.close(); }
  dlg.querySelector('.modal-close').addEventListener('click', closeModal);
  dlg.querySelector('.no-thanks').addEventListener('click', closeModal);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeModal(); });
  dlg.querySelector('form[data-newsletter]').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = dlg.querySelector('input[type="email"]');
    if (!email.value) return;
    try { localStorage.setItem('bs_signed_up', '1'); } catch (err) {}
    dlg.querySelector('.signup-inner').innerHTML =
      '<span class="frame-tick tl" aria-hidden="true"></span><span class="frame-tick br" aria-hidden="true"></span>' +
      '<div class="signup-success">' +
        '<p class="eyebrow">Orders received</p>' +
        '<h2>Welcome to the Home Guard.</h2>' +
        '<p>Your 10&#37; code, soldier:</p>' +
        '<span class="code">BACKBONE10</span><br><br>' +
        '<button class="btn btn-primary" type="button" data-close>Carry on shopping</button>' +
      '</div>';
    dlg.querySelector('[data-close]').addEventListener('click', closeModal);
  });

  /* explicit triggers (waitlist tiles, links) */
  document.querySelectorAll('[data-open-signup]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
  });

  /* timed + exit-intent triggers, suppressed after seen/signup */
  if (!modalSuppressed()) {
    var timer = setTimeout(openModal, 16000);
    document.addEventListener('mouseout', function onExit(e) {
      if (!e.relatedTarget && e.clientY <= 0) {
        clearTimeout(timer);
        document.removeEventListener('mouseout', onExit);
        openModal();
      }
    });
  }
})();
