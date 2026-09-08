// POST /api/newsletter — add an email to the Home Guard list.
//
// Replaces Shopify's {% form 'customer' %}, which created a customer record with the
// "newsletter" tag. Resend is the provider: it is already the estate's email service
// and its Audiences API is a direct swap for what the tag did.
//
// Env: RESEND_API_KEY and RESEND_AUDIENCE_ID.
//
// If either is missing this returns 501 rather than pretending to have stored the
// address. The form then shows its error state, which is the truth — a signup that
// silently goes nowhere is worse than a visible failure.
//
// CommonJS with no dependencies, matching the other functions in this directory.

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  var apiKey = process.env.RESEND_API_KEY;
  var audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    console.error('newsletter: RESEND_API_KEY / RESEND_AUDIENCE_ID not configured');
    return res.status(501).json({ error: 'newsletter not configured' });
  }

  var body = req.body || {};
  var email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  try {
    var response = await fetch(
      'https://api.resend.com/audiences/' + audienceId + '/contacts',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email, unsubscribed: false }),
      }
    );

    // Resend returns 422 when the contact already exists. Re-subscribing is not an
    // error from the shopper's point of view — they get the same success state.
    if (!response.ok && response.status !== 422) {
      var detail = await response.text();
      console.error('newsletter: resend rejected', response.status, detail);
      return res.status(502).json({ error: 'signup failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('newsletter: resend unreachable', error);
    return res.status(502).json({ error: 'signup failed' });
  }
};
