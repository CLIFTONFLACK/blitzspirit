/**
 * test-content — the editor's field addressing, against the real data files.
 *
 * This is the piece that decides which bytes of the repo an edit rewrites, so it is
 * worth more than a smoke test: it must resolve a real address, refuse to invent a
 * field, refuse to walk outside the data directory, and refuse prototype pollution.
 *
 *   node tools/test-content.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import content from '../api/_content.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log('  ok   ', name);
  } catch (error) {
    failed++;
    console.error('  FAIL ', name, '->', error.message);
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const pagesIndex = () => load('standalone/src/data/pages/index.json');
const pagesAbout = () => load('standalone/src/data/pages/about.json');
const catalogue = () => load('standalone/src/data/catalogue.json');
const settings = () => load('standalone/src/data/settings.json');

console.log('address resolution:');

check('reads a page section setting by section id', () => {
  const value = content.readValue(pagesIndex(), 'pages/index:hero.settings.heading');
  assert(value.ok, value.error);
  assert(value.value === 'BUILT FOR THE STUBBORN.', `got ${JSON.stringify(value.value)}`);
});

check('reads a block setting by block id', () => {
  const value = content.readValue(pagesAbout(), 'pages/about:values.blocks.value-1.settings.heading');
  assert(value.ok, value.error);
  assert(value.value === 'No filler.', `got ${JSON.stringify(value.value)}`);
});

check('reads a product field by handle', () => {
  const value = content.readValue(catalogue(), 'catalogue:the-establishment.strapline');
  assert(value.ok, value.error);
  assert(value.value === 'colour print. The old guard in full regalia.', `got ${JSON.stringify(value.value)}`);
});

check('reads a dossier paragraph by index', () => {
  const value = content.readValue(catalogue(), 'catalogue:the-establishment.dossier.0');
  assert(value.ok, value.error);
  assert(value.value.startsWith('A Union Jack bowler'), `got ${JSON.stringify(value.value.slice(0, 30))}`);
});

check('reads a settings field', () => {
  const value = content.readValue(settings(), 'settings:outro.strapline');
  assert(value.ok, value.error);
  assert(value.value === '[ NOT HERE TO BE LIKED ]', `got ${JSON.stringify(value.value)}`);
});

console.log('');
console.log('writes:');

check('applies an edit and reports what changed', () => {
  const doc = pagesIndex();
  const result = content.applyEdit(doc, 'pages/index:hero.settings.heading', 'CARRY ON.');
  assert(result.ok, result.error);
  assert(result.from === 'BUILT FOR THE STUBBORN.', `from was ${result.from}`);
  const after = content.readValue(doc, 'pages/index:hero.settings.heading');
  assert(after.value === 'CARRY ON.', 'value did not persist into the document');
});

check('applies an edit to a dossier paragraph', () => {
  const doc = catalogue();
  const result = content.applyEdit(doc, 'catalogue:the-establishment.dossier.0', 'Changed.');
  assert(result.ok, result.error);
  assert(doc.products.find((p) => p.handle === 'the-establishment').dossier[0] === 'Changed.', 'not written');
});

check('groups edits by the file they land in', () => {
  const grouped = content.groupByFile([
    { address: 'catalogue:the-establishment.strapline', value: 'a' },
    { address: 'settings:outro.strapline', value: 'b' },
    { address: 'catalogue:the-stubborn.strapline', value: 'c' },
  ]);
  assert(grouped.ok, grouped.error);
  const files = Object.keys(grouped.groups).sort();
  assert(files.length === 2, `expected 2 files, got ${files.length}`);
  assert(grouped.groups['standalone/src/data/catalogue.json'].length === 2, 'catalogue group wrong');
});

console.log('');
console.log('refusals:');

const refuses = (doc, address, value, fragment) => {
  const result = value === undefined
    ? content.readValue(doc, address)
    : content.applyEdit(doc, address, value);
  assert(!result.ok, `accepted ${address}`);
  assert(
    result.error.includes(fragment),
    `error "${result.error}" does not mention "${fragment}"`
  );
};

check('refuses an unknown source file', () =>
  refuses(settings(), 'secrets:token', 'x', 'bad address'));
check('refuses a path traversal in the source', () =>
  refuses(settings(), 'pages/../../../etc/passwd:a', 'x', 'bad address'));
check('refuses an address with no pointer', () =>
  refuses(settings(), 'settings:', 'x', 'bad address'));
check('refuses __proto__ in the pointer', () =>
  refuses(settings(), 'settings:__proto__.polluted', 'x', 'bad address'));
check('refuses constructor in the pointer', () =>
  refuses(settings(), 'settings:constructor.prototype.x', 'x', 'bad address'));
check('refuses a field that does not exist', () =>
  refuses(settings(), 'settings:outro.nonexistent', 'x', 'not editable text'));
check('refuses a non-string target (would clobber structure)', () =>
  refuses(catalogue(), 'catalogue:the-establishment.variants', 'x', 'not editable text'));
check('refuses a number target', () =>
  refuses(catalogue(), 'catalogue:the-establishment.price', '1', 'not editable text'));
check('refuses a non-string new value', () =>
  refuses(settings(), 'settings:outro.strapline', 12345, 'must be a string'));
check('refuses an absurdly long value', () =>
  refuses(settings(), 'settings:outro.strapline', 'x'.repeat(8001), 'too long'));

// Social links are rendered as hrefs, so their values are held to a URL rule that
// the editor's markup check cannot provide.
for (const [label, value] of [
  ['a javascript: URL', 'javascript:alert(1)'],
  ['a mixed-case javascript: URL', 'JaVaScRiPt:alert(1)'],
  ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
  ['a protocol-relative URL', '//evil.example/x'],
  ['a relative path', '/somewhere'],
  ['a URL with a leading space', ' https://instagram.com/blitzspirit'],
  ['a URL with whitespace inside', 'https://instagram.com/blitz spirit'],
]) {
  check(`refuses ${label} for a social link`, () =>
    refuses(settings(), 'settings:social.instagram', value, 'not a safe url'));
}

for (const value of ['https://instagram.com/blitzspirit', 'http://x.com/blitzspirit', '#', '']) {
  check(`accepts ${JSON.stringify(value)} for a social link`, () => {
    const doc = settings();
    const result = content.applyEdit(doc, 'settings:social.instagram', value);
    assert(result.ok, `refused: ${result.error}`);
    assert(doc.social.instagram === value, 'value was not written');
  });
}

// The rule keys on the whole social group, not on instagram alone.
for (const key of ['tiktok', 'x', 'facebook']) {
  check(`refuses a javascript: URL for social.${key}`, () =>
    refuses(settings(), `settings:social.${key}`, 'javascript:alert(1)', 'not a safe url'));
}

for (const [label, value] of [
  ['an ftp: URL', 'ftp://example.com/x'],
  ['a scheme with nothing after it', 'https://'],
  ['a URL with a trailing newline', 'https://instagram.com/blitzspirit\n'],
  ['a URL with a tab inside', 'https://instagram.com/blitz\tspirit'],
  ['a bare domain', 'instagram.com/blitzspirit'],
]) {
  check(`refuses ${label} for a social link`, () =>
    refuses(settings(), 'settings:social.instagram', value, 'not a safe url'));
}

check('accepts an upper-case HTTPS scheme for a social link', () => {
  const result = content.applyEdit(settings(), 'settings:social.instagram', 'HTTPS://instagram.com/blitzspirit');
  assert(result.ok, `refused: ${result.error}`);
});

check('a refused social link leaves the stored value untouched', () => {
  const doc = settings();
  const before = doc.social.instagram;
  content.applyEdit(doc, 'settings:social.instagram', 'javascript:alert(1)');
  assert(doc.social.instagram === before, `changed to ${JSON.stringify(doc.social.instagram)}`);
});

check('the URL rule does not apply to ordinary copy', () => {
  const result = content.applyEdit(settings(), 'settings:outro.strapline', 'javascript: a word, not a link');
  assert(result.ok, `refused: ${result.error}`);
});

check('a refused edit leaves the document untouched', () => {
  const doc = settings();
  const before = JSON.stringify(doc);
  content.applyEdit(doc, 'settings:outro.nonexistent', 'x');
  content.applyEdit(doc, 'settings:__proto__.x', 'x');
  assert(JSON.stringify(doc) === before, 'document was mutated by a refused edit');
  assert({}.polluted === undefined, 'prototype was polluted');
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall content tests passed');
