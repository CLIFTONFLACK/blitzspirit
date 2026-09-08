/**
 * edit-page — turn the built /edit page into a single file served at /edit/.
 *
 * The Vercel project publishes this repo as-is, and the shop's build output is
 * committed under new/. The editor needs to sit at /edit/, not /new/edit/, so it
 * ships the same way /social does: built by Astro, then flattened to one
 * self-contained file at the repo root.
 *
 * Self-contained matters here — it depends on nothing but the font and stamp the
 * site already serves, which is what makes it safe to drop into a tree it was not
 * built for.
 *
 *   node tools/edit-page.mjs <astro-dist-dir> [out-file]
 *
 * Regenerate whenever src/pages/edit.astro or src/scripts/edit-ui.js changes:
 * build standalone/ first, then run this.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [, , distArg, outArg] = process.argv;
if (!distArg) {
  console.error('usage: node tools/edit-page.mjs <astro-dist-dir> [out-file]');
  process.exit(1);
}

const dist = distArg;
const out = outArg ?? join(process.cwd(), 'edit', 'index.html');
const src = join(dist, 'edit', 'index.html');

if (!existsSync(src)) {
  console.error(`edit-page: ${src} does not exist - build standalone/ first`);
  process.exit(1);
}

let doc = readFileSync(src, 'utf8');

/** Pull a built asset in off disk, by the URL the page asks for. */
const asset = (url) => readFileSync(join(dist, url.replace(/^\/new\//, '').replace(/^\//, '')), 'utf8');

doc = doc.replace(
  /<link rel="stylesheet" href="([^"]+\.css)"\s*\/?>/g,
  (_, href) => `<style>\n${asset(href)}\n</style>`
);

doc = doc.replace(
  /<script type="module" src="([^"]+\.js)"><\/script>/g,
  (_, href) => `<script type="module">\n${asset(href)}\n</script>`
);

// ---- assertions ----------------------------------------------------------
// Each has been checked by breaking the thing it looks for.
const problems = [];

const stray = [...doc.matchAll(/(?:href|src)="([^"]*\/_astro\/[^"]+)"/g)].map((m) => m[1]);
if (stray.length) problems.push(`still references built assets: ${stray.slice(0, 3).join(', ')}`);

if (!doc.includes('data-page-picker')) problems.push('page picker is missing');
if (!doc.includes('data-frame')) problems.push('preview frame is missing');
if (!doc.includes('/api/edit')) problems.push('editor is not wired to its endpoint');
if (!/name="robots"[^>]*noindex/.test(doc)) problems.push('not noindex');
if (!doc.includes('@font-face')) problems.push('stylesheet was not inlined');
if (!doc.includes('data-line-id')) problems.push('the editor script lost its data-line-id contract');

// The frame has to point at the shop. If the shop ever moves, this catches a
// generator that was not regenerated with it.
const frameSrc = doc.match(/<iframe[^>]*\ssrc="([^"]*)"/);
if (!frameSrc) problems.push('frame has no src');
else if (!frameSrc[1].startsWith('/')) problems.push(`frame src is not absolute: ${frameSrc[1]}`);

if (problems.length) {
  console.error('edit-page failed:');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, doc);
console.log(
  `edit-page: wrote ${out} - frame at ${frameSrc[1]}, ${(doc.length / 1024).toFixed(0)}KB, self-contained`
);
