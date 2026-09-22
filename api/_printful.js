// _printful — turn a paid Stripe Checkout Session into a Printful order.
//
// Shared by api/stripe-webhook.js and tools/test-printful.mjs. CommonJS with no
// dependencies, like _order.js; the leading underscore keeps Vercel from routing it.
//
// Idempotency: the Printful order's external_id is derived from the Stripe payment
// (see externalId), and submitOrder looks that id up before creating anything. Stripe
// redelivers a webhook until it gets a 2xx, so the same payment can arrive several
// times and must still produce one order.
//
// Every error thrown here is a FulfilmentError. `transient: true` means a retry may
// succeed (network, 5xx, 429); anything else will fail identically on every retry.

var crypto = require('node:crypto');
var catalogue = require('../standalone/src/data/catalogue.json');

var PRINTFUL_API = 'https://api.printful.com';
var USER_AGENT = 'blitzspirit-webhook/1.0';

/** Printful requires a state code only for these; elsewhere Stripe's free-text
 *  county would be rejected, so it is left out. */
var STATE_REQUIRED = { US: true, CA: true, AU: true };

/** catalogue variant id -> Printful sync variant id, built once per cold start. */
var printfulIds = new Map();
catalogue.products.forEach(function (product) {
  product.variants.forEach(function (variant) {
    printfulIds.set(variant.id, variant.printfulVariantId);
  });
});

function FulfilmentError(message, transient) {
  var error = new Error(message);
  error.name = 'FulfilmentError';
  error.isFulfilmentError = true;
  error.transient = Boolean(transient);
  return error;
}

function isTransientStatus(status) {
  return status === 429 || status >= 500;
}

/** Printful caps external_id at 32 characters. A PaymentIntent id fits; a session id
 *  does not, and a zero-total session (100% promotion code) has no PaymentIntent, so
 *  that case uses a stable hash of the session id instead. */
function externalId(session) {
  if (typeof session.payment_intent === 'string' && session.payment_intent) {
    return session.payment_intent;
  }
  if (typeof session.id === 'string' && session.id) {
    return 'cs-' + crypto.createHash('sha256').update(session.id).digest('hex').slice(0, 29);
  }
  throw FulfilmentError('session has neither a payment_intent nor an id');
}

/** Stripe moved shipping details under collected_information; older API versions
 *  still send them at the top level. */
function shippingDetails(session) {
  return (
    (session.collected_information && session.collected_information.shipping_details) ||
    session.shipping_details ||
    null
  );
}

/**
 * @param {object} session  Stripe Checkout Session (checkout.session.completed)
 * @param {object[]} lineItems  Stripe line items, with data.price.product expanded
 * @returns {object} body for POST /orders
 */
function buildPrintfulOrder(session, lineItems) {
  var shipping = shippingDetails(session);
  if (!shipping || !shipping.address) {
    throw FulfilmentError('session ' + session.id + ' has no shipping address');
  }
  var address = shipping.address;
  var customer = session.customer_details || {};

  var items = (lineItems || []).map(function (item) {
    var product = item.price && item.price.product;
    var variantId = product && product.metadata && product.metadata.variant_id;
    if (!variantId) throw FulfilmentError('line item ' + item.id + ' carries no variant_id');
    var syncVariantId = printfulIds.get(variantId);
    if (!syncVariantId) {
      throw FulfilmentError('variant ' + variantId + ' has no Printful variant');
    }
    return { sync_variant_id: syncVariantId, quantity: item.quantity };
  });
  if (items.length === 0) throw FulfilmentError('session ' + session.id + ' has no line items');

  var recipient = {
    name: shipping.name || customer.name,
    address1: address.line1,
    address2: address.line2 || undefined,
    city: address.city,
    zip: address.postal_code,
    country_code: address.country,
    email: customer.email || undefined,
    phone: customer.phone || undefined,
  };
  if (STATE_REQUIRED[address.country]) recipient.state_code = address.state;

  return {
    external_id: externalId(session),
    shipping: 'STANDARD',
    recipient: recipient,
    items: items,
  };
}

async function printful(path, options, token) {
  var response;
  try {
    response = await fetch(PRINTFUL_API + path, {
      method: (options && options.method) || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw FulfilmentError('Printful unreachable: ' + error.message, true);
  }
  var body = await response.json().catch(function () {
    return null;
  });
  return { status: response.status, body: body };
}

async function findOrder(externalIdValue, token) {
  var found = await printful('/orders/@' + encodeURIComponent(externalIdValue), null, token);
  if (found.status === 200 && found.body && found.body.result) return found.body.result.id;
  if (found.status === 404) return null;
  throw FulfilmentError('Printful lookup failed: HTTP ' + found.status, true);
}

/**
 * Create the order unless one already exists for this external_id.
 * @returns {Promise<{id: number, created: boolean}>}
 */
async function submitOrder(order, opts) {
  var existingId = await findOrder(order.external_id, opts.token);
  if (existingId !== null) return { id: existingId, created: false };

  var created = await printful(
    '/orders?confirm=' + (opts.confirm ? 'true' : 'false'),
    { method: 'POST', body: order },
    opts.token
  );
  if (created.status === 200 && created.body && created.body.result) {
    return { id: created.body.result.id, created: true };
  }

  // A concurrent delivery of the same payment may have created it between our lookup
  // and our POST, in which case Printful refuses the duplicate external_id.
  var racedId = await findOrder(order.external_id, opts.token);
  if (racedId !== null) return { id: racedId, created: false };

  // Only Printful's short reason is kept: its message can echo recipient fields.
  var reason = created.body && created.body.error && created.body.error.reason;
  throw FulfilmentError(
    'Printful rejected order: HTTP ' + created.status + (reason ? ' ' + reason : ''),
    isTransientStatus(created.status)
  );
}

module.exports = {
  buildPrintfulOrder: buildPrintfulOrder,
  submitOrder: submitOrder,
  shippingDetails: shippingDetails,
  externalId: externalId,
  isTransientStatus: isTransientStatus,
  FulfilmentError: FulfilmentError,
};
