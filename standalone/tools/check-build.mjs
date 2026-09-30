/**
 * check-build — assert the built HTML actually contains the shop, not just 200s.
 *
 * Written because a status code proves nothing on a static host: a catch-all or a
 * stray 404 page still returns 200, and an unstyled or empty page is invisible to a
 * naive check. Every assertion below names content only a correctly rendered page can
 * have, and each has been negative-tested by deleting the thing it looks for.
 *
 *   node tools/check-build.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Both arguments are optional and default to the shop (dist/, base '').
const dist = join(root, process.argv[2] ?? 'dist');

const catalogue = JSON.parse(readFileSync(join(root, 'src/data/catalogue.json'), 'utf8'));
const collections = JSON.parse(readFileSync(join(root, 'src/data/collections.json'), 'utf8'));

// The site is served from a sub-path. dist/ is still the site root on disk - Astro
// does not nest the output under `base` - but every URL it emits must carry it, or
// the page will reach for the OLD site's files when this is dropped into /new/.
const BASE = (
  process.argv[3] ??
  (readFileSync(join(root, 'astro.config.mjs'), 'utf8').match(/base:\s*'([^']+)'/) ?? [, ''])[1]
).replace(/\/$/, '');
const url = (path) => BASE + path;

const failures = [];
const fail = (page, msg) => failures.push(`${page}: ${msg}`);

function html(route) {
  const file = route === '/404' ? join(dist, '404.html') : join(dist, route, 'index.html');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

/** Every page must carry the chrome, or the layout silently dropped out. */
const CHROME = [
  ['masthead', 'class="masthead"'],
  ['cart drawer', 'id="CartDrawer"'],
  ['footer', 'class="footer"'],
  ['stylesheet link', '<link rel="stylesheet"'],
  ['canonical', 'rel="canonical"'],
  ['font preload', 'chunkfive.woff2'],
];

const routes = [
  '',
  '/story',
  '/help',
  '/contact',
  '/icons',
  '/link-in-bio',
  '/terms',
  '/privacy',
  '/cart',
  '/404',
  '/checkout/success',
  '/checkout/cancelled',
  ...Object.keys(collections).map((h) => `/collections/${h}`),
  ...catalogue.products.map((p) => `/products/${p.handle}`),
];

for (const route of routes) {
  const doc = html(route || '/');
  const name = route || '/';
  if (!doc) {
    fail(name, 'page was not built');
    continue;
  }
  for (const [label, needle] of CHROME) {
    if (!doc.includes(needle)) fail(name, `missing ${label}`);
  }
  // A page whose <main> is empty rendered its layout and nothing else.
  const main = doc.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!main) fail(name, 'no <main> element');
  else if (main[1].replace(/<[^>]+>/g, '').trim().length < 40) {
    fail(name, '<main> has almost no text');
  }
}

