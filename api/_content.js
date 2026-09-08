// _content — resolve the editor's field addresses to real JSON locations.
//
// The inline editor marks editable text in the markup with
//   data-edit="<source>:<pointer>"
// e.g.
//   pages/index:hero.settings.heading
//   pages/about:split-started.settings.body
//   catalogue:the-cap.strapline
//   catalogue:the-cap.dossier.1
//   settings:outro.strapline
//
// A pointer is a dot path. Inside a page file the first segment is a SECTION ID,
// not an array index — templates address sections by id, and an id survives
// reordering where an index does not. Blocks are addressed the same way:
//   pages/about:values.blocks.value-2.settings.body
//
// Everything here is deliberately strict: an address that does not resolve to an
// existing string is rejected rather than creating a new field. The editor can only
// change copy that is already on the page.
//
// CommonJS, no dependencies, matching the rest of api/.

var PAGE_PREFIX = 'pages/';

/** Files the editor is allowed to touch, mapped to their path in the repo. */
function fileFor(source) {
  if (source === 'catalogue') return 'standalone/src/data/catalogue.json';
  if (source === 'settings') return 'standalone/src/data/settings.json';
  if (source.indexOf(PAGE_PREFIX) === 0) {
    var slug = source.slice(PAGE_PREFIX.length);
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    return 'standalone/src/data/pages/' + slug + '.json';
  }
  return null;
}

function parseAddress(address) {
  if (typeof address !== 'string') return null;
  var cut = address.indexOf(':');
  if (cut < 1) return null;
  var source = address.slice(0, cut);
  var pointer = address.slice(cut + 1);
  var file = fileFor(source);
  if (!file || !pointer) return null;
  var segments = pointer.split('.');
  if (segments.some(function (s) { return s === '' || s === '__proto__' || s === 'constructor' || s === 'prototype'; })) {
    return null;
  }
  return { source: source, file: file, segments: segments };
}

/** Step into a container by one segment, understanding the shapes these files use. */
function step(node, segment, source) {
  if (node === null || typeof node !== 'object') return undefined;

  // Page files: `sections` and `blocks` are arrays of objects carrying an id.
  if (Array.isArray(node)) {
    if (/^\d+$/.test(segment)) return node[Number(segment)];
    return node.find(function (item) {
      return item && (item.id === segment || item.handle === segment);
    });
  }

  // A page document addresses its sections by id without naming `sections`.
  if (source.indexOf(PAGE_PREFIX) === 0 && Array.isArray(node.sections) && !(segment in node)) {
    return step(node.sections, segment, source);
  }
  // The catalogue addresses products by handle without naming `products`.
  if (source === 'catalogue' && Array.isArray(node.products) && !(segment in node)) {
    return step(node.products, segment, source);
  }

  return node[segment];
}

/**
 * Read the current value at an address.
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
function readValue(document, address) {
  var parsed = parseAddress(address);
  if (!parsed) return { ok: false, error: 'bad address: ' + address };

  var node = document;
  for (var i = 0; i < parsed.segments.length - 1; i++) {
    node = step(node, parsed.segments[i], parsed.source);
    if (node === undefined || node === null) {
      return { ok: false, error: 'no such path: ' + address };
    }
  }

  var last = parsed.segments[parsed.segments.length - 1];
  var container = node;
  // The final step may still need the implicit sections/products hop.
  if (!Array.isArray(container) && typeof container === 'object' && !(last in container)) {
    if (parsed.source.indexOf(PAGE_PREFIX) === 0 && Array.isArray(container.sections)) {
      container = container.sections;
    } else if (parsed.source === 'catalogue' && Array.isArray(container.products)) {
      container = container.products;
    }
  }

  var value;
  if (Array.isArray(container)) {
    value = /^\d+$/.test(last)
      ? container[Number(last)]
      : (container.find(function (i) { return i && (i.id === last || i.handle === last); }));
  } else {
    value = container[last];
  }

  if (typeof value !== 'string') {
    return { ok: false, error: 'not editable text: ' + address };
  }
  return { ok: true, value: value, container: container, key: last };
}

/**
 * Apply an edit in place.
 * @returns {{ok: true, from: string, to: string} | {ok: false, error: string}}
 */
function applyEdit(document, address, nextValue) {
  if (typeof nextValue !== 'string') {
    return { ok: false, error: 'value must be a string: ' + address };
  }
  if (nextValue.length > 8000) {
    return { ok: false, error: 'value too long: ' + address };
  }

  var read = readValue(document, address);
  if (!read.ok) return read;

  var key = read.key;
  if (Array.isArray(read.container)) {
    if (!/^\d+$/.test(key)) return { ok: false, error: 'cannot write to a keyed array entry: ' + address };
    read.container[Number(key)] = nextValue;
  } else {
    read.container[key] = nextValue;
  }

  return { ok: true, from: read.value, to: nextValue };
}

/** Group a flat list of edits by the file each one lands in. */
function groupByFile(edits) {
  var groups = Object.create(null);
  for (var i = 0; i < edits.length; i++) {
    var parsed = parseAddress(edits[i] && edits[i].address);
    if (!parsed) return { ok: false, error: 'bad address: ' + (edits[i] && edits[i].address) };
    if (!groups[parsed.file]) groups[parsed.file] = [];
    groups[parsed.file].push(edits[i]);
  }
  return { ok: true, groups: groups };
}

/** Keys that are structure, not copy. A handle or a SKU is a string, so the
 *  "must be a string" rule alone would let the editor rewrite one and break every
 *  link or order line that depends on it. */
var STRUCTURAL_KEYS = [
  'handle', 'id', 'sku', 'code', 'kind', 'type', 'src', 'url', 'colour', 'hex',
  'display', 'value', 'name', 'image', 'link', 'cta_link', 'anchor', 'product',
  'collection', 'template', 'issue', 'indexRef',
];

/**
 * Is this address something the copy editor may rewrite?
 * Structural fields are refused even though they are strings.
 */
function isEditableAddress(address) {
  var parsed = parseAddress(address);
  if (!parsed) return false;
  var last = parsed.segments[parsed.segments.length - 1];
  // An array index is fine (dossier paragraphs); a structural key never is.
  if (/^\d+$/.test(last)) return true;
  return STRUCTURAL_KEYS.indexOf(last) === -1;
}

module.exports = {
  fileFor: fileFor,
  isEditableAddress: isEditableAddress,
  STRUCTURAL_KEYS: STRUCTURAL_KEYS,
  parseAddress: parseAddress,
  readValue: readValue,
  applyEdit: applyEdit,
  groupByFile: groupByFile,
};
