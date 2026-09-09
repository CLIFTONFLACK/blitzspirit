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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Two editions are built from this source: the shop at the domain root, and the
   neomorphic edition under /neomorphism (astro.neo.config.mjs). They are the same
   pages, so they get the same assertions - the second edition is verified, not
   assumed. Both arguments are optional and default to the shop.

     node tools/check-build.mjs                      # dist/, base ''
     node tools/check-build.mjs dist-neo /neomorphism */
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
  ['footer', 'class="outro"'],
  ['stylesheet link', '<link rel="stylesheet"'],
  ['canonical', 'rel="canonical"'],
  ['font preload', 'chunkfive.woff2'],
];

const routes = [
  '',
  '/about',
  '/story',
  '/help',
  '/contact',
  '/icons',
  '/link-in-bio',
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
  // The collection template also carries a featured-product band above the grid
  // (v27 features The Establishment on every collection page), so only the grid
  // itself is required to be exclusive.
  const gridStart = doc.indexOf('class="coll-grid-wrap"');
  const grid = gridStart === -1 ? doc : doc.slice(gridStart);
  if (gridStart === -1) fail(route, 'no product grid rendered');
  const strays = catalogue.products
    .map((p) => p.handle)
    .filter((h) => !collection.products.includes(h))
    .filter((h) => grid.includes(`href="${url(`/products/${h}`)}"`));
  if (strays.length) fail(route, `grid links to products not in the collection: ${strays.join(', ')}`);
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
    // The edition mark is the one link that MUST leave the base: it is how a
    // visitor gets back from the neomorphic edition to the shop. It says so on
    // itself, and only elements that say so are exempt.
    const scanned = doc.replace(/<[a-z]+[^>]*\sdata-cross-edition[^>]*>/gi, '');
    const attrs = [...scanned.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
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

/** The neomorphic edition must actually be wearing its skin.
 *
 *  This is the assertion that would have caught the worst plausible failure here: the
 *  edition builds, every route 200s, every word is in place - and the stylesheet
 *  never loaded, so it renders as the ordinary shop at a second URL. A route check
 *  cannot see that. So: the hook is on the page, the sheet is linked, the file
 *  shipped, and the file is the skin rather than an empty placeholder. */
if (BASE === '/neomorphism') {
  const sheet = join(dist, 'neo.css');
  if (!existsSync(sheet)) {
    fail('/neo.css', 'the skin did not ship');
  } else {
    const css = readFileSync(sheet, 'utf8');
    for (const [label, needle] of [
      ['the scope', "html[data-skin='neo']"],
      ['the extrusion tokens', '--neo-raise:'],
      ['the masthead treatment', '.masthead'],
    ]) {
      if (!css.includes(needle)) fail('/neo.css', `does not contain ${label}`);
    }
  }
  for (const route of routes) {
    const doc = html(route || '/');
    if (!doc) continue;
    if (!doc.includes('data-skin="neo"')) fail(route || '/', 'no data-skin hook on <html>');
    if (!doc.includes(url('/neo.css'))) fail(route || '/', 'the skin is not linked');
    if (!doc.includes('name="robots" content="noindex')) fail(route || '/', 'not noindex');
  }
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

if (failures.length) {
  console.error(`build check failed - ${failures.length} problem(s):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(`build ok: ${routes.length} routes checked, all carrying real content`);