/** Product pages: the real copy, the real price, a picker, and a buy button. */
for (const product of catalogue.products) {
  const route = `/products/${product.handle}`;
  const doc = html(route);
  if (!doc) continue;

  const priceText = '£' + (product.price / 100).toFixed(2);
  if (!doc.includes(priceText)) fail(route, `price ${priceText} not rendered`);

  // The dossier's first sentence, stripped of bold markers - proves the copy landed,
  // not just the title.
  const lead = product.dossier[0].replace(/\*\*/g, '').slice(0, 40);
  if (!doc.includes(lead)) fail(route, 'dossier copy missing');

  if (!doc.includes('data-add-to-cart')) fail(route, 'no add-to-cart button');
  if (!doc.includes('data-variant-json')) fail(route, 'no variant JSON');

  // Every colourway that has more than one option value must render a pill.
  const colour = product.options.find((o) => o.name === 'Colour');
  if (colour && colour.values.length > 1) {
    for (const { value } of colour.values) {
      if (!doc.includes(`data-value="${value}"`)) fail(route, `no pill for colour ${value}`);
    }
  }

  // Images must be the processed ones, not raw source paths.
  if (doc.includes('/src/assets/')) fail(route, 'unprocessed /src/assets/ path in output');
  if (!/_astro\/[^"]+\.(webp|avif|png|jpg)/.test(doc)) fail(route, 'no optimised image');

  // Field manual rows belong on the archive/editorial surfaces, but the technical
  // spec values must appear somewhere on the product's own page.
  if (!doc.includes(product.issue)) fail(route, `issue ${product.issue} not shown`);
}

/** Collection pages list exactly their products, and nothing else's. */
for (const [handle, collection] of Object.entries(collections)) {
  const route = `/collections/${handle}`;
  const doc = html(route);
  if (!doc) continue;
  for (const productHandle of collection.products) {
    if (!doc.includes(url(`/products/${productHandle}`))) {
      fail(route, `does not link to ${productHandle}`);
    }
  }
  // The collection template also carries a featured-product band below the grid
  // (it features The Establishment on every collection page), so only the grid
  // itself is required to be exclusive: the slice stops where that band starts.
  const gridStart = doc.indexOf('class="coll-grid-wrap"');
  const featuredStart = gridStart === -1 ? -1 : doc.indexOf('<section class="featured"', gridStart);
  const grid =
    gridStart === -1 ? doc : doc.slice(gridStart, featuredStart === -1 ? undefined : featuredStart);
  if (gridStart === -1) fail(route, 'no product grid rendered');
  const strays = catalogue.products
    .map((p) => p.handle)
    .filter((h) => !collection.products.includes(h))
    .filter((h) => grid.includes(`href="${url(`/products/${h}`)}"`));
  if (strays.length) fail(route, `grid links to products not in the collection: ${strays.join(', ')}`);
}

/** Homepage-only product carousel (CollectionGrid's `carousel` prop, ≤860px):
 *  a data-carousel wrapper around a data-carousel-track, one dot per catalogue
 *  product with only the first marked aria-current, a labelled pause/resume
 *  toggle rendering both icon states, and the carousel script inlined. Astro
 *  only emits that script inside {isCarousel && (...)}, so it - and all the
 *  markup above - must not leak onto collection pages or anywhere else that
 *  renders CollectionGrid without the prop. */
const CAROUSEL_SCRIPT_FINGERPRINT = '"[data-carousel]"'; // a querySelectorAll selector string in carousel.js - a literal, so unlike a var/function name it survives minification

if (catalogue.products.length > 1) {
  const home = html('/');
  if (home) {
    if (!/<div class="coll-grid-wrap[^"]*"\s+data-carousel(?:\s|>)/.test(home)) {
      fail('/', 'no data-carousel wrapper on the homepage grid');
    }
    // Matched inside a tag: the inlined script also contains "[data-carousel-track]",
    // so a bare includes() would pass with the attribute gone from the markup.
    if (!/<div[^>]*\sdata-carousel-track(?:\s|=|>)/.test(home)) {
      fail('/', 'no data-carousel-track on the homepage grid');
    }

    const dots = home.match(/<button[^>]*\bdata-carousel-dot\b[^>]*>/g) ?? [];
    if (dots.length !== catalogue.products.length) {
      fail('/', `expected ${catalogue.products.length} carousel dots, found ${dots.length}`);
    }
    const current = dots.filter((d) => d.includes('aria-current="true"'));
    if (current.length !== 1) fail('/', `expected exactly one aria-current dot, found ${current.length}`);
    if (dots.length && current[0] !== dots[0]) fail('/', 'aria-current is not on the first dot');

    const toggle = home.match(/<button[^>]*\bdata-carousel-toggle\b[^>]*>/);
    if (!toggle) fail('/', 'no data-carousel-toggle button');
    else if (!/aria-label="[^"]+"/.test(toggle[0])) fail('/', 'carousel toggle has no aria-label');

    if (!home.includes('coll-carousel-icon--pause') || !home.includes('M8 4.5v15M16 4.5v15')) {
      fail('/', "carousel toggle's pause icon did not render");
    }

    if (!home.includes(CAROUSEL_SCRIPT_FINGERPRINT)) fail('/', 'carousel script not inlined on the homepage');

    // modalOpen() in carousel.js holds the carousel still while a card's size picker
    // is open. Its selector 'dialog[open]' is a string literal, so it survives
    // minification where the function name does not; without it the card is scrolled
    // out from under the visitor mid-choice.
    if (!home.includes('dialog[open]')) fail('/', 'carousel script has no dialog[open] check (it would advance under an open size picker)');
  }

  for (const route of routes) {
    const name = route || '/';
    if (name === '/') continue; // the carousel is homepage-only
    const doc = html(route || '/');
    if (!doc) continue;
    if (doc.includes('data-carousel')) fail(name, 'carousel markup leaked onto a non-homepage route');
    if (doc.includes(CAROUSEL_SCRIPT_FINGERPRINT)) fail(name, 'carousel script leaked onto a non-homepage route');
  }
}

/** The help page anchors the footer links into must exist. */
const help = html('/help');
if (help) {
  for (const anchor of ['size-guide', 'returns']) {
    if (!help.includes(`id="${anchor}"`)) fail('/help', `missing anchor #${anchor}`);
  }
}

/** No Liquid or Shopify residue anywhere in the output. */
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  // HTML comments would be shipped to the browser, so they are checked too - but as
  // their own failure, since an unrendered {% %} is a different bug from a stray note.
  if (doc.includes('<!--')) fail(route || '/', 'HTML comment shipped to the browser');
  for (const residue of ['{{', '{%', 'shopify://', 'cdn.shopify.com', '/cart/add.js']) {
    if (doc.includes(residue)) fail(route || '/', `Shopify/Liquid residue: ${residue}`);
  }
}

/** Every URL the page requests must sit under the deployment base.
 *  A single unprefixed /assets/... or /_astro/... would resolve against the OLD
 *  site at the domain root and silently 404 - the exact failure that leaves a page
 *  rendering as unstyled Times New Roman. */
