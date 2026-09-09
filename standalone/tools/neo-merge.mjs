/**
 * neo-merge — fold the neomorphic build into the main one at dist/neomorphism/.
 *
 * The two editions are two Astro builds of the same source (see
 * astro.neo.config.mjs). Astro does not nest its output under `base`, so the neo
 * build writes a complete site to dist-neo/ whose URLs all begin /neomorphism.
 * Moving that directory to dist/neomorphism/ is the whole merge: every path it
 * emits then resolves to the file it names.
 *
 * The neo edition carries its own _astro/ and assets/ rather than borrowing the
 * shop's. That is a few hundred KB of duplication and it buys something worth more:
 * the edition is self-contained, so publishing, cache-busting and deleting it are
 * each a single directory operation with nothing else to keep in step.
 *
 *   node tools/neo-merge.mjs
 */
import { cp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist-neo');
const dist = join(root, 'dist');
const dest = join(dist, 'neomorphism');

if (!existsSync(src)) {
  console.error('neo-merge: dist-neo/ does not exist - run the neo build first');
  process.exit(1);
}
if (!existsSync(dist)) {
  console.error('neo-merge: dist/ does not exist - run the main build first');
  process.exit(1);
}

const entries = await readdir(src);
if (!entries.length) {
  console.error('neo-merge: the neo build produced nothing');
  process.exit(1);
}

// dist/neomorphism is written by this script and by nothing else, so replacing it
// wholesale cannot lose anyone's work. Removing it first means a page deleted from
// the source disappears from the edition too, instead of lingering as a stale file
// that still returns 200.
await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
await rm(src, { recursive: true, force: true });

console.log(`neo-merge: ${entries.length} entries -> dist/neomorphism/`);
