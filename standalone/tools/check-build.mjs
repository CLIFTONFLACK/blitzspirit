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

/** Product cards link to the product; they never add to the bag from the grid. */
for (const route of ['', ...Object.keys(collections).map((h) => `/collections/${h}`)]) {
  const doc = html(route || '/');
  if (!doc) continue;
  const name = route || '/';
  const cards = doc.match(/<article class="coll-card"[\s\S]*?<\/article>/g) ?? [];
  if (!cards.length) fail(name, 'no coll-card articles found');
  for (const card of cards) {
    const label = card.match(/href="([^"]*\/products\/[^"]*)"/)?.[1] ?? 'unknown card';
    if (card.includes('data-add-to-cart')) fail(name, `card adds to the bag straight from the grid: ${label}`);
    const links = [...card.matchAll(/<a\b[^>]*href="[^"]*\/products\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').toUpperCase(),
    );
    if (!links.some((t) => t.includes('CHOOSE SIZE') || t.includes('SOLD OUT'))) {
      fail(name, `card has no CHOOSE SIZE / SOLD OUT product link: ${label}`);
    }
  }
}

/** Featured block on collection pages: size selection must actually work. */
for (const handle of Object.keys(collections)) {
  const route = `/collections/${handle}`;
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

/** Exactly one promo band on the homepage. */
{
  const home = html('/');
  if (home) {
    const n = (home.match(/<section class="promo"/g) ?? []).length;
    if (n !== 1) fail('/', `expected exactly one promo band, found ${n}`);
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

if (failures.length) {
  console.error(`build check failed - ${failures.length} problem(s):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(`build ok: ${routes.length} routes checked, all carrying real content`);