if (BASE) {
  for (const route of routes) {
    const doc = html(route || '/');
    if (!doc) continue;
    const attrs = [...doc.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
    const stray = [...new Set(attrs)].filter((p) => !p.startsWith(BASE + '/') && p !== BASE);
    if (stray.length) {
      fail(route || '/', `paths outside the base ${BASE}: ${stray.slice(0, 4).join(', ')}`);
    }
  }
}

/** The Open Graph image must be a file that actually shipped. A share card that
 *  404s is invisible until someone posts a link, which is the worst time to find out. */
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  const og = doc.match(/<meta property="og:image" content="([^"]+)"/);
  if (!og) {
    fail(route || '/', 'no og:image');
    continue;
  }
  let path;
  try {
    path = new URL(og[1]).pathname;
  } catch {
    fail(route || '/', `og:image is not an absolute URL: ${og[1]}`);
    continue;
  }
  if (BASE && !path.startsWith(BASE + '/')) {
    fail(route || '/', `og:image outside the base: ${path}`);
    continue;
  }
  const onDisk = join(dist, path.slice(BASE.length));
  if (!existsSync(onDisk)) fail(route || '/', `og:image not in the build: ${path}`);
}

/** The cart index the drawer depends on must exist and cover every variant. */
const indexFile = join(dist, 'cart-index.json');
if (!existsSync(indexFile)) {
  fail('/cart-index.json', 'not built');
} else {
  const index = JSON.parse(readFileSync(indexFile, 'utf8'));
  for (const product of catalogue.products) {
    for (const variant of product.variants) {
      const entry = index.variants[variant.id];
      if (!entry) fail('/cart-index.json', `missing variant ${variant.id}`);
      else if (entry.price !== variant.price) {
        fail('/cart-index.json', `price mismatch on ${variant.id}`);
      } else if (!entry.thumb) {
        fail('/cart-index.json', `no thumbnail for ${variant.id}`);
      }
    }
  }
}

/** No unfinished or false copy may reach customers.
 *  Scanned as TEXT, not raw HTML: inline <script>/<style>/comments are stripped and
 *  tags removed, so the inlined variant JSON and bundled JS cannot trip a phrase, and
 *  class names/URLs (a "restock" CSS hook) that nobody reads cannot either. Attributes
 *  customers or search results do see (alt, title, aria-label, placeholder, meta
 *  content) are appended so copy hidden there is still caught. Bare "48 hours" is NOT
 *  banned: /help legitimately promises subscribers 48 hours before anyone else. */
const BANNED_COPY = [
  '[PLACEHOLDER', 'VIDEO ASSET PENDING', 'LEDGER EMPTY', 'NO ASSETS ALLOCATED', 'SECURITY OVERRIDE',
  '220gsm', 'heavyweight', 'screen print', 'Made in Britain', 'Gildan', 'small runs', 'restock',
  'dispatch within 48 hours', '2–4 working days', '2-4 working days', '2 to 4 working days',
  '2–5 working days',
];
const visibleText = (doc) => {
  const noScript = doc.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const text = noScript
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const attrs = [...noScript.matchAll(/\s(?:alt|title|aria-label|placeholder|content)="([^"]*)"/g)].map(
    (m) => m[1],
  );
  return (text + ' ' + attrs.join(' ')).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').toLowerCase();
};
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  const text = visibleText(doc);
  for (const phrase of BANNED_COPY) {
    if (text.includes(phrase.toLowerCase())) fail(route || '/', `banned copy shipped: "${phrase}"`);
  }
  // The label is ADD TO CART site-wide; a leftover BUY NOW is a string that was missed.
  if (text.includes('buy now')) fail(route || '/', 'old label shipped: "BUY NOW"');
}

/** cart.js strings are shown to customers at runtime (drawer states) but live in the
 *  bundle, not the HTML, so scan the built JS for the placeholder/false-claim strings. */
const astroDir = join(dist, '_astro');
const bundles = existsSync(astroDir) ? readdirSync(astroDir).filter((f) => f.endsWith('.js')) : [];
if (!bundles.length) fail('/_astro', 'no JS bundles found to scan');
for (const file of bundles) {
  const js = readFileSync(join(astroDir, file), 'utf8').toLowerCase();
  for (const phrase of ['LEDGER EMPTY', 'NO ASSETS ALLOCATED', 'SHIPS FREE', 'CHECKOUT UNREACHABLE']) {
    if (js.includes(phrase.toLowerCase())) fail(`/_astro/${file}`, `banned runtime copy: "${phrase}"`);
  }
}

/** card-pick.js must be shipped, or [ ADD TO CART ] does nothing. The selector string
 *  '[data-card-pick]' is a literal inside it, so unlike a variable or function name it
 *  survives minification. */
if (!bundles.some((f) => readFileSync(join(astroDir, f), 'utf8').includes('data-card-pick'))) {
  fail('/_astro', 'no JS bundle contains data-card-pick (card-pick.js not shipped)');
}

/** settings.json feeds the Stripe shipping label (api/_order.js), which never appears
 *  in built HTML, so the source data is checked directly. */
const settings = JSON.parse(readFileSync(join(root, 'src/data/settings.json'), 'utf8'));
const shipLabel = settings.shipping?.ukStandardLabel ?? '';
if (!shipLabel.includes('5-10')) fail('settings.json', `shipping.ukStandardLabel lacks "5-10": ${shipLabel}`);
if (shipLabel.includes('2-4')) fail('settings.json', `shipping.ukStandardLabel still says "2-4": ${shipLabel}`);
if (typeof settings.fulfilment?.note !== 'string' || !settings.fulfilment.note.trim()) {
  fail('settings.json', 'fulfilment.note missing or empty');
}
for (const [key, value] of Object.entries({ ...settings.shipping, ...settings.fulfilment, ...settings.cart })) {
  if (typeof value !== 'string') continue;
  for (const phrase of BANNED_COPY) {
    if (value.toLowerCase().includes(phrase.toLowerCase())) {
      fail('settings.json', `${key} contains banned copy "${phrase}"`);
    }
  }
}

