/**
 * social-page — turn the built /social page into a single file this branch can serve.
 *
 * Why this exists: on `main` the Vercel project has no build step; it publishes the
 * repo as-is. The page's source is the Astro page on `swap-shop-to-root`
 * (standalone/src/pages/social.astro), which is where it will live once the shop
 * moves to the domain root. Until that merge, the same page ships here as committed
 * output — the model this repo already used for /new/.
 *
 * The output is deliberately self-contained: styles and script inlined, so it depends
 * on nothing but the font and icon the site already serves. That is what makes it
 * safe to drop into a tree it was not built for.
 *
 *   node tools/social-page.mjs <astro-dist-dir> [out-file]
 *
 * Regenerate it whenever standalone/src/data/pages/social.json or the page changes:
 * build standalone/ first, then run this.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [, , distArg, outArg] = process.argv;
if (!distArg) {
  console.error('usage: node tools/social-page.mjs <astro-dist-dir> [out-file]');
  process.exit(1);
}

const dist = distArg;
const out = outArg ?? join(process.cwd(), 'social', 'index.html');
const src = join(dist, 'social', 'index.html');

if (!existsSync(src)) {
  console.error(`social-page: ${src} does not exist - build standalone/ first`);
  process.exit(1);
}

let doc = readFileSync(src, 'utf8');

/** Pull a built asset in off disk, by the URL the page asks for. */
const asset = (url) => readFileSync(join(dist, url.replace(/^\//, '')), 'utf8');

// Stylesheets: Astro emits one per page with inlineStylesheets:'never'.
doc = doc.replace(
  /<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"\s*\/?>/g,
  (_, href) => `<style>\n${asset(href)}\n</style>`,
);

// The module script, likewise.
doc = doc.replace(
  /<script type="module" src="(\/_astro\/[^"]+\.js)"><\/script>/g,
  (_, href) => `<script type="module">\n${asset(href)}\n</script>`,
);

// This branch serves the original static site at the root; the shop's assets sit
// under /new/. Point the two files the page needs at where they actually are.
doc = doc.replace(/\/assets\/fonts\/chunkfive\.woff2/g, '/new/assets/fonts/chunkfive.woff2');
doc = doc.replace(/href="\/assets\/blitzspirit-stamp\.png"/g, 'href="/new/assets/blitzspirit-stamp.png"');

// ---- assertions ----------------------------------------------------------
// Each one has been checked by breaking the thing it looks for.
const problems = [];

const stray = [...doc.matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);
if (stray.length) problems.push(`still references built assets: ${stray.slice(0, 3).join(', ')}`);

const social = JSON.parse(
  readFileSync(join(dist, '..', 'src', 'data', 'pages', 'social.json'), 'utf8'),
);
const ids = social.sections.flatMap((s) =>
  s.groups.flatMap((g) => g.entries.flatMap((e) => e.variants.map((v) => v.id))),
);
const missing = ids.filter((id) => !doc.includes(`data-line-id="${id}"`));
if (missing.length) problems.push(`${missing.length} line(s) missing, first: ${missing[0]}`);

if (!doc.includes('/api/social')) problems.push('editor is not wired to its endpoint');
if (!/name="robots"[^>]*noindex/.test(doc)) problems.push('not noindex');
if (!doc.includes('@font-face')) problems.push('stylesheet was not inlined');

if (problems.length) {
  console.error('social-page failed:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, doc);
console.log(`social-page: wrote ${out} - ${ids.length} lines, ${(doc.length / 1024).toFixed(0)}KB, self-contained`);
