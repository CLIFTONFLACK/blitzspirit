// _github — commit files to the repo through the GitHub API.
//
// Uses the Git Data API rather than the simpler contents endpoint, because an edit
// can touch several JSON files at once and those must land as ONE commit. Committing
// them one at a time would leave the repo briefly inconsistent and would produce a
// commit per file in the history.
//
// Env:
//   GITHUB_TOKEN  fine-grained PAT, Contents: read and write, this repo only
//   GITHUB_REPO   "owner/name"        (default CLIFTONFLACK/blitzspirit)
//   GITHUB_BRANCH branch to commit to (default main)
//
// The token is only ever held server-side. Note what bounds the damage if it leaked:
// this module is only ever called by api/edit.js, which will only rewrite specific
// string fields in specific JSON files - it cannot write an arbitrary path.
//
// CommonJS, no dependencies, matching the rest of api/.

var API = 'https://api.github.com';

function config() {
  var token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    token: token,
    repo: process.env.GITHUB_REPO || 'CLIFTONFLACK/blitzspirit',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

function notConfigured() {
  var e = new Error('GITHUB_TOKEN not configured');
  e.notConfigured = true;
  return e;
}

async function call(cfg, path, options) {
  var res = await fetch(API + path, Object.assign({}, options, {
    headers: Object.assign({
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'blitzspirit-editor',
      'Content-Type': 'application/json',
    }, (options && options.headers) || {}),
  }));

  var text = await res.text();
  var json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    var e = new Error('github ' + res.status + ' on ' + path);
    e.status = res.status;
    e.detail = json && json.message;
    // Which call was refused separates the causes: a denial on the very first
    // write (blobs) is a missing Contents:write permission, whereas reads
    // succeeding and only the final ref update failing points at branch
    // protection instead.
    e.step = (options && options.method ? options.method : 'GET') + ' ' + path.split('?')[0];
    throw e;
  }
  return json;
}

/** Read a file's current text at the branch head. */
async function readFile(path) {
  var cfg = config();
  if (!cfg) throw notConfigured();
  var data = await call(
    cfg,
    '/repos/' + cfg.repo + '/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(cfg.branch),
    { method: 'GET' }
  );
  return Buffer.from(data.content, 'base64').toString('utf8');
}

/**
 * Commit several files in one commit.
 * @param {{path: string, content: string}[]} files
 * @param {string} message
 * @returns {Promise<{sha: string, url: string}>}
 */
/** Can this token actually publish? Asks GitHub rather than assuming.
 *
 *  Note the repo endpoint's `permissions` describe the ACCOUNT's access, not the
 *  token's granted scopes - a read-only fine-grained PAT on an admin's repo still
 *  reports admin:true. So this probes the write path itself, with a request that
 *  changes nothing: creating an empty blob is inert unless a tree references it. */
async function canWrite() {
  var cfg = config();
  if (!cfg) throw notConfigured();
  try {
    await call(cfg, '/repos/' + cfg.repo + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: '', encoding: 'utf-8' }),
    });
    return true;
  } catch (error) {
    if (error.status === 403 || error.status === 404) return false;
    throw error;
  }
}

async function commitFiles(files, message) {
  var cfg = config();
  if (!cfg) throw notConfigured();
  if (!files.length) throw new Error('nothing to commit');

  var base = '/repos/' + cfg.repo;

  // 1. where the branch currently points
  var ref = await call(cfg, base + '/git/ref/heads/' + encodeURIComponent(cfg.branch), { method: 'GET' });
  var headSha = ref.object.sha;

  // 2. the tree that commit points at
  var headCommit = await call(cfg, base + '/git/commits/' + headSha, { method: 'GET' });

  // 3. a blob per changed file
  var blobs = [];
  for (var i = 0; i < files.length; i++) {
    var blob = await call(cfg, base + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: files[i].content, encoding: 'utf-8' }),
    });
    blobs.push({ path: files[i].path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 4. a tree on top of the current one
  var tree = await call(cfg, base + '/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: blobs }),
  });

  // 5. the commit
  var commit = await call(cfg, base + '/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: message, tree: tree.sha, parents: [headSha] }),
  });

  // 6. move the branch. Not forced: if someone else pushed in the meantime this
  //    fails rather than discarding their commit, and the editor retries.
  await call(cfg, base + '/git/refs/heads/' + encodeURIComponent(cfg.branch), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    sha: commit.sha,
    url: 'https://github.com/' + cfg.repo + '/commit/' + commit.sha,
  };
}

/** Turn a thrown error into the right response, without leaking the token. */
function respond(res, error) {
  if (error && error.notConfigured) {
    console.error('github: ' + error.message);
    return res.status(501).json({ error: 'publishing not configured' });
  }
  if (error && error.status === 409) {
    console.error('github: ref moved under us', error.detail);
    return res.status(409).json({ error: 'someone else saved first - reload and try again' });
  }
  console.error('github: ' + (error && error.message), error && error.detail);
  // Pass GitHub's own status and message through. They describe the REQUEST - a
  // missing permission, a protected branch - and never contain the token. A bare
  // "could not publish" leaves whoever set the token up with nothing to go on.
  return res.status(502).json({
    error: 'could not publish',
    githubStatus: error && error.status,
    githubSays: error && error.detail,
    failedAt: error && error.step,
  });
}

module.exports = {
  configured: function () { return config() !== null; },
  repo: function () { var c = config(); return c && c.repo; },
  branch: function () { var c = config(); return c && c.branch; },
  readFile: readFile,
  canWrite: canWrite,
  commitFiles: commitFiles,
  respond: respond,
};