/** Every page carries the main menu: links to the four sections, a home link, and a
 *  toggle whose aria-controls points at an id that exists (else mobile has no menu). */
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  const name = route || '/';
  const start = doc.indexOf('<header class="masthead"');
  const head = start === -1 ? '' : doc.slice(start, doc.indexOf('</header>', start));
  if (!head) {
    fail(name, 'no <header class="masthead"> to check the menu in');
    continue;
  }
  for (const path of ['/collections/all', '/icons', '/story', '/help']) {
    if (!head.includes(`href="${url(path)}"`)) fail(name, `masthead has no link to ${path}`);
  }
  if (!head.includes(`href="${url('/')}"`)) fail(name, 'masthead has no home link');
  const toggle = head.match(/<button[^>]*\bdata-nav-toggle\b[^>]*>/);
  if (!toggle) fail(name, 'masthead has no data-nav-toggle button');
  else {
    const controls = toggle[0].match(/aria-controls="([^"]+)"/);
    if (!controls) fail(name, 'nav toggle has no aria-controls');
    else if (!doc.includes(`id="${controls[1]}"`)) {
      fail(name, `nav toggle controls #${controls[1]}, which does not exist`);
    }
  }
}

/** Product cards: a [ VIEW ] link and an [ ADD TO CART ] button that never adds by
 *  itself. A card shows no size, so a one-tap add could only add size S unasked (the
 *  old bug). The button opens a size-picker MODAL (<dialog>) that lives inside the
 *  card; the tap on a size in that dialog is the add. The dialog, not the article, is
 *  the product-form scope (data-product-wrap), so the card photo carries no frames. */
