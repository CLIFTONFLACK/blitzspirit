/**
 * printful-sync — copy price, availability and the Printful variant id onto every
 * catalogue variant. Printful is the source of truth for all three; titles, copy and
 * photography stay in catalogue.json.
 *
 * Each product names its Printful sync product in `printfulProductId`. Variants are
 * matched on (colour, size), and every variant on both sides must find a partner:
 * a size or colour Printful stocks that the site does not sell, or the reverse, stops
 * the sync without writing anything.
 *
 *   PRINTFUL_API_TOKEN=... node tools/printful-sync.mjs
 *
 * The token can also sit in standalone/.env. Rerunning with nothing changed in
 * Printful leaves catalogue.json byte-identical.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cataloguePath = join(root, 'src/data/catalogue.json');

/** Printful's names on the left, the catalogue's on the right. Anything not listed
 *  must match exactly. */
export const COLOUR_MAP = { Natural: 'Off-White' };
export const SIZE_MAP = { '2XL': 'XXL' };

function token() {
  if (process.env.PRINTFUL_API_TOKEN) return process.env.PRINTFUL_API_TOKEN;
  const envFile = join(root, '.env');
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('PRINTFUL_API_TOKEN='));
    const value = line && line.slice('PRINTFUL_API_TOKEN='.length).trim();
    if (value) return value;
  }
  throw new Error('PRINTFUL_API_TOKEN is not set (env or standalone/.env)');
}

async function fetchSyncProduct(id, apiToken) {
  const response = await fetch(`https://api.printful.com/store/products/${id}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'User-Agent': 'blitzspirit-printful-sync/1.0',
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.code !== 200) {
    throw new Error(`Printful product ${id}: HTTP ${response.status} ${body?.error?.message ?? ''}`);
  }
  return body.result;
}

/**
 * Pure: apply one Printful sync product to one catalogue product, in place.
 * Returns a list of problems; an empty list means every variant was matched.
 */
export function applySyncProduct(product, syncProduct) {
  const problems = [];
  const key = (colour, size) => `${colour}|${size}`;
  const byKey = new Map(product.variants.map((v) => [key(v.options.Colour, v.options.Size), v]));
  const matched = new Set();

  for (const sv of syncProduct.sync_variants) {
    if (sv.is_ignored) continue;
    const colour = COLOUR_MAP[sv.color] ?? sv.color;
    const size = SIZE_MAP[sv.size] ?? sv.size;
    const variant = byKey.get(key(colour, size));
    if (!variant) {
      problems.push(`${product.handle}: Printful variant ${sv.id} (${sv.color} / ${sv.size}) has no catalogue variant`);
      continue;
    }
    if (sv.currency !== 'GBP') {
      problems.push(`${product.handle}: Printful variant ${sv.id} is priced in ${sv.currency}, not GBP`);
      continue;
    }
    const pence = Math.round(Number(sv.retail_price) * 100);
    if (!Number.isInteger(pence) || pence <= 0) {
      problems.push(`${product.handle}: Printful variant ${sv.id} has price "${sv.retail_price}"`);
      continue;
    }
    variant.printfulVariantId = sv.id;
    variant.price = pence;
    variant.available = sv.availability_status === 'active';
    matched.add(variant);
  }

  for (const variant of product.variants) {
    if (!matched.has(variant)) problems.push(`${product.handle}: ${variant.id} has no Printful variant`);
  }

  if (problems.length === 0) product.price = Math.min(...product.variants.map((v) => v.price));
  return problems;
}

async function main() {
  const apiToken = token();
  const text = readFileSync(cataloguePath, 'utf8');
  const catalogue = JSON.parse(text);
  const problems = [];

  for (const product of catalogue.products) {
    if (!product.printfulProductId) {
      problems.push(`${product.handle}: no printfulProductId`);
      continue;
    }
    const syncProduct = await fetchSyncProduct(product.printfulProductId, apiToken);
    problems.push(...applySyncProduct(product, syncProduct));
  }

  if (problems.length > 0) {
    console.error(`printful-sync: ${problems.length} problem(s), catalogue NOT written:`);
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const next = (JSON.stringify(catalogue, null, 2) + '\n').replace(/\n/g, eol);
  if (next === text) {
    console.log('printful-sync: catalogue already matches Printful');
    return;
  }
  writeFileSync(cataloguePath, next);
  const count = catalogue.products.reduce((n, p) => n + p.variants.length, 0);
  console.log(`printful-sync: wrote ${count} variants across ${catalogue.products.length} products`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error('printful-sync:', error.message);
    process.exit(1);
  });
}
