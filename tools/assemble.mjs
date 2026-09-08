/**
 * assemble — build the deployable tree.
 *
 * Vercel serves whatever this writes to `out/`:
 *   out/          the shop, built from standalone/ — now the site at the domain root
 *   out/old/      the original static site, copied verbatim
 *   out/social/   the copy dossier, a prebuilt page committed at social/
 *
 * Serverless functions are NOT here — Vercel picks those up from the repo's own
 * api/ directory, independently of the output directory.
 *
 * Nothing generated is committed any more. Before this, the shop's HTML lived in
 * new/ and a GitHub Action rebuilt it on every content edit, because the project had
 * no build step. It has one now, so an edit commits JSON and Vercel does the rest.
 *
 *   node tools/assemble.mjs
 */
import { cp, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const shop = join(root, 'standalone', 'dist');

const extras = [
  { from: join(root, 'old'), to: join(out, 'old'), label: 'the original site', required: true },
  { from: join(root, 'social'), to: join(out, 'social'), label: 'the copy dossier', required: false },
];

if (!existsSync(shop)) {
  console.error(`assemble: ${shop} does not exist - build standalone/ first`);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(shop, out, { recursive: true });

for (const extra of extras) {
  if (!existsSync(extra.from)) {
    if (extra.required) {
      console.error(`assemble: ${extra.from} does not exist (${extra.label})`);
      process.exit(1);
    }
    console.log(`assemble: skipping ${extra.label} - not present`);
    continue;
  }
  await cp(extra.from, extra.to, { recursive: true });
}

/** Fail loudly rather than deploying a tree that is missing half the site. */
const required = [
  ['index.html', 'the shop home page'],
  ['edit/index.html', 'the copy editor'],
  ['products', 'the product pages'],
  ['cart-index.json', 'the cart index'],
  ['_astro', "the shop's hashed assets"],
  ['old/index.html', 'the original site home page'],
  ['old/newui.css', "the original site's stylesheet"],
  ['old/assets', "the original site's images"],
];

const missing = required.filter(([path]) => !existsSync(join(out, path)));
if (missing.length) {
  console.error('assemble: output is incomplete:');
  for (const [path, what] of missing) console.error(`  - ${path} (${what})`);
  process.exit(1);
}

async function count(dir) {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? await count(join(dir, entry.name)) : 1;
  }
  return n;
}

const total = await count(out);
const oldFiles = await count(join(out, 'old'));
const socialFiles = existsSync(join(out, 'social')) ? await count(join(out, 'social')) : 0;
console.log(
  `assemble ok: ${total - oldFiles - socialFiles} shop + ${oldFiles} original-site` +
    `${socialFiles ? ` + ${socialFiles} dossier` : ''} files -> out/`
);