const hasAttr = (tag, attr) => new RegExp(`\\s${attr}(?=[\\s=/>])`).test(tag);
// Astro escapes ' " & < > in text; compare against the source strings, not the escapes.
const decodeEntities = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
for (const route of ['', ...Object.keys(collections).map((h) => `/collections/${h}`)]) {
  const doc = html(route || '/');
  if (!doc) continue;
  const name = route || '/';
  const cards = doc.match(/<article\b[^>]*\bclass="coll-card"[^>]*>[\s\S]*?<\/article>/g) ?? [];
  if (!cards.length) fail(name, 'no coll-card articles found');
  for (const card of cards) {
    const handle = card.match(/href="[^"]*\/products\/([^"/?#]+)"/)?.[1];
    const label = handle ?? 'unknown card';
    const product = catalogue.products.find((p) => p.handle === handle);

    // h. the dialog is the scope: the article tag itself must not also carry it.
    const articleTag = card.match(/^<article\b[^>]*>/)[0];
    if (hasAttr(articleTag, 'data-product-wrap')) {
      fail(name, `card ${label}: <article> carries data-product-wrap (the dialog is the scope)`);
    }

    // a. the visible control is a card-pick button that cannot add on its own.
    //    hasAttr is exact, so data-card-pick-close is not counted here.
    const buttons = (card.match(/<button\b[^>]*>/g) ?? []).filter((b) => hasAttr(b, 'data-card-pick'));
    if (buttons.length !== 1) {
      fail(name, `card ${label} has ${buttons.length} data-card-pick buttons, expected 1`);
    }
    const pickBtn = buttons[0];
    if (pickBtn && hasAttr(pickBtn, 'data-add-to-cart')) {
      fail(name, `card ${label}: ADD TO CART button carries data-add-to-cart (adds without asking)`);
    }
    if (pickBtn && hasAttr(pickBtn, 'data-variant-id')) {
      fail(name, `card ${label}: ADD TO CART button carries data-variant-id (always adds one size)`);
    }
    if (pickBtn && !/\saria-haspopup="dialog"/.test(pickBtn)) {
      fail(name, `card ${label}: ADD TO CART button lacks aria-haspopup="dialog"`);
    }
    if (pickBtn) {
      const fallback = pickBtn.match(/\sdata-fallback-href="([^"]*)"/)?.[1];
      if (fallback !== url(`/products/${handle}`)) {
        fail(name, `card ${label}: data-fallback-href is "${fallback}", expected ${url(`/products/${handle}`)}`);
      }
    }

    // b. aria-controls names a closed <dialog> inside this card, which is the scope.
    const controls = pickBtn?.match(/aria-controls="([^"]+)"/)?.[1];
    let dialog = null;
    if (pickBtn && !controls) fail(name, `card ${label}: ADD TO CART button has no aria-controls`);
    if (controls) {
      const open = [...card.matchAll(/<dialog\b[^>]*>/g)].find((m) => m[0].includes(`id="${controls}"`));
      if (!open) fail(name, `card ${label}: aria-controls #${controls} is not a <dialog> inside the card`);
      else {
        if (hasAttr(open[0], 'open')) fail(name, `card ${label}: dialog #${controls} is rendered open`);
        if (!hasAttr(open[0], 'data-product-wrap')) fail(name, `card ${label}: dialog #${controls} lacks data-product-wrap`);
        const close = card.indexOf('</dialog>', open.index);
        dialog = card.slice(open.index, close === -1 ? undefined : close);
        const labelled = open[0].match(/\saria-labelledby="([^"]+)"/)?.[1];
        if (!labelled) fail(name, `card ${label}: dialog has no aria-labelledby`);
        else if (!dialog.includes(`id="${labelled}"`)) {
          fail(name, `card ${label}: dialog aria-labelledby #${labelled} does not exist inside the dialog`);
        }
      }
    }

    // c. a labelled close button inside the dialog.
    if (dialog) {
      const closeBtn = (dialog.match(/<button\b[^>]*>/g) ?? []).find((b) => hasAttr(b, 'data-card-pick-close'));
      if (!closeBtn) fail(name, `card ${label}: dialog has no data-card-pick-close button`);
      else if (!/\saria-label="[^"]+"/.test(closeBtn)) fail(name, `card ${label}: close button has no aria-label`);
    }

    // d. the only data-add-to-cart in the card is the dialog's hidden one.
    const adds = card.match(/<[a-z]+\b[^>]*\bdata-add-to-cart\b[^>]*>/g) ?? [];
    if (adds.length !== 1) fail(name, `card ${label} has ${adds.length} data-add-to-cart elements, expected 1`);
    for (const add of adds) {
      if (!hasAttr(add, 'hidden')) fail(name, `card ${label}: data-add-to-cart is not hidden`);
      if (hasAttr(add, 'data-variant-id')) fail(name, `card ${label}: data-add-to-cart has a fixed data-variant-id`);
      if (dialog && !dialog.includes(add)) fail(name, `card ${label}: data-add-to-cart is outside the dialog`);
    }

    // e. the dialog's variant JSON and hidden id input.
    let variants = null;
    const json = dialog?.match(/<script[^>]*data-variant-json[^>]*>([\s\S]*?)<\/script>/);
    if (dialog && !json) fail(name, `card ${label}: dialog has no data-variant-json`);
    if (json) {
      try {
        variants = JSON.parse(json[1]);
      } catch {
        fail(name, `card ${label}: data-variant-json is not valid JSON`);
      }
    }
    if (variants) {
      if (!Array.isArray(variants) || !variants.length) {
        fail(name, `card ${label}: variant JSON is not a non-empty array`);
        variants = null;
      } else if (variants.some((v) => !Array.isArray(v.options))) {
        fail(name, `card ${label}: variant options are not arrays (size pills would be disabled)`);
      }
    }
    const idInput = dialog?.match(/<input\b[^>]*\bname="id"[^>]*>/)?.[0];
    const idValue = idInput?.match(/\bvalue="([^"]*)"/)?.[1];
    if (dialog && !idInput) fail(name, `card ${label}: dialog has no input name="id"`);
    else if (variants && !variants.some((v) => v.id === idValue)) {
      fail(name, `card ${label}: input id "${idValue}" is not in the variant JSON`);
    }

    // f. no size is preselected: the tap on a size is the add.
    for (const pill of dialog?.match(/<[a-z]+\b[^>]*class="size-pill[^>]*>/g) ?? []) {
      if (/aria-pressed="true"/.test(pill)) fail(name, `card ${label}: a size pill is preselected: ${pill.slice(0, 80)}`);
    }

    // h. a VIEW link to the product page.
    const links = [...card.matchAll(/<a\b[^>]*href="[^"]*\/products\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').toUpperCase(),
    );
    if (!links.some((t) => t.includes('VIEW'))) fail(name, `card ${label} has no VIEW link to the product`);

    // g. the dialog holds one photo per media entry keyed by colour, exactly one shown,
    //    and it is the colour of the variant in the hidden input. Frames anywhere else
    //    in the card would sit in no product-form scope of their own and fight these.
    const outside = dialog ? card.replace(dialog, '') : card;
    const strayFrames = (outside.match(/<img\b[^>]*>/g) ?? []).filter((f) => hasAttr(f, 'data-plate-frame'));
    if (strayFrames.length) {
      fail(name, `card ${label}: ${strayFrames.length} data-plate-frame img(s) outside the dialog`);
    }
    // i. "T-SHIRT" (the catalogue's `type`) is named once in the card info and once in
    //    the dialog summary: a name like THE FREQUENCY does not say what the thing is.
    if (product) {
      const typeOf = (scope) =>
        [...scope.matchAll(/<[a-z]+\b[^>]*\bclass="[^"]*\bcoll-type\b[^"]*"[^>]*>([^<]*)</g)].map((m) =>
          decodeEntities(m[1]).trim(),
        );
      const inCard = typeOf(outside);
      if (inCard.length !== 1 || inCard[0] !== product.type) {
        fail(name, `card ${label}: coll-type in the card info is [${inCard.join(', ')}], expected [${product.type}]`);
      }
      const inDialog = dialog ? typeOf(dialog) : [];
      if (inDialog.length !== 1 || inDialog[0] !== product.type) {
        fail(name, `card ${label}: coll-type in the dialog is [${inDialog.join(', ')}], expected [${product.type}]`);
      }
    }

    // j. a lazy image in a closed <dialog> never starts loading, so every photo in the
    //    dialog must be eager or the picker opens onto blanks.
    for (const frame of (dialog?.match(/<img\b[^>]*>/g) ?? []).filter((f) => hasAttr(f, 'data-plate-frame'))) {
      if (!/\sloading="eager"/.test(frame)) fail(name, `card ${label}: dialog photo is not loading="eager": ${frame.slice(0, 90)}`);
    }

    if (product && dialog) {
      const frames = (dialog.match(/<img\b[^>]*>/g) ?? []).filter((f) => hasAttr(f, 'data-plate-frame'));
      const ids = frames.map((f) => f.match(/\bdata-media-id="([^"]*)"/)?.[1]);
      const want = product.media.map((m) => m.colour);
      if (frames.length !== want.length || want.some((c, i) => ids[i] !== c)) {
        fail(name, `card ${label}: plate frames [${ids.join(', ')}] do not match media colours [${want.join(', ')}]`);
      }
      const shown = frames.filter((f) => !hasAttr(f, 'hidden'));
      if (shown.length !== 1) fail(name, `card ${label}: ${shown.length} plate frames visible, expected 1`);
      const inputColour = product.variants.find((v) => v.id === idValue)?.options.Colour;
      const shownId = shown[0]?.match(/\bdata-media-id="([^"]*)"/)?.[1];
      if (shown.length === 1 && shownId !== inputColour) {
        fail(name, `card ${label}: visible photo is ${shownId} but the id input is ${inputColour}`);
      }
    }
  }
}

