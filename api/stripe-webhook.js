// POST /api/stripe-webhook — a paid Stripe Checkout becomes a Printful order.
//
// Stripe signs every delivery; the signature covers the exact request bytes, so the
// body is read raw from the stream and req.body is never touched (in @vercel/node it
// is a lazy getter that would consume the stream). The exported bodyParser:false config
// is the Next.js-style opt-out, kept so the intent is explicit on any runtime that
// honours it. Verification uses node:crypto rather than the stripe package, to keep
// the project dependency-free like checkout.js.
//
// Status codes are what Stripe acts on: 2xx stops redelivery, anything else retries
// for up to three days, and an endpoint that keeps failing gets disabled - which would
// stop good orders too. So only a transient failure (network, 5xx, 429) returns 500.
// A failure that would repeat on every retry returns 200 and emails the owner instead.
//
// Fulfilled: checkout.session.completed when paid or zero-total, and
// checkout.session.async_payment_succeeded for delayed methods (Bacs, Pay by Bank),
// which complete unpaid and settle later. The Stripe endpoint must send both events.
//
// Test mode: a test-mode payment costs nothing (Stripe's test cards are public), so
// its events are ignored unless ALLOW_TEST_ORDERS is "true", and even then the order
// is always a draft - a test payment can never start real production.
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PRINTFUL_API_TOKEN (all required),
//      PRINTFUL_CONFIRM_ORDERS ("true" sends live orders straight to production;
//      anything else leaves them as drafts to confirm in the Printful dashboard),
//      ALLOW_TEST_ORDERS ("true" turns test-mode payments into draft orders),
//      ORDER_ALERT_EMAIL + RESEND_API_KEY (optional; without them alerts are logs only),
//      ORDER_ALERT_FROM (optional sender, default Resend's onboarding address).

var crypto = require('node:crypto');
var printful = require('./_printful.js');

var TOLERANCE_SECONDS = 300;
var FULFILLABLE_STATUS = { paid: true, no_payment_required: true };

function isFulfillable(event, session) {
  if (!session) return false;
  if (event.type === 'checkout.session.async_payment_succeeded') return true;
  return event.type === 'checkout.session.completed' && FULFILLABLE_STATUS[session.payment_status] === true;
}

/** Tell the owner an order needs a human. Carries ids and the reason only - never
 *  the customer's name or address. Never throws: the webhook's answer to Stripe must
 *  not depend on whether the alert went out. */
async function alertOwner(sessionId, reason) {
  var to = process.env.ORDER_ALERT_EMAIL;
  var key = process.env.RESEND_API_KEY;
  if (!to || !key) return;
  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ORDER_ALERT_FROM || 'BlitzSpirit orders <onboarding@resend.dev>',
        to: [to],
        subject: 'Paid order NOT sent to Printful: ' + sessionId,
        text:
          'Stripe Checkout Session ' + sessionId + ' was paid but could not be turned into a ' +
          'Printful order, and retrying will not fix it.\n\nReason: ' + reason +
          '\n\nCreate the order by hand in Printful, or refund it in Stripe.',
      }),
    });
    if (!response.ok) console.error('stripe-webhook: alert email rejected, HTTP ' + response.status);
  } catch (error) {
    console.error('stripe-webhook: alert email unreachable: ' + error.message);
  }
}

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    // Already drained by something upstream: 'end' will never fire again. Resolve empty
    // so the signature check fails with a 400 instead of hanging to the timeout.
    if (req.readableEnded) return resolve(Buffer.alloc(0));
    var chunks = [];
    req.on('data', function (chunk) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

/**
 * Stripe-Signature: t=<unix>,v1=<hex hmac>[,v1=...]. Valid when any v1 equals
 * HMAC-SHA256(secret, "<t>.<raw body>") and t is within the tolerance.
 */
function verifyStripeSignature(rawBody, header, secret, nowSeconds) {
  if (!header || !secret) return false;
  var timestamp = null;
  var signatures = [];
  String(header)
    .split(',')
    .forEach(function (part) {
      var i = part.indexOf('=');
      if (i === -1) return;
      var key = part.slice(0, i).trim();
      var value = part.slice(i + 1).trim();
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    });
  if (!/^\d+$/.test(timestamp || '') || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  var expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(rawBody)
    .digest();

  return signatures.some(function (hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
    return crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));
  });
}

async function fetchLineItems(sessionId, secretKey) {
  var url =
    'https://api.stripe.com/v1/checkout/sessions/' +
    encodeURIComponent(sessionId) +
    '/line_items?limit=100&expand[]=data.price.product';
  var response;
  try {
    response = await fetch(url, { headers: { Authorization: 'Bearer ' + secretKey } });
  } catch (error) {
    throw printful.FulfilmentError('Stripe unreachable: ' + error.message, true);
  }
  var body = await response.json().catch(function () {
    return null;
  });
  if (!response.ok || !body || !Array.isArray(body.data)) {
    throw printful.FulfilmentError(
      'Stripe line_items failed: HTTP ' + response.status,
      printful.isTransientStatus(response.status)
    );
  }
  return body.data;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  var webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  var secretKey = process.env.STRIPE_SECRET_KEY;
  var printfulToken = process.env.PRINTFUL_API_TOKEN;
  if (!webhookSecret || !secretKey || !printfulToken) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY or PRINTFUL_API_TOKEN not set');
    return res.status(500).end();
  }

  var raw = await readRawBody(req);
  var now = Math.floor(Date.now() / 1000);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'], webhookSecret, now)) {
    return res.status(400).json({ error: 'bad signature' });
  }

  var event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ error: 'bad payload' });
  }

  var session = event.data && event.data.object;
  if (!isFulfillable(event, session)) {
    return res.status(200).json({ ignored: event.type });
  }
  var live = event.livemode === true;
  if (!live && process.env.ALLOW_TEST_ORDERS !== 'true') {
    return res.status(200).json({ ignored: 'test-mode event' });
  }

  try {
    var lineItems = await fetchLineItems(session.id, secretKey);
    var order = printful.buildPrintfulOrder(session, lineItems);
    var result = await printful.submitOrder(order, {
      token: printfulToken,
      confirm: live && process.env.PRINTFUL_CONFIRM_ORDERS === 'true',
    });
    console.log(
      'stripe-webhook: ' + (result.created ? 'created' : 'already had') +
        ' Printful order ' + result.id + ' for ' + order.external_id
    );
    return res.status(200).json({ printfulOrder: result.id });
  } catch (error) {
    // Never log the event or the order body: they carry the customer's address.
    console.error('stripe-webhook: ' + session.id + ' not fulfilled: ' + error.message);
    if (error.transient) return res.status(500).json({ error: 'fulfilment failed, retry' });
    // Anything else, including an unexpected bug, fails the same way on every retry.
    await alertOwner(session.id, error.message);
    return res.status(200).json({ unfulfilled: session.id });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports.verifyStripeSignature = verifyStripeSignature;
