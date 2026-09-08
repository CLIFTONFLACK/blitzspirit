/**
 * test-order — exercise the checkout pricing without Stripe.
 *
 * buildOrder() is the only place a price is decided, so it is the thing worth
 * testing: it must re-price from the catalogue, reject anything malformed, and pick
 * the right shipping rate either side of the free-delivery threshold. The Stripe
 * form encoding is covered too, since that is what actually reaches the API.
 *
 * Plain node, no dependencies - run it from the repo root:
 *   node tools/test-order.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import order from '../api/_order.js';
import checkout from '../api/checkout.js';

const { buildOrder, isFreeDelivery, MAX_QUANTITY } = order;
const { toBody } = checkout;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const settings = JSON.parse(
  readFileSync(join(root, 'standalone/src/data/settings.json'), 'utf8')
);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  ok   ', name);
  } catch (error) {
    failed++;
    console.error('  FAIL ', name, '->', error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rejects(lines, status, fragment) {
  try {
    buildOrder(lines);
  } catch (error) {
    assert(error.isOrderError, `threw ${error.name}, not an OrderError`);
    assert(error.status === status, `status ${error.status}, expected ${status}`);
    assert(
      error.message.includes(fragment),
      `message "${error.message}" does not mention "${fragment}"`
    );
    return;
  }
  throw new Error('did not throw');
}

console.log('buildOrder:');

check('prices a single line from the catalogue, not the request', () => {
  const { lineItems, subtotal } = buildOrder([{ id: 'the-cap-blk', quantity: 1 }]);
  assert(lineItems.length === 1, 'expected one line item');
  assert(lineItems[0].price_data.unit_amount === 2200, 'cap should be 2200 pence');
  assert(subtotal === 2200, `subtotal ${subtotal}`);
  assert(lineItems[0].price_data.tax_behavior === 'inclusive', 'VAT must be inclusive');
  assert(lineItems[0].price_data.currency === 'gbp', 'currency should be gbp');
  assert(
    lineItems[0].price_data.product_data.metadata.sku === 'BS-CAP-BLK',
    'sku should ride along for fulfilment'
  );
});

check('a client-supplied price is ignored entirely', () => {
  // Assert on unit_amount, not just the subtotal: unit_amount is what Stripe
  // charges, and an earlier version of this test passed against a build that took
  // the price from the request because the subtotal was computed separately.
  const { lineItems, subtotal } = buildOrder([
    { id: 'the-cap-blk', quantity: 1, price: 1, unit_amount: 1, amount: 1 },
  ]);
  assert(
    lineItems[0].price_data.unit_amount === 2200,
    `unit_amount ${lineItems[0].price_data.unit_amount} - client price leaked into the charge`
  );
  assert(subtotal === 2200, `subtotal ${subtotal} - client price leaked in`);
});

check('every line item is charged the catalogue price', () => {
  // Sweeps several products rather than one fixture, so a price that only leaks
  // on some product shape still fails.
  const lines = [
    { id: 'the-cap-blk', quantity: 1, price: 1 },
    { id: 'the-frequency-nvy-xl', quantity: 3, price: 1 },
    { id: 'the-clerk-blk-m', quantity: 1, price: 1 },
  ];
  const expected = {
    'the-cap-blk': 2200,
    'the-frequency-nvy-xl': 2800,
    'the-clerk-blk-m': 2800,
  };
  const { lineItems } = buildOrder(lines);
  for (const item of lineItems) {
    const id = item.price_data.product_data.metadata.variant_id;
    assert(
      item.price_data.unit_amount === expected[id],
      `${id} charged ${item.price_data.unit_amount}, expected ${expected[id]}`
    );
  }
});

check('multiplies by quantity and sums across lines', () => {
  const { subtotal } = buildOrder([
    { id: 'the-cap-blk', quantity: 2 },
    { id: 'the-frequency-nvy-xl', quantity: 1 },
  ]);
  assert(subtotal === 2200 * 2 + 2800, `subtotal ${subtotal}`);
});

check('charges delivery below the free threshold', () => {
  const { subtotal, shippingOption } = buildOrder([{ id: 'the-cap-blk', quantity: 1 }]);
  assert(subtotal < settings.shipping.freeThresholdPence, 'fixture should be under the threshold');
  assert(
    shippingOption.shipping_rate_data.fixed_amount.amount === settings.shipping.ukStandardPence,
    'expected the standard rate'
  );
});

check('free delivery turns on AT the threshold, to the penny', () => {
  // No combination of the current four products sums to exactly the threshold, so
  // this tests the decision itself rather than a basket. Without it, `>=` written
  // as `>` passes every basket-level test.
  const t = settings.shipping.freeThresholdPence;
  assert(isFreeDelivery(t) === true, `${t} should be free`);
  assert(isFreeDelivery(t - 1) === false, `${t - 1} should not be free`);
  assert(isFreeDelivery(t + 1) === true, `${t + 1} should be free`);
  assert(isFreeDelivery(0) === false, 'an empty subtotal should not be free');
});

check('a basket over the threshold ships free', () => {
  const { subtotal, shippingOption } = buildOrder([{ id: 'the-cap-blk', quantity: 2 }]);
  assert(subtotal > settings.shipping.freeThresholdPence, `subtotal ${subtotal}`);
  assert(shippingOption.shipping_rate_data.fixed_amount.amount === 0, 'expected free delivery');
  assert(
    shippingOption.shipping_rate_data.display_name === settings.shipping.freeLabel,
    'expected the free-delivery label'
  );
});

check('still charges delivery just under the threshold', () => {
  // £28 is the closest the catalogue gets to £40 from below - no combination of
  // these prices lands on £39.99, so this is the tightest real fixture available.
  const { subtotal, shippingOption } = buildOrder([{ id: 'the-frequency-nvy-xl', quantity: 1 }]);
  assert(subtotal < settings.shipping.freeThresholdPence, `subtotal ${subtotal} not below threshold`);
  assert(
    shippingOption.shipping_rate_data.fixed_amount.amount === settings.shipping.ukStandardPence,
    'expected the standard rate'
  );
});

check('rejects an empty bag', () => rejects([], 400, 'empty bag'));
check('rejects a non-array', () => rejects(undefined, 400, 'empty bag'));
check('rejects an unknown variant', () =>
  rejects([{ id: 'the-ghost-xxl', quantity: 1 }], 400, 'unknown variant'));
check('rejects a zero quantity', () =>
  rejects([{ id: 'the-cap-blk', quantity: 0 }], 400, 'invalid quantity'));
check('rejects a negative quantity', () =>
  rejects([{ id: 'the-cap-blk', quantity: -3 }], 400, 'invalid quantity'));
check('rejects a fractional quantity', () =>
  rejects([{ id: 'the-cap-blk', quantity: 1.5 }], 400, 'invalid quantity'));
check('rejects a quantity above the cap', () =>
  rejects([{ id: 'the-cap-blk', quantity: MAX_QUANTITY + 1 }], 400, 'invalid quantity'));
check('rejects a duplicated line', () =>
  rejects(
    [{ id: 'the-cap-blk', quantity: 1 }, { id: 'the-cap-blk', quantity: 1 }],
    400,
    'duplicate line'
  ));
check('rejects too many lines', () =>
  rejects(
    Array.from({ length: 51 }, () => ({ id: 'the-cap-blk', quantity: 1 })),
    400,
    'too many lines'
  ));

console.log('');
console.log('Stripe form encoding:');

check('encodes nested line items with bracketed paths', () => {
  const { lineItems } = buildOrder([{ id: 'the-cap-blk', quantity: 2 }]);
  const encoded = toBody({ line_items: lineItems });
  assert(
    encoded.includes('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2200'),
    `unit_amount not encoded as Stripe expects: ${encoded}`
  );
  assert(
    encoded.includes('line_items%5B0%5D%5Bquantity%5D=2'),
    `quantity not encoded: ${encoded}`
  );
});

check('encodes the shipping rate and skips empty values', () => {
  const { shippingOption } = buildOrder([{ id: 'the-cap-blk', quantity: 1 }]);
  const encoded = toBody({ shipping_options: [shippingOption], nothing: null });
  assert(
    encoded.includes('shipping_options%5B0%5D%5Bshipping_rate_data%5D%5Bfixed_amount%5D%5Bamount%5D=395'),
    `shipping amount not encoded: ${encoded}`
  );
  assert(!encoded.includes('nothing'), 'null values should be omitted');
});

check('url-escapes values rather than breaking the body', () => {
  const encoded = toBody({ a: 'x&y=z', b: 'plain' });
  assert(encoded.includes('a=x%26y%3Dz'), `ampersand not escaped: ${encoded}`);
  assert(encoded.split('&').length === 2, `body split incorrectly: ${encoded}`);
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall order tests passed');
