// BlitzSpirit feedback admin — password-gated serverless proxy.
// The Supabase service-role key never leaves the server; the browser only ever
// sends the admin password. All DB access is funnelled through here so the
// client can't touch Supabase (or arbitrary columns) directly.

var SUPABASE_URL = 'https://ojrzxknkovkiafzejegy.supabase.co';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  var body = req.body || {};
  var password = String(body.password || '');
  var op       = String(body.op || '');

  // ---- auth ---------------------------------------------------------------
  var expected = process.env.ADMIN_PASSWORD || '2026';
  if (!safeEqual(password, expected)) return res.status(401).end();

  var key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not set' });

  var headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  try {
    // ---- list ------------------------------------------------------------
    if (op === 'list') {
      var lr = await fetch(SUPABASE_URL + '/rest/v1/feedback?order=created_at.desc', { headers: headers });
      if (!lr.ok) return res.status(502).end();
      var rows = await lr.json();
      return res.status(200).json(rows);
    }

    // ---- update (approve / apply / dismiss) ------------------------------
    if (op === 'update') {
      var id = String(body.id || '');
      if (!id) return res.status(400).json({ error: 'missing id' });

      // Whitelist: only these mutations are ever allowed from the client.
      var patch = {};
      if (body.approved === true) {
        patch.approved = true;
      } else if (body.status === 'applied' || body.status === 'dismissed') {
        patch.status = body.status;
      } else {
        return res.status(400).json({ error: 'invalid update' });
      }

      var ur = await fetch(SUPABASE_URL + '/rest/v1/feedback?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(patch)
      });
      return res.status(ur.ok ? 200 : 502).end();
    }

    // ---- run processor now ----------------------------------------------
    if (op === 'run') {
      var rr = await fetch(SUPABASE_URL + '/rest/v1/run_queue?id=eq.1', {
        method: 'PATCH',
        headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ requested: true, requested_at: new Date().toISOString() })
      });
      return res.status(rr.ok ? 200 : 502).end();
    }

    return res.status(400).json({ error: 'unknown op' });
  } catch (e) {
    return res.status(500).end();
  }
};

// Length-independent equality so timing doesn't leak the password length.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
