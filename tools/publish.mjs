/**
 * publish — copy the built shop into the repo root, where Vercel serves it from.
 *
 * This project publishes the repo as-is: no build step, no output directory. So the
 * shop's HTML has to BE the repo root. That is untidy — generated files sitting
 * beside source — and it is deliberate: it is the only arrangement that needs no
 * Vercel configuration, and configuration is what repeatedly failed here.
 *
 * The danger with writing into the repo root is deleting something that is not
 * ours. So the set of published entries is recorded in .published and only those
 * are ever removed. A source directory that has never been published cannot be
 * touched, and the guard below refuses outright to publish over one.
 *
 *   node tools/publish.mjs [dist-dir]
 */
import { cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(root, 'standalone', 'dist');
const manifestPath = join(root, '.published');

/** Never published over, whatever a manifest might claim. */
const SOURCE = new Set([
  'api', 'standalone', 'tools', 'docs', 'old', 'social', 'shopify-theme', 'dist',
  '.github', '.git', '.gitignore', '.vercelignore', '.published', 'vercel.json',
  'package.json', 'package-lock.json', 'README.md', 'node_modules', 'out',
]);

if (!existsSync(dist)) {
  console.error(`publish: ${dist} does not exist - build standalone/ first`);
  process.exit(1);
}

const incoming = (await readdir(dist)).sort();
if (!incoming.length) {
  console.error('publish: the build produced nothing');
  process.exit(1);
}

const clash = incoming.filter((name) => SOURCE.has(name));
if (clash.length) {
  console.error(`publish: the build wants to overwrite source paths: ${clash.join(', ')}`);
  process.exit(1);
}

// Remove what was published last time, and only that.
let previous = [];
if (existsSync(manifestPath)) {
  previous = (await readFile(manifestPath, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

for (const name of previous) {
  if (SOURCE.has(name)) {
    console.error(`publish: refusing to remove ${name} - it is source, not published output`);
    process.exit(1);
  }
  await rm(join(root, name), { recursive: true, force: true });
}

for (const name of incoming) {
  await cp(join(dist, name), join(root, name), { recursive: true });
}

await writeFile(
  manifestPath,
  '# Written by tools/publish.mjs. Every entry here is generated and is replaced on\n' +
    '# each publish; nothing else in the repo root is ever removed by it.\n' +
    incoming.join('\n') +
    '\n',
  'utf8'
);

const required = ['index.html', 'edit/index.html', 'products', '_astro', 'cart-index.json'];
const missing = required.filter((path) => !existsSync(join(root, path)));
if (missing.length) {
  console.error(`publish: published tree is incomplete: ${missing.join(', ')}`);
  process.exit(1);
}
if (!existsSync(join(root, 'old', 'index.html'))) {
  console.error('publish: old/index.html is missing - the original site should be at /old/');
  process.exit(1);
}

const removed = previous.filter((name) => !incoming.includes(name));
console.log(
  `publish ok: ${incoming.length} entries at the repo root` +
    (removed.length ? `, ${removed.length} stale removed (${removed.join(', ')})` : '')
);
