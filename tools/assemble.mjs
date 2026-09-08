/**
 * assemble — build the deployable tree.
 *
 * Vercel serves whatever this writes to `out/`:
 *   out/         the shop, built from standalone/
 *   out/old/     the original static site, copied verbatim
 *
 * Serverless functions are NOT here — Vercel picks those up from the repo's own
 * api/ directory, independently of the output directory.
 *
 * This exists because the shop needs a real build now that content is edited through
 * /edit/: an edit commits JSON, and only a rebuild turns that JSON into HTML.
 * Before that, the built HTML was committed and the project had no build step.
 *
 *   node tools/assemble.mjs
 */
import { cp, rm, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const shop = join(root, 'standalone', 'dist');
const old = join(root, 'old');

if (!existsSync(shop)) {
  console.error(`assemble: ${shop} does not exist - build standalone/ first`);
  process.exit(1);
}
if (!existsSync(old)) {
  console.error(`assemble: ${old} does not exist`);
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await cp(shop, out, { recursive: true });
await cp(old, join(out, 'old'), { recursive: true });

/** Fail loudly rather than deploying a tree that is missing half the site. */
async function count(dir) {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) n += await count(full);
    else n += 1;
  }
  return n;
}

const required = [
  ['index.html', 'the shop home page'],
  ['old/index.html', 'the original site home page'],
  ['old/newui.css', "the original site's stylesheet"],
  ['cart-index.json', 'the cart index'],
  ['_astro', "the shop's hashed assets"],
];

const missing = required.filter(([path]) => !existsSync(join(out, path)));
if (missing.length) {
  console.error('assemble: output is incomplete:');
  for (const [path, what] of missing) console.error(`  - ${path} (${what})`);
  process.exit(1);
}

const shopFiles = await count(out);
const oldFiles = await count(join(out, 'old'));
console.log(
  `assemble ok: ${shopFiles - oldFiles} shop files + ${oldFiles} original-site files -> out/`
);
