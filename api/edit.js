// edit — the save endpoint behind the inline copy editor at /edit/.
//
// The repo IS the store. An edit rewrites the string in the committed JSON under
// standalone/src/data/ and commits it; a GitHub Action rebuilds the site and commits
// the output; Vercel publishes it. So there is no second copy of the copy, no
// override table to drift, no runtime fetch and no flash of stale text — and the
// edit history is the git history, revertible with `git revert`.
//
// A field is addressed the way _content.js describes:
//   pages/index:hero.settings.heading
//   catalogue:the-cap.strapline
//   catalogue:the-cap.dossier.1
//
// The page is deliberately open — no password, by decision — so validation is the
// only line of defence and it is strict:
//   - the address must resolve to a string that already EXISTS in the committed JSON,
//     so an edit can never add a field or write an arbitrary path
//   - structural fields (handle, sku, url, price…) are refused even though some are
//     strings, because rewriting one breaks links or order lines
//   - hard length cap, and markup is refused outright
// That is what bounds the token: it can commit, but this function will only ever
// hand it a JSON file with one known string changed.
//
// Set EDIT_PASSWORD to require a password; leave it unset and the editor stays open.
//
// CommonJS, no dependencies, matching the rest of api/.

var content = require('./_content.js');
var github = require('./_github.js');

var MAX_EDITS = 60;
var MAX_LEN = 4000;

/** Sources the editor may touch, and the file each one lives in. */
var SOURCES = [
  'catalogue',
  'settings',
  'pages/index',
  'pages/about',
  'pages/story',
  'pages/help',
  'pages/contact',
  'pages/icons',
  'pages/link-in-bio',
];

/** Normalise the way a browser's contenteditable hands text back. */
function clean(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    // Control characters other than newline have no business in body copy.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sourceOf(address) {
  var cut = address.indexOf(':');
  return cut < 1 ? null : address.slice(0, cut);
}

