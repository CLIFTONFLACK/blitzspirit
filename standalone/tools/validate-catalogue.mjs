/**
 * validate-catalogue — invariants the catalogue data must hold.
 *
 * Runs before every build (see package.json "prebuild"). Each check has been
 * negative-tested: breaking the invariant on purpose makes it fail.
 *
 *   node tools/validate-catalogue.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const catalogue = read('src/data/catalogue.json');
const collections = read('src/data/collections.json');
const settings = read('src/data/settings.json');

const failures = [];
const fail = (msg) => failures.push(msg);

/** Width and height read straight from a JPEG or PNG header (no dependency), or null. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; // IHDR
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i++; continue; } // fill byte
      // SOF0-SOF15 carry the frame size, except DHT (c4), JPG (c8) and DAC (cc).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

const products = catalogue.products;
const handles = new Set(products.map((p) => p.handle));

// 1. Every collection member resolves to a real product.
for (const [key, collection] of Object.entries(collections)) {
  for (const handle of collection.products) {
    if (!handles.has(handle)) fail(`collection ${key} references unknown product ${handle}`);
  }
}

// 2. No product is unreachable.
const inAnyCollection = new Set(Object.values(collections).flatMap((c) => c.products));
for (const handle of handles) {
  if (!inAnyCollection.has(handle)) fail(`product ${handle} is in no collection`);
}

const seenVariantIds = new Set();
const seenSkus = new Set();
const seenPrintfulIds = new Set();

for (const product of products) {
  // 3. Every referenced image is actually on disk. Data paths read "/assets/..."
  //    but the files live in src/assets so Astro's image pipeline can process them;
  //    src/lib/images.ts does the same rewrite at render time.
  for (const media of product.media) {
    if (!existsSync(join(root, media.src.replace(/^\/assets\//, 'src/assets/')))) {
      fail(`${product.handle}: missing image ${media.src}`);
    }
  }

  // 3b. Each media entry is complete and honest. A colourway can have several photos,
  //     keyed by `colour`: a value that is not a declared Colour option ("Off White" for
  //     "Off-White") silently drops the photo from its colourway, and a wrong
  //     width/height makes the page reserve the wrong box (layout shift).
  const declaredColours = new Set(
    (product.options.find((o) => o.name === 'Colour')?.values ?? []).map((v) => v.value)
  );
  const seenSrcs = new Set();
  for (const media of product.media) {
    const at = `${product.handle}: media ${media.src ?? '(no src)'}`;
    for (const key of ['colour', 'src', 'alt']) {
      if (typeof media[key] !== 'string' || !media[key].trim()) fail(`${at}: ${key} is missing or empty`);
    }
    for (const key of ['width', 'height']) {
      if (!Number.isInteger(media[key]) || media[key] <= 0) {
        fail(`${at}: ${key} ${media[key]} is not a positive integer`);
      }
    }
    if (seenSrcs.has(media.src)) fail(`${at}: src is listed twice (frames and thumbs are keyed by it)`);
    seenSrcs.add(media.src);
    if (typeof media.colour === 'string' && !declaredColours.has(media.colour)) {
      fail(`${at}: colour "${media.colour}" is not a declared Colour value (${[...declaredColours].join(', ')})`);
    }
    if (typeof media.src === 'string') {
      const file = join(root, media.src.replace(/^\/assets\//, 'src/assets/'));
      const actual = existsSync(file) ? imageSize(readFileSync(file)) : null;
      if (existsSync(file) && !actual) fail(`${at}: not a JPEG or PNG, cannot read its size`);
      else if (actual && (actual.width !== media.width || actual.height !== media.height)) {
        fail(`${at}: recorded ${media.width}x${media.height} but the file is ${actual.width}x${actual.height}`);
      }
    }
  }

  // 4. Variant ids and SKUs are unique across the whole catalogue - the cart and
  //    the checkout endpoint both key on the id.
  for (const variant of product.variants) {
    if (seenVariantIds.has(variant.id)) fail(`duplicate variant id ${variant.id}`);
    if (seenSkus.has(variant.sku)) fail(`duplicate sku ${variant.sku}`);
    seenVariantIds.add(variant.id);
    seenSkus.add(variant.sku);

    // 5. Prices are integer pence. A float here becomes a rounding bug at checkout.
    if (!Number.isInteger(variant.price) || variant.price <= 0) {
      fail(`${variant.id}: price ${variant.price} is not a positive integer (pence)`);
    }

    // 12. Every variant can be fulfilled: a paid order for one with no Printful id
    //     reaches the webhook and cannot be sent anywhere. Run tools/printful-sync.mjs.
    if (!Number.isInteger(variant.printfulVariantId) || variant.printfulVariantId <= 0) {
      fail(`${variant.id}: no printfulVariantId - run npm run printful:sync`);
    } else if (seenPrintfulIds.has(variant.printfulVariantId)) {
      fail(`${variant.id}: printfulVariantId ${variant.printfulVariantId} is used twice`);
    }
    seenPrintfulIds.add(variant.printfulVariantId);

    // 6. Every option the variant claims exists on the product, with that value.
    for (const [name, value] of Object.entries(variant.options)) {
      const option = product.options.find((o) => o.name === name);
      if (!option) {
        fail(`${variant.id}: option ${name} is not declared on ${product.handle}`);
      } else if (!option.values.some((v) => v.value === value)) {
        fail(`${variant.id}: ${name}="${value}" is not a declared value`);
      }
    }
  }

  // 7. Every colourway can be photographed, or the picker shows a dead swatch.
  const colourOption = product.options.find((o) => o.name === 'Colour');
  if (colourOption) {
    const photographed = new Set(product.media.map((m) => m.colour));
    for (const { value } of colourOption.values) {
      if (!photographed.has(value)) fail(`${product.handle}: colourway ${value} has no photo`);
    }
  }

  // 8. The variant grid is complete - every declared combination exists.
  const expected = product.options.reduce((n, o) => n * o.values.length, 1);
  if (product.options.length > 0 && product.variants.length !== expected) {
    fail(`${product.handle}: ${product.variants.length} variants, expected ${expected}`);
  }

  // 8b. Every product carries explicit field-manual rows. The Liquid snippet had an
  //     auto-row fallback for bare products; the Astro component dropped it, so an
  //     empty list would render a heading with nothing under it.
  if (!Array.isArray(product.fieldManual) || product.fieldManual.length === 0) {
    fail(`${product.handle}: no fieldManual rows`);
  }

  // 8c. A product with no photo renders an empty plate everywhere it appears.
  if (product.media.length === 0) fail(`${product.handle}: no media`);

  // 9. A compare-at price that is not above the price shows a nonsense saving.
  if (product.compareAtPrice !== null && product.compareAtPrice <= product.price) {
    fail(`${product.handle}: compareAtPrice ${product.compareAtPrice} not above price ${product.price}`);
  }

  // 10. Bundle components point at real products and real colourways.
  if (product.kind === 'bundle') {
    for (const component of product.components ?? []) {
      const target = products.find((p) => p.handle === component.handle);
      if (!target) {
        fail(`${product.handle}: component ${component.handle} does not exist`);
        continue;
      }
      const match = target.variants.find(
        (v) =>
          v.options.Colour === component.colour &&
          (component.size === null || v.options.Size === component.size)
      );
      if (!match) {
        fail(
          `${product.handle}: component ${component.handle} ` +
            `(${component.colour}${component.size ? '/' + component.size : ''}) matches no variant`
        );
      }
    }
  }
}

// 11. The free-shipping threshold the drawer draws against must match the one
//     the checkout endpoint charges against, or the bar lies.
if (settings.cart.freeShippingThreshold !== settings.shipping.freeThresholdPence) {
  fail(
    `free-shipping threshold mismatch: cart ${settings.cart.freeShippingThreshold} ` +
      `vs shipping ${settings.shipping.freeThresholdPence}`
  );
}

const variantCount = products.reduce((n, p) => n + p.variants.length, 0);

if (failures.length > 0) {
  console.error(`catalogue invalid - ${failures.length} problem(s):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

console.log(
  `catalogue ok: ${products.length} products ` +
    `(${products.filter((p) => p.kind === 'bundle').length} bundles), ` +
    `${variantCount} variants, ${Object.keys(collections).length} collections`
);
