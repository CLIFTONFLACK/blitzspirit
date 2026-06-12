module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  var body = req.body || {};
  var comment     = String(body.comment || '').trim().slice(0, 2000);
  var page        = String(body.page  || '/').slice(0, 200);
  var theme       = body.theme === 'light' ? 'light' : 'dark';
  var type        = ['general','comment','edit'].includes(body.type) ? body.type : 'general';
  var quote       = body.quote       ? String(body.quote).trim().slice(0, 2000)       : null;
  var replacement = body.replacement ? String(body.replacement).trim().slice(0, 2000) : null;

  if (!comment) return res.status(400).end();

  var key = process.env.SUPABASE_ANON_KEY;
  if (!key) return res.status(500).end();

  var payload = { comment: comment, page: page, theme: theme, type: type };
  if (quote)       payload.quote       = quote;
  if (replacement) payload.replacement = replacement;

  var r = await fetch(
    'https://ojrzxknkovkiafzejegy.supabase.co/rest/v1/feedback',
    {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }
  );

  res.status(r.ok ? 201 : 500).end();
};