module.exports = async function handler(req, res) {
  var required = process.env.EDIT_PASSWORD;
  if (required) {
    var supplied = (req.body && req.body.password) || req.headers['x-edit-password'] || '';
    if (String(supplied) !== String(required)) return res.status(401).json({ error: 'wrong password' });
  }

  if (req.method === 'GET') {
    // ?ids=a,b,c returns the STORED value of each field. The editor needs this
    // because rendered text is not the value: dossier paragraphs carry **bold**
    // markers that render as <strong>, editorial bodies carry newlines that render
    // as <br>, titles are upper-cased, and several tags are wrapped in literal
    // brackets by the template. Editing the rendered text would write all of that
    // back into the JSON.
    var idsParam = req.query && req.query.ids;
    if (idsParam) {
      var ids = String(idsParam).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (ids.length > 400) return res.status(400).json({ error: 'too many ids' });

      var byFile = {};
      ids.forEach(function (id) {
        if (!content.isEditableAddress(id)) return;
        var src = sourceOf(id);
        if (!src || SOURCES.indexOf(src) === -1) return;
        var parsed = content.parseAddress(id);
        if (!parsed) return;
        (byFile[parsed.file] = byFile[parsed.file] || []).push(id);
      });

      return readValues(byFile).then(function (values) {
        res.status(200).json({ values: values });
      }, function (error) {
        github.respond(res, error);
      });
    }

    // ?probe=1 asks GitHub what this token can actually do here, which is the
    // quickest way to tell a read-only token from a repo it cannot see at all.
    if (req.query && req.query.probe) {
      // Deliberately narrow: whether this token can publish, not the account's
      // full permission set. /edit/ is ungated, so it says the least that is
      // still useful for setting the token up.
      return github.canWrite().then(
        function (ok) {
          res.status(200).json({
            repo: github.repo(),
            branch: github.branch(),
            canPublish: ok,
            hint: ok ? undefined : 'the token needs Contents: Read and write on this repository',
          });
        },
        function (error) { github.respond(res, error); }
      );
    }

    return res.status(200).json({
      configured: github.configured(),
      repo: github.repo(),
      branch: github.branch(),
      sources: SOURCES,
    });
  }

  if (req.method !== 'POST') return res.status(405).end();

  var body = req.body || {};
  if (String(body.op || 'save') !== 'save') return res.status(400).json({ error: 'unknown op' });

  var edits = Array.isArray(body.edits) ? body.edits : [];
  if (!edits.length) return res.status(400).json({ error: 'no edits' });
  if (edits.length > MAX_EDITS) return res.status(400).json({ error: 'too many edits at once' });

  // ---- validate every edit before touching anything -----------------------
  var wanted = {};
  for (var i = 0; i < edits.length; i++) {
    var edit = edits[i] || {};
    var id = String(edit.id || '');
    var source = sourceOf(id);

    if (!source || SOURCES.indexOf(source) === -1) {
      return res.status(400).json({ error: 'unknown source: ' + id });
    }
    if (!content.isEditableAddress(id)) {
      return res.status(400).json({ error: 'not an editable field: ' + id });
    }
    if (Object.prototype.hasOwnProperty.call(wanted, id)) {
      return res.status(400).json({ error: 'the same field twice: ' + id });
    }

    var text = typeof edit.text === 'string' ? clean(edit.text) : '';
    if (!text) return res.status(400).json({ error: 'empty field: ' + id });
    if (text.length > MAX_LEN) return res.status(400).json({ error: 'too long: ' + id });
    if (/<[a-z/!]/i.test(text)) return res.status(400).json({ error: 'markup is not allowed: ' + id });

    wanted[id] = text;
  }

  try {
    // ---- read the files these edits land in, at the branch head ------------
    var grouped = content.groupByFile(
      Object.keys(wanted).map(function (id) { return { address: id }; })
    );
    if (!grouped.ok) return res.status(400).json({ error: grouped.error });

    var files = [];
    var changed = 0;
    var paths = Object.keys(grouped.groups);

    for (var f = 0; f < paths.length; f++) {
      var path = paths[f];
      var raw = await github.readFile(path);
      var doc = JSON.parse(raw);
      var touched = 0;

      var addresses = grouped.groups[path].map(function (e) { return e.address; });
      for (var a = 0; a < addresses.length; a++) {
        var address = addresses[a];
        var result = content.applyEdit(doc, address, wanted[address]);
        if (!result.ok) {
          // Two different failures wear the same shape here. A field that is not
          // text - a price, a count, a nested object - was never editable and never
          // will be, so that is the caller's mistake (400). Anything else means the
          // address resolved against the deployed data a moment ago but not against
          // the repo now, which means the repo moved under us (409).
          var permanent =
            result.error.indexOf('not editable text') === 0 ||
            result.error.indexOf('no such path') === 0;
          if (permanent) return res.status(400).json({ error: result.error });
          return res.status(409).json({ error: result.error + ' - reload and try again' });
        }
        if (result.from !== result.to) touched++;
      }

      if (touched) {
        files.push({ path: path, content: JSON.stringify(doc, null, 2) + '\n' });
        changed += touched;
      }
    }

    if (!files.length) {
      return res.status(200).json({ committed: false, changed: 0, message: 'nothing differed' });
    }

    var summary = changed === 1 ? 'one field' : changed + ' fields';
    var commit = await github.commitFiles(
      files,
      'Edit copy: ' + summary + '\n\n' +
        Object.keys(wanted).sort().map(function (id) { return '- ' + id; }).join('\n') +
        '\n\nMade through the inline editor at /edit/.'
    );

    return res.status(200).json({
      committed: true,
      changed: changed,
      files: files.map(function (x) { return x.path; }),
      commit: commit.sha.slice(0, 7),
      url: commit.url,
    });
  } catch (error) {
    return github.respond(res, error);
  }
};

/** The stored value for each requested address, read from the branch head. */
async function readValues(byFile) {
  var out = {};
  var paths = Object.keys(byFile);
  for (var i = 0; i < paths.length; i++) {
    var doc = JSON.parse(await github.readFile(paths[i]));
    byFile[paths[i]].forEach(function (id) {
      var read = content.readValue(doc, id);
      if (read.ok) out[id] = read.value;
    });
  }
  return out;
}

// Exported for tools/test-edit.mjs.
module.exports.clean = clean;
module.exports.SOURCES = SOURCES;
