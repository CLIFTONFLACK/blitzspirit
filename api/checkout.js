// POST /api/checkout — create a Stripe Checkout Session for the standalone shop
// served at /new/.
//
// The request carries only variant ids and quantities. Every price, title and SKU is
// re-read from the committed catalogue in _order.js: a shopper who edits localStorage
// changes what they are buying, never what they pay.
//
// Stripe is called over its REST API with plain fetch rather than the `stripe`
// package, so this project stays dependency-free — it has no package.json and no
// build step, and introducing either would change how Vercel builds the original
// site that still lives at the domain root.
//
// UK specifics, matching the Shopify store this replaces:
//  - prices are VAT-inclusive, so line items and shipping use tax_behavior=inclusive
//  - delivery is £3.95, free at £40 and over, decided from the server-side subtotal
//  - BACKBONE10 is a Stripe promotion code; allow_promotion_codes shows the field
//
// Env: STRIPE_SECRET_KEY (required), PUBLIC_SITE_URL (optional).

var order = require('./_order.js');
var settings = require('../standalone/src/data/settings.json');

var STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';

/** Stripe takes form-encoded bodies with bracketed paths for nested values,
 *  e.g. line_items[0][price_data][unit_amount]=2200 */
function formEncode(value, prefix, out) {
  out = out || [];
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach(function (item, i) {
      formEncode(item, prefix + '[' + i + ']', out);
    });
    return out;
  }

  if (typeof value === 'object') {
    Object.keys(value).forEach(function (key) {
      formEncode(value[key], prefix ? prefix + '[' + key + ']' : key, out);
    });
    return out;
  }

  out.push(encodeURIComponent(prefix) + '=' + encodeURIComponent(String(value)));
  return out;
}

function toBody(params) {
  return formEncode(params, '').join('&');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  var secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Loud on the server, vague to the shopper — cart.js shows its own message.
    console.error('checkout: STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'checkout unavailable' });
  }

  var body = req.body || {};
  var built;
  try {
    built = order.buildOrder(body.lines);
  } catch (error) {
    if (error && error.isOrderError) {
      return res.status(error.status).json({ error: error.message });
    }
    throw error;
  }

  var origin =
    process.env.PUBLIC_SITE_URL ||
    (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;

  var params = {
    mode: 'payment',
    currency: settings.shop.currency.toLowerCase(),
    allow_promotion_codes: 'true',
    line_items: built.lineItems,
    shipping_options: [built.shippingOption],
    shipping_address_collection: { allowed_countries: [settings.shop.country] },
    success_url: origin + '/new/checkout/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: origin + '/new/checkout/cancelled',
    metadata: {
      subtotal_pence: String(built.subtotal),
      line_count: String(built.lineItems.length),
    },
  };

  try {
    var response = await fetch(STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toBody(params),
    });

    var session = await response.json();
    if (!response.ok || !session.url) {
      console.error('checkout: stripe rejected', response.status, session && session.error);
      return res.status(502).json({ error: 'checkout unavailable' });
    }

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('checkout: stripe unreachable', error);
    return res.status(502).json({ error: 'checkout unavailable' });
  }
};

// Exported for tools/test-order.mjs, which checks the encoding without calling Stripe.
module.exports.toBody = toBody;
