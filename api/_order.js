// _order — turn a bag of variant ids into priced Stripe line items.
//
// Shared by api/checkout.js and standalone/tools/test-order.mjs, so the pricing and
// validation can be tested without a Stripe key or a network call. The leading
// underscore keeps Vercel from treating this file as a route.
//
// CommonJS with no dependencies, matching api/admin.js and api/feedback.js — the
// project has no package.json and no build step, and adding either would change how
// Vercel builds the site that already lives at the domain root.
//
// Nothing here trusts the request: quantities are bounds-checked and every price,
// title and SKU is read from the committed catalogue.

var catalogue = require('../standalone/src/data/catalogue.json');
var settings = require('../standalone/src/data/settings.json');

var MAX_LINES = 50;
var MAX_QUANTITY = 20;

/** variant id -> { product, variant }, built once per cold start. */
var variantIndex = new Map();
catalogue.products.forEach(function (product) {
  product.variants.forEach(function (variant) {
    variantIndex.set(variant.id, { product: product, variant: variant });
  });
});

function describe(product, variant) {
  var options = Object.keys(variant.options)
    .map(function (name) {
      return name.toUpperCase() + ': ' + String(variant.options[name]).toUpperCase();
    })
    .join(' / ');
  var parts = [product.issue];
  if (options) parts.push(options);
  if (variant.sku) parts.push(variant.sku);
  return parts.join(' // ');
}

function OrderError(status, message) {
  var error = new Error(message);
  error.name = 'OrderError';
  error.status = status;
  error.isOrderError = true;
  return error;
}

/**
 * @param {{id: string, quantity: number}[]} lines
 * @returns {{ lineItems: object[], subtotal: number, shippingOption: object }}
 */
function buildOrder(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw OrderError(400, 'empty bag');
  if (lines.length > MAX_LINES) throw OrderError(400, 'too many lines');

  var currency = settings.shop.currency.toLowerCase();
  var lineItems = [];
  var subtotal = 0;
  var seen = Object.create(null);

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i] || {};
    var entry = variantIndex.get(line.id);
    if (!entry) throw OrderError(400, 'unknown variant: ' + line.id);
    if (seen[line.id]) throw OrderError(400, 'duplicate line: ' + line.id);
    seen[line.id] = true;

    var quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw OrderError(400, 'invalid quantity for ' + line.id);
    }

    var product = entry.product;
    var variant = entry.variant;
    if (!variant.available) throw OrderError(409, product.title + ' is unavailable');

    subtotal += variant.price * quantity;

    lineItems.push({
      quantity: quantity,
      price_data: {
        currency: currency,
        unit_amount: variant.price,
        tax_behavior: 'inclusive',
        product_data: {
          name: product.title,
          description: describe(product, variant),
          metadata: { variant_id: variant.id, sku: variant.sku, handle: product.handle },
        },
      },
    });
  }

  var shipping = settings.shipping;
  var freeDelivery = subtotal >= shipping.freeThresholdPence;

  var shippingOption = {
    shipping_rate_data: {
      type: 'fixed_amount',
      display_name: freeDelivery ? shipping.freeLabel : shipping.ukStandardLabel,
      fixed_amount: {
        amount: freeDelivery ? 0 : shipping.ukStandardPence,
        currency: currency,
      },
      tax_behavior: 'inclusive',
      delivery_estimate: {
        minimum: { unit: 'business_day', value: 2 },
        maximum: { unit: 'business_day', value: 5 },
      },
    },
  };

  return { lineItems: lineItems, subtotal: subtotal, shippingOption: shippingOption };
}

module.exports = {
  buildOrder: buildOrder,
  OrderError: OrderError,
  MAX_LINES: MAX_LINES,
  MAX_QUANTITY: MAX_QUANTITY,
};