/** Featured block on the homepage and collection pages: size selection must
 *  actually work. */
for (const route of ['/', ...Object.keys(collections).map((h) => `/collections/${h}`)]) {
  const doc = html(route);
  if (!doc) continue;
  const start = doc.indexOf('<section class="featured"');
  if (start === -1) {
    fail(route, 'no featured section');
    continue;
  }
  const sec = doc.slice(start, doc.indexOf('</section>', start));
  const json = sec.match(/<script[^>]*data-variant-json[^>]*>([\s\S]*?)<\/script>/);
  if (!json) fail(route, 'featured block has no data-variant-json');
  else {
    let variants = null;
    try {
      variants = JSON.parse(json[1]);
    } catch {
      fail(route, 'featured data-variant-json is not valid JSON');
    }
    if (variants) {
      if (!Array.isArray(variants) || !variants.length) fail(route, 'featured variant JSON is not a non-empty array');
      else if (variants.some((v) => !Array.isArray(v.options))) {
        fail(route, 'featured variant options are not arrays (size pills would be disabled)');
      }
    }
  }
  if (!/<input[^>]*\bname="id"/.test(sec)) fail(route, 'featured block has no input name="id"');
  const add = sec.match(/<button[^>]*\bdata-add-to-cart\b[^>]*>/);
  if (!add) fail(route, 'featured block has no add button');
  else if (/\bdata-variant-id\b/.test(add[0])) {
    fail(route, 'featured add button has a fixed data-variant-id (always adds one size)');
  }
}

/** No video section unless a product has a video (none do today). */
for (const product of catalogue.products) {
  const doc = html(`/products/${product.handle}`);
  if (doc && doc.includes('class="pdp-video"')) fail(`/products/${product.handle}`, 'renders pdp-video with no video');
}

/** Two promo bands on the homepage, but only ONE email ask between them: the
 *  closing band is a statement, not a second signup form. (With the signup
 *  modal, two forms made three asks against one row of products.) */
{
  const home = html('/');
  if (home) {
    const bands = home.match(/<section class="promo"[\s\S]*?<\/section>/g) ?? [];
    if (bands.length !== 2) fail('/', `expected two promo bands, found ${bands.length}`);
    const forms = bands.filter((band) => /<form\b/.test(band)).length;
    if (forms !== 1) fail('/', `expected exactly one promo band with a signup form, found ${forms}`);
  }
}

