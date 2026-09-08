/**
 * check-edit-ids — every data-line-id in the built site must be a field the editor
 * can actually save.
 *
 * The annotations live in the components and the resolver lives in api/_content.js;
 * nothing but this connects the two. Without it, a mistyped address ships happily and
 * only fails when someone edits that line and the save comes back 400 — at which
 * point the editor looks broken rather than the annotation.
 *
 *   node tools/check-edit-ids.mjs [dist-dir]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import content from '../api/_content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(root, 'standalone', 'dist');

if (!existsSync(dist)) {
  console.error(`check-edit-ids: ${dist} does not exist - build standalone/ first`);
  process.exit(1);
}

/** The documents an address can name, loaded once. */
const DOCS = {};
const dataDir = join(root, 'standalone', 'src', 'data');
const load = (key, path) => {
  if (existsSync(path)) DOCS[key] = JSON.parse(readFileSync(path, 'utf8'));
};
load('catalogue', join(dataDir, 'catalogue.json'));
load('settings', join(dataDir, 'settings.json'));
for (const file of readdirSync(join(dataDir, 'pages'))) {
  if (file.endsWith('.json')) load('pages/' + file.replace(/\.json$/, ''), join(dataDir, 'pages', file));
}

/* /social is another tool with its own id scheme and its own endpoint. Its ids are
   not addresses into this data and are none of this check's business. */
const NOT_OURS = ['/social/'];

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const seen = new Map(); // address -> Set of pages it appears on
for (const file of htmlFiles(dist)) {
  const page = file.slice(dist.length).replace(/\\/g, '/');
  const doc = readFileSync(file, 'utf8');
  if (NOT_OURS.some((prefix) => page.startsWith(prefix))) continue;
  for (const match of doc.matchAll(/data-line-id="([^"]+)"/g)) {
    const id = match[1];
    if (!seen.has(id)) seen.set(id, new Set());
    seen.get(id).add(page);
  }
}

const failures = [];
for (const [id, pages] of seen) {
  const where = [...pages].slice(0, 2).join(', ');

  const parsed = content.parseAddress(id);
  if (!parsed) {
    failures.push(`${id} — not a valid address (${where})`);
    continue;
  }
  if (!content.isEditableAddress(id)) {
    failures.push(`${id} — refused as a structural field (${where})`);
    continue;
  }
  const source = id.slice(0, id.indexOf(':'));
  const doc = DOCS[source];
  if (!doc) {
    failures.push(`${id} — no such data file: ${source} (${where})`);
    continue;
  }
  const read = content.readValue(doc, id);
  if (!read.ok) {
    failures.push(`${id} — ${read.error} (${where})`);
  }
}

if (failures.length) {
  console.error(`check-edit-ids: ${failures.length} unusable annotation(s):`);
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}

if (seen.size === 0) {
  console.error('check-edit-ids: no data-line-id found anywhere - the editor would have nothing to edit');
  process.exit(1);
}

const bySource = {};
for (const id of seen.keys()) {
  const source = id.slice(0, id.indexOf(':'));
  bySource[source] = (bySource[source] ?? 0) + 1;
}
const summary = Object.entries(bySource)
  .sort((a, b) => b[1] - a[1])
  .map(([s, n]) => `${s}=${n}`)
  .join(', ');

console.log(`check-edit-ids ok: ${seen.size} editable fields, all resolve (${summary})`);
