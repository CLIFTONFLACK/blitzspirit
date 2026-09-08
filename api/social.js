// social — read and write the copy-dossier overrides behind /social.
//
// The canonical copy is standalone/src/data/pages/social.json, committed and built
// into the page. This function stores only the DIFFERENCES from it, one row per
// changed line, so:
//   - a line nobody has touched has no row at all
//   - reverting a line deletes its row rather than storing a second copy
//   - if this table were emptied tomorrow, the page would still render correctly
//
// The page is deliberately open: no password, by decision. That makes server-side
// validation the only line of defence, so it is strict — the id must already exist
// in the committed JSON, the text has a hard length cap, and markup is refused. The
// worst a stranger can do is change wording that a Revert click puts back.
//
// CommonJS, no dependencies, matching the rest of api/.

var seed = require('../standalone/src/data/pages/social.json');

var SUPABASE_URL = 'https://ojrzxknkovkiafzejegy.supabase.co';
var TABLE = 'social_copy';

var MAX_EDITS = 60;
var MAX_LEN = 1000;

/** Every line id the committed page actually has, with its canonical text. */
var SEED = (function () {
  var map = Object.create(null);
  (seed.sections || []).forEach(function (section) {
    (section.groups || []).forEach(function (group) {
      (group.entries || []).forEach(function (entry) {
        (entry.variants || []).forEach(function (variant) {
          map[variant.id] = variant.text;
        });
      });
    });
  });
  return map;
})();

module.exports = async function handler(req, res) {
  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not set' });

  var headers = {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ overrides: await readOverrides(headers) });
    }

    if (req.method !== 'POST') return res.status(405).end();

    var body = req.body || {};
    var op = String(body.op || '');

    // ---- revert -----------------------------------------------------------
    if (op === 'revert') {
      var ids = Array.isArray(body.ids) ? body.ids : [];
      ids = ids.filter(function (id) {
        return typeof id === 'string' && id in SEED;
      });
      if (!ids.length) return res.status(400).json({ error: 'no known ids' });
      if (ids.length > MAX_EDITS) return res.status(400).json({ error: 'too many ids' });

      await remove(ids, headers);
      return res.status(200).json({ overrides: await readOverrides(headers) });
    }

    // ---- save -------------------------------------------------------------
    if (op === 'save') {
      var edits = Array.isArray(body.edits) ? body.edits : [];
      if (!edits.length) return res.status(400).json({ error: 'no edits' });
      if (edits.length > MAX_EDITS) return res.status(400).json({ error: 'too many edits at once' });

      var rows = [];
      var reverts = [];

      for (var i = 0; i < edits.length; i++) {
        var edit = edits[i] || {};
        var id = String(edit.id || '');
        if (!(id in SEED)) return res.status(400).json({ error: 'unknown line: ' + id });

        var text = typeof edit.text === 'string' ? clean(edit.text) : '';
        if (!text) return res.status(400).json({ error: 'empty line: ' + id });
        if (text.length > MAX_LEN) return res.status(400).json({ error: 'line too long: ' + id });
        if (/<[a-z/!]/i.test(text)) return res.status(400).json({ error: 'markup is not allowed: ' + id });

        // Editing a line back to what the repo says is a revert, not a new value.
        if (text === clean(SEED[id])) reverts.push(id);
        else rows.push({ id: id, text: text, updated_at: new Date().toISOString() });
      }

      if (reverts.length) await remove(reverts, headers);
      if (rows.length) {
        var ur = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE, {
          method: 'POST',
          headers: Object.assign({}, headers, {
            Prefer: 'resolution=merge-duplicates,return=minimal',
          }),
          body: JSON.stringify(rows),
        });
        if (!ur.ok) return res.status(502).json({ error: 'store rejected the write' });
      }

      return res.status(200).json({ saved: rows.length, reverted: reverts.length, overrides: await readOverrides(headers) });
    }

    return res.status(400).json({ error: 'unknown op' });
  } catch (err) {
    return res.status(500).json({ error: 'unavailable' });
  }
};

/** Normalise the way a browser's contenteditable hands text back. */
function clean(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    // Control characters other than newline have no business in a caption.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readOverrides(headers) {
  var r = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=id,text', { headers: headers });
  if (!r.ok) throw new Error('read failed');
  var rows = await r.json();

  var out = {};
  rows.forEach(function (row) {
    // A row whose id has since been removed from the JSON is ignored, not served.
    if (row && typeof row.id === 'string' && row.id in SEED) out[row.id] = row.text;
  });
  return out;
}

async function remove(ids, headers) {
  var list = ids
    .map(function (id) {
      return '"' + id.replace(/"/g, '') + '"';
    })
    .join(',');
  var r = await fetch(
    SUPABASE_URL + '/rest/v1/' + TABLE + '?id=in.(' + encodeURIComponent(list) + ')',
    { method: 'DELETE', headers: Object.assign({}, headers, { Prefer: 'return=minimal' }) },
  );
  if (!r.ok) throw new Error('delete failed');
}