/** Design <-> product links agree both ways. Anchors are read from the built /icons
 *  page, since they need not equal the block id in icons.json. */
{
  const icons = html('/icons');
  const pageData = JSON.parse(readFileSync(join(root, 'src/data/pages/icons.json'), 'utf8'));
  const roster = pageData.sections.find((s) => s.id === 'roster');
  if (icons && !roster) fail('/icons', 'icons.json has no roster section');
  if (icons && roster) {
    const items = icons.match(/<article class="[^"]*\broster-item\b[^"]*"[^>]*>[\s\S]*?<\/article>/g) ?? [];
    const withCta = roster.blocks.filter((b) => b.settings.cta_link);
    const ctaCount = (icons.match(/class="roster-cta"/g) ?? []).length;
    if (ctaCount !== withCta.length) {
      fail('/icons', `${ctaCount} .roster-cta rendered but ${withCta.length} blocks have a cta_link`);
    }
    for (const block of withCta) {
      const m = block.settings.cta_link.match(/^\/products\/([^/#?]+)$/);
      if (!m) continue;
      const item = items.find((it) => it.includes(`href="${url(block.settings.cta_link)}"`));
      if (!item) {
        fail('/icons', `no roster item links to ${block.settings.cta_link}`);
        continue;
      }
      const anchor = item.match(/\sid="([^"]+)"/)?.[1];
      if (!anchor) {
        fail('/icons', `roster item for ${m[1]} has no id anchor`);
        continue;
      }
      const product = html(`/products/${m[1]}`);
      if (!product) {
        fail(`/products/${m[1]}`, 'linked from /icons but not built');
        continue;
      }
      if (!product.includes(`href="${url('/icons')}#${anchor}"`)) {
        fail(`/products/${m[1]}`, `no link back to /icons#${anchor}`);
      }
    }
  }
}

const strings = JSON.parse(readFileSync(join(root, 'src/data/strings.json'), 'utf8'));
const jsonLdOf = (doc) =>
  [...doc.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/** Reviews. A sample review (placeholder copy written by us) must never reach a
 *  customer unlabelled, so this is checked on the data AND on every built page.
 *  The data checks come first because a typo there ("sample": "false", "Sample": true)
 *  is exactly what would silently drop the label. */
const reviewsFile = JSON.parse(readFileSync(join(root, 'src/data/reviews.json'), 'utf8'));
const reviews = Array.isArray(reviewsFile.reviews) ? reviewsFile.reviews : [];
if (!Array.isArray(reviewsFile.reviews)) fail('reviews.json', 'no "reviews" array');
const handles = catalogue.products.map((p) => p.handle);
reviews.forEach((review, i) => {
  const at = `reviews.json[${i}]`;
  for (const key of ['product', 'name', 'text']) {
    if (typeof review[key] !== 'string' || !review[key].trim()) fail(at, `${key} is missing or empty`);
  }
  if (typeof review.product === 'string' && !handles.includes(review.product)) {
    fail(at, `product "${review.product}" is not a catalogue handle`);
  }
  if ('sample' in review && review.sample !== true) {
    fail(at, `sample is ${JSON.stringify(review.sample)}; when present it must be boolean true`);
  }
  for (const key of Object.keys(review)) {
    if (!['product', 'name', 'text', 'sample'].includes(key)) {
      fail(at, `unknown key "${key}" (a misspelt "sample" would unlabel the entry)`);
    }
  }
  if (/sample/i.test(review.name ?? '') && review.sample !== true) {
    fail(at, `name "${review.name}" says sample but the entry is not flagged sample: true`);
  }
});

for (const product of catalogue.products) {
  const route = `/products/${product.handle}`;
  const doc = html(route);
  if (!doc) continue;
  const mine = reviews.filter((r) => r.product === product.handle);
  const start = doc.indexOf('<section class="pdp-reviews"');
  if (!mine.length) {
    if (start !== -1) fail(route, 'renders a reviews section for a product with no reviews');
    continue;
  }
  if (start === -1) {
    fail(route, `no reviews section, but reviews.json has ${mine.length} for this product`);
    continue;
  }
  const section = doc.slice(start, doc.indexOf('</section>', start));
  const items = section.match(/<li\b[^>]*\bclass="review"[^>]*>[\s\S]*?<\/li>/g) ?? [];
  if (items.length !== mine.length) {
    fail(route, `${items.length} class="review" items rendered, reviews.json has ${mine.length}`);
  }
  const tagRe = new RegExp(`<span\\b[^>]*\\bclass="review-tag"[^>]*>\\s*${strings.reviews.sample_tag}\\s*</span>`);
  for (const review of mine) {
    const item = items.find((li) => decodeEntities(li).includes(review.text));
    if (!item) {
      fail(route, `review not shown: "${review.text.slice(0, 40)}"`);
      continue;
    }
    const openTag = item.match(/^<li\b[^>]*>/)[0];
    const tag = item.match(/<span\b[^>]*\bclass="review-tag"[^>]*>/)?.[0];
    if (review.sample === true) {
      if (!hasAttr(openTag, 'data-sample')) fail(route, `SAMPLE review has no data-sample: "${review.text.slice(0, 40)}"`);
      if (!tagRe.test(item)) fail(route, `SAMPLE review rendered without the ${strings.reviews.sample_tag} tag: "${review.text.slice(0, 40)}"`);
      if (tag && hasAttr(tag, 'hidden')) fail(route, `SAMPLE tag is hidden: "${review.text.slice(0, 40)}"`);
      if (hasAttr(openTag, 'hidden')) fail(route, `SAMPLE review is hidden: "${review.text.slice(0, 40)}"`);
    } else if (hasAttr(openTag, 'data-sample') || tag) {
      fail(route, `a real review is labelled as a sample: "${review.text.slice(0, 40)}"`);
    }
  }
  if (mine.some((r) => r.sample === true) && !decodeEntities(section).includes(strings.reviews.sample_note)) {
    fail(route, 'samples are shown but the "not written by customers" note is missing');
  }
  if (!mine.some((r) => r.sample === true) && section.includes('reviews-note')) {
    fail(route, 'samples note shown with no samples');
  }
  if (/[★☆]/.test(section)) fail(route, 'star glyph in the reviews section (no ratings exist)');
}

for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  for (const block of jsonLdOf(doc)) {
    if (/"review"|"aggregateRating"|"ratingValue"/i.test(block) || /"@type"\s*:\s*"(?:Aggregate)?(?:Rating|Review)"/i.test(block)) {
      fail(route || '/', 'JSON-LD carries review or rating data (samples are not customer reviews)');
    }
  }
}

/** Bag delivery row. cart.js reads these two numbers to show delivery, so they must be
 *  the ones api/_order.js charges by. The rule itself sits inside cart.js's IIFE, so it
 *  is not reachable from here; tools/test-order.mjs pins the server side of it. */
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  const name = route || '/';
  const rows = doc.match(/<div\b[^>]*\bdata-cart-delivery(?=[\s=>])[^>]*>/g) ?? [];
  if (!rows.length) fail(name, 'no data-cart-delivery row (bag shows no delivery cost)');
  for (const row of rows) {
    if (!hasAttr(row, 'hidden')) fail(name, 'delivery row is not rendered hidden (shows before the bag has items)');
    const standard = row.match(/\sdata-standard-pence="([^"]*)"/)?.[1];
    const threshold = row.match(/\sdata-free-threshold="([^"]*)"/)?.[1];
    const label = row.match(/\sdata-free-label="([^"]*)"/)?.[1];
    if (standard !== String(settings.shipping.ukStandardPence)) {
      fail(name, `delivery row data-standard-pence is "${standard}", server charges ${settings.shipping.ukStandardPence}`);
    }
    if (threshold !== String(settings.shipping.freeThresholdPence)) {
      fail(name, `delivery row data-free-threshold is "${threshold}", server threshold is ${settings.shipping.freeThresholdPence}`);
    }
    if (decodeEntities(label ?? '') !== strings.cart.delivery_free) {
      fail(name, `delivery row data-free-label is "${label}", expected "${strings.cart.delivery_free}"`);
    }
  }
  const terms = [...doc.matchAll(/<p\b[^>]*\bclass="cart-note cart-terms"[^>]*>([^<]*)</g)].map((m) => decodeEntities(m[1]).trim());
  if (terms.length !== rows.length) fail(name, `${terms.length} terms lines for ${rows.length} delivery rows`);
  for (const text of terms) {
    if (text !== strings.cart.terms) fail(name, `terms line is "${text}", expected "${strings.cart.terms}"`);
  }
  if (name === '/cart') {
    const mainStart = doc.indexOf('class="main-cart"');
    const mainEnd = mainStart === -1 ? -1 : doc.indexOf('</section>', mainStart);
    const inMain = mainStart === -1 ? '' : doc.slice(mainStart, mainEnd === -1 ? undefined : mainEnd);
    const mainRows = inMain.match(/\bdata-cart-delivery(?=[\s=>])/g) ?? [];
    if (mainRows.length !== 1) fail(name, `expected one delivery row inside class="main-cart", found ${mainRows.length}`);
    if (rows.length !== 2) fail(name, `expected the page row plus the drawer's (2), found ${rows.length}`);
  }
}

/** /story carries the origin section between the 1940 and today sections. */
{
  const story = html('/story');
  const pageData = JSON.parse(readFileSync(join(root, 'src/data/pages/story.json'), 'utf8'));
  const headingOf = (id) => pageData.sections.find((s) => s.id === id)?.settings?.heading;
  if (story) {
    const at = {};
    for (const id of ['split-1940', 'split-origin', 'split-today']) {
      const heading = headingOf(id);
      if (!heading) {
        fail('/story', `story.json has no ${id} heading`);
        continue;
      }
      at[id] = decodeEntities(story).indexOf(`>${heading}<`);
      if (at[id] === -1) fail('/story', `${id} heading "${heading}" not rendered`);
    }
    if (at['split-origin'] > -1 && !(at['split-1940'] < at['split-origin'] && at['split-origin'] < at['split-today'])) {
      fail('/story', 'split-origin section is not between split-1940 and split-today');
    }
  }
}

/** Social links: settings.social.* goes through safeExternalUrl(), so a stray
 *  javascript: value in the file cannot become an href or a sameAs entry. */
const SAFE_EXTERNAL = /^https?:\/\/\S+$/i;
for (const route of routes) {
  const doc = html(route || '/');
  if (!doc) continue;
  const name = route || '/';
  const start = doc.indexOf('<header class="masthead"');
  const head = start === -1 ? '' : doc.slice(start, doc.indexOf('</header>', start));
  for (const anchor of head.match(/<a\b[^>]*>/g) ?? []) {
    if (!/\starget="_blank"/.test(anchor)) continue;
    const target = decodeEntities(anchor.match(/\shref="([^"]*)"/)?.[1] ?? '');
    if (target !== '#' && !SAFE_EXTERNAL.test(target)) {
      fail(name, `masthead external link has an unsafe href: "${target}"`);
    }
  }
  for (const block of jsonLdOf(doc)) {
    let data;
    try {
      data = JSON.parse(block);
    } catch {
      fail(name, 'JSON-LD is not valid JSON');
      continue;
    }
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if ('sameAs' in node) {
        const list = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs];
        for (const entry of list) {
          if (typeof entry !== 'string' || !SAFE_EXTERNAL.test(entry)) {
            fail(name, `JSON-LD sameAs entry is not an http(s) URL: ${JSON.stringify(entry)}`);
          }
        }
      }
      Object.values(node).forEach(walk);
    };
    walk(data);
  }
}

if (failures.length) {
  console.error(`build check failed - ${failures.length} problem(s):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(`build ok: ${routes.length} routes checked, all carrying real content`);
