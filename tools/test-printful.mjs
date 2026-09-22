/**
 * test-printful — turn a paid Stripe Checkout into a Printful order, without Stripe,
 * Printful, Resend or the network.
 *
 * Things worth testing on purpose:
 *   - verifyStripeSignature is the only thing standing between the internet and an
 *     endpoint that creates real orders, so its edges (stale/future timestamps,
 *     multiple v1 entries, malformed headers) matter more than the happy path.
 *   - buildPrintfulOrder is the only place the recipient address and items are
 *     decided, so its exact output body and every throw case are checked against the
 *     real catalogue (fixture variant ids are looked up, never hard-coded).
 *   - externalId decides Printful's idempotency key; the hash fallback must be
 *     deterministic and fit Printful's 32-character cap.
 *   - every FulfilmentError carries a `transient` flag that decides whether Stripe
 *     retries or a human gets emailed, so it is checked on every throw path, not just
 *     the message.
 *   - submitOrder's POST-rejected path re-checks for a concurrent duplicate before
 *     giving up, and never leaks Printful's raw error message (which may echo the
 *     recipient's address) into logs or the alert email - only its short `reason`.
 *   - applySyncProduct is what writes prices into the committed catalogue, so a bad
 *     mapping there is a bad price on the live site.
 * The stripe-webhook handler is then run end to end with a stubbed fetch and a fake
 * req/res, to check the pieces are actually wired together: which events fulfil,
 * which status code each failure kind gets, and that the owner alert never carries
 * the customer's name, address or email.
 *
 * Plain node, no dependencies - run it from the repo root:
 *   node tools/test-printful.mjs
 */
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import stripeWebhook from '../api/stripe-webhook.js';
import printfulApi from '../api/_printful.js';
import { applySyncProduct } from '../standalone/tools/printful-sync.mjs';

const { verifyStripeSignature } = stripeWebhook;
const { buildPrintfulOrder, submitOrder, externalId, isTransientStatus } = printfulApi;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(readFileSync(join(root, 'standalone/src/data/catalogue.json'), 'utf8'));

// Fixture variant ids are real catalogue entries; their Printful ids are read from
// the committed catalogue rather than hard-coded, so a resync that changes them
// cannot silently make this test meaningless.
function printfulVariantIdOf(id) {
  for (const product of catalogue.products) {
    const variant = product.variants.find((v) => v.id === id);
    if (variant) return variant.printfulVariantId;
  }
  throw new Error(`fixture variant ${id} is not in the catalogue`);
}
const STUBBORN_XXL_PF_ID = printfulVariantIdOf('the-stubborn-blk-xxl');
const FREQUENCY_3XL_PF_ID = printfulVariantIdOf('the-frequency-owh-3xl');

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log('  ok   ', name);
  } catch (error) {
    failed++;
    console.error('  FAIL ', name, '->', error.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Structural equality that treats an undefined-valued key as absent, matching what
 *  JSON.stringify actually sends to Printful (the body is posted via
 *  JSON.stringify, which drops undefined properties). */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined);
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function assertDeepEqual(actual, expected, message) {
  assert(deepEqual(actual, expected), `${message}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
}

// ---------------------------------------------------------------------------------
// fetch stubbing — no network call anywhere in this file.
// ---------------------------------------------------------------------------------

function stubFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchStub = async (url, options) => {
    const opts = options || {};
    calls.push({
      url: String(url),
      method: opts.method || 'GET',
      body: opts.body ? JSON.parse(opts.body) : undefined,
    });
    if (i >= responses.length) {
      throw new Error(`unexpected fetch call #${i + 1}: ${url}`);
    }
    const r = responses[i++];
    if (r.throws) throw new Error(r.throwMessage || 'simulated network failure');
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
  return { fetchStub, calls };
}

/** Installs a stub global.fetch for the duration of fn and always restores the
 *  original afterwards, even if fn throws. */
async function withFetch(responses, fn) {
  const original = global.fetch;
  const { fetchStub, calls } = stubFetch(responses);
  global.fetch = fetchStub;
  try {
    return await fn(calls);
  } finally {
    global.fetch = original;
  }
}

async function withEnv(vars, fn) {
  const originals = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
  }
}

// ---------------------------------------------------------------------------------
// 1. verifyStripeSignature
// ---------------------------------------------------------------------------------

const SECRET = 'whsec_test_abc123';
const BODY = JSON.stringify({ hello: 'world' });

function sign(body, secret, ts) {
  return crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}
function header(body, secret, ts) {
  return `t=${ts},v1=${sign(body, secret, ts)}`;
}

console.log('verifyStripeSignature:');

await check('accepts a correctly signed payload', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now);
  assert(verifyStripeSignature(BODY, h, SECRET, now) === true, 'expected a valid signature to verify');
});

await check('rejects a signature made with the wrong secret', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, 'a_different_secret', now);
  assert(verifyStripeSignature(BODY, h, SECRET, now) === false, 'wrong secret should not verify');
});

await check('rejects a body that was tampered with after signing', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now);
  const tampered = BODY.replace('world', 'worlD');
  assert(tampered !== BODY, 'fixture did not actually change');
  assert(verifyStripeSignature(tampered, h, SECRET, now) === false, 'a tampered body should not verify');
});

await check('rejects a stale timestamp beyond the 300s tolerance', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now - 301);
  assert(verifyStripeSignature(BODY, h, SECRET, now) === false, 'a 301s-old signature should be stale');
});

await check('accepts a timestamp exactly at the tolerance boundary', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now - 300);
  assert(verifyStripeSignature(BODY, h, SECRET, now) === true, 'a 300s-old signature should still verify');
});

await check('rejects a timestamp from the future beyond tolerance', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now + 301);
  assert(verifyStripeSignature(BODY, h, SECRET, now) === false, 'a signature 301s in the future should be rejected');
});

await check('accepts the valid signature among several v1 entries', () => {
  const now = Math.floor(Date.now() / 1000);
  const validHex = sign(BODY, SECRET, now);
  const wrongHex = sign(BODY, 'some_other_secret', now);
  const h = `t=${now},v1=${wrongHex},v1=${validHex}`;
  assert(verifyStripeSignature(BODY, h, SECRET, now) === true, 'should accept when any v1 entry matches');
});

await check('rejects a header missing the timestamp', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = `v1=${sign(BODY, SECRET, now)}`;
  assert(verifyStripeSignature(BODY, h, SECRET, now) === false, 'a header with no t should not verify');
});

await check('rejects a header missing v1', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = `t=${now}`;
  assert(verifyStripeSignature(BODY, h, SECRET, now) === false, 'a header with no v1 should not verify');
});

await check('rejects a non-hex v1 value without throwing', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = `t=${now},v1=${'z'.repeat(64)}`;
  const result = verifyStripeSignature(BODY, h, SECRET, now);
  assert(result === false, 'a non-hex v1 should not verify');
});

await check('rejects a wrong-length v1 value without throwing', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = `t=${now},v1=abcd`;
  const result = verifyStripeSignature(BODY, h, SECRET, now);
  assert(result === false, 'a short v1 should not verify');
});

await check('rejects an empty signature header', () => {
  const now = Math.floor(Date.now() / 1000);
  assert(verifyStripeSignature(BODY, '', SECRET, now) === false, 'an empty header should not verify');
});

await check('rejects an undefined signature header', () => {
  const now = Math.floor(Date.now() / 1000);
  assert(verifyStripeSignature(BODY, undefined, SECRET, now) === false, 'an undefined header should not verify');
});

await check('rejects an empty secret', () => {
  const now = Math.floor(Date.now() / 1000);
  const h = header(BODY, SECRET, now);
  assert(verifyStripeSignature(BODY, h, '', now) === false, 'an empty secret should not verify');
});

// ---------------------------------------------------------------------------------
// 2. buildPrintfulOrder
// ---------------------------------------------------------------------------------

function sessionFixture(overrides = {}) {
  return {
    id: 'cs_test_123',
    payment_intent: 'pi_test_123',
    payment_status: 'paid',
    collected_information: {
      shipping_details: {
        name: 'Jane Doe',
        address: {
          line1: '221B Baker Street',
          line2: 'Flat 2',
          city: 'London',
          postal_code: 'NW1 6XE',
          country: 'GB',
        },
      },
    },
    customer_details: { email: 'jane@example.com', phone: '+442071234567' },
    ...overrides,
  };
}

function lineItemsFixture() {
  return [
    {
      id: 'li_1',
      quantity: 2,
      price: { product: { metadata: { variant_id: 'the-stubborn-blk-xxl' } } },
    },
    {
      id: 'li_2',
      quantity: 1,
      price: { product: { metadata: { variant_id: 'the-frequency-owh-3xl' } } },
    },
  ];
}

/** Asserts fn() throws a FulfilmentError with the given message fragment and
 *  transient flag (permanent/false unless stated otherwise - most causes here are
 *  bad data, which will fail identically on every retry). */
function throwsFulfilment(fn, fragment, expectedTransient = false) {
  try {
    fn();
  } catch (error) {
    assert(error.isFulfilmentError === true, `expected a FulfilmentError, got ${error.name}: ${error.message}`);
    assert(
      error.transient === expectedTransient,
      `transient was ${error.transient}, expected ${expectedTransient} ("${error.message}")`
    );
    assert(
      error.message.includes(fragment),
      `message "${error.message}" does not mention "${fragment}"`
    );
    return;
  }
  throw new Error('did not throw');
}

console.log('');
console.log('buildPrintfulOrder:');

await check('builds the exact order body for a mixed basket', () => {
  const order = buildPrintfulOrder(sessionFixture(), lineItemsFixture());
  assertDeepEqual(
    order,
    {
      external_id: 'pi_test_123',
      shipping: 'STANDARD',
      recipient: {
        name: 'Jane Doe',
        address1: '221B Baker Street',
        address2: 'Flat 2',
        city: 'London',
        zip: 'NW1 6XE',
        country_code: 'GB',
        email: 'jane@example.com',
        phone: '+442071234567',
      },
      items: [
        { sync_variant_id: STUBBORN_XXL_PF_ID, quantity: 2 },
        { sync_variant_id: FREQUENCY_3XL_PF_ID, quantity: 1 },
      ],
    },
    'order body does not match'
  );
});

await check('reads the legacy top-level shipping_details shape', () => {
  const legacySession = {
    id: 'cs_legacy_1',
    payment_intent: 'pi_legacy_1',
    payment_status: 'paid',
    shipping_details: {
      name: 'Bob Legacy',
      address: {
        line1: '1 Old Compton St',
        city: 'London',
        postal_code: 'W1D 5JJ',
        country: 'GB',
      },
    },
    customer_details: { email: 'bob@example.com' },
  };
  const order = buildPrintfulOrder(legacySession, lineItemsFixture());
  assertDeepEqual(
    order.recipient,
    {
      name: 'Bob Legacy',
      address1: '1 Old Compton St',
      city: 'London',
      zip: 'W1D 5JJ',
      country_code: 'GB',
      email: 'bob@example.com',
    },
    'legacy shipping_details was not read (also checks address2/phone are simply absent, not "undefined")'
  );
});

await check('adds state_code for a country Printful requires it for (US)', () => {
  const session = sessionFixture({
    collected_information: {
      shipping_details: {
        name: 'Sam US',
        address: { line1: '1 Main St', city: 'Austin', postal_code: '73301', country: 'US', state: 'TX' },
      },
    },
  });
  const order = buildPrintfulOrder(session, lineItemsFixture());
  assert(order.recipient.state_code === 'TX', `state_code was ${order.recipient.state_code}`);
});

await check('omits state_code for a country Printful does not require it for, even when one is given', () => {
  const session = sessionFixture({
    collected_information: {
      shipping_details: {
        name: 'Sam GB',
        address: { line1: '1 Main St', city: 'London', postal_code: 'W1 1AA', country: 'GB', state: 'Greater London' },
      },
    },
  });
  const order = buildPrintfulOrder(session, lineItemsFixture());
  assert(order.recipient.state_code === undefined, `state_code should be omitted, got ${order.recipient.state_code}`);
});

await check('uses the hash fallback and does not throw when payment_intent is missing', () => {
  const session = sessionFixture({ payment_intent: undefined });
  const order = buildPrintfulOrder(session, lineItemsFixture());
  assert(order.external_id === externalId(session), `external_id ${order.external_id} did not match externalId()`);
  assert(order.external_id.length === 32, `expected a 32-char external_id, got ${order.external_id.length}`);
});

await check('throws when there is no shipping information at all', () =>
  throwsFulfilment(() => buildPrintfulOrder(sessionFixture({ collected_information: undefined }), lineItemsFixture()), 'has no shipping address'));

await check('throws when shipping is present but has no address', () =>
  throwsFulfilment(
    () =>
      buildPrintfulOrder(
        sessionFixture({ collected_information: { shipping_details: { name: 'No Address' } } }),
        lineItemsFixture()
      ),
    'has no shipping address'
  ));

await check('throws when a line item carries no variant_id', () =>
  throwsFulfilment(
    () =>
      buildPrintfulOrder(sessionFixture(), [
        { id: 'li_bad', quantity: 1, price: { product: { metadata: {} } } },
      ]),
    'carries no variant_id'
  ));

await check('throws when a variant_id is not in the catalogue', () =>
  throwsFulfilment(
    () =>
      buildPrintfulOrder(sessionFixture(), [
        { id: 'li_bad', quantity: 1, price: { product: { metadata: { variant_id: 'the-ghost-xxl' } } } },
      ]),
    'has no Printful variant'
  ));

await check('throws when there are no line items', () =>
  throwsFulfilment(() => buildPrintfulOrder(sessionFixture(), []), 'has no line items'));

// ---------------------------------------------------------------------------------
// 2b. externalId
// ---------------------------------------------------------------------------------

console.log('');
console.log('externalId:');

await check('uses payment_intent when present', () => {
  const id = externalId({ id: 'cs_ext_1', payment_intent: 'pi_ext_1' });
  assert(id === 'pi_ext_1', `expected pi_ext_1, got ${id}`);
});

await check('falls back to a deterministic 32-character hash of the session id when there is no payment_intent', () => {
  const first = externalId({ id: 'cs_ext_2' });
  const again = externalId({ id: 'cs_ext_2' });
  assert(first.length === 32, `expected 32 chars, got ${first.length} ("${first}")`);
  assert(first.startsWith('cs-'), `expected a "cs-" prefix, got "${first}"`);
  assert(first === again, 'the same session id should hash to the same external_id every time');
});

await check('the hash fallback differs for a different session id', () => {
  const a = externalId({ id: 'cs_ext_3' });
  const b = externalId({ id: 'cs_ext_4' });
  assert(a !== b, `different session ids produced the same external_id: ${a}`);
});

await check('falls back to the hash when payment_intent is an empty string', () => {
  const withEmptyPI = externalId({ id: 'cs_ext_5', payment_intent: '' });
  const withoutPI = externalId({ id: 'cs_ext_5' });
  assert(withEmptyPI === withoutPI, 'an empty-string payment_intent should not be used verbatim as the id');
});

await check('throws when there is neither a payment_intent nor an id', () =>
  throwsFulfilment(() => externalId({}), 'neither a payment_intent nor an id'));

// ---------------------------------------------------------------------------------
// 2c. isTransientStatus
// ---------------------------------------------------------------------------------

console.log('');
console.log('isTransientStatus:');

await check('treats 429 and any 5xx as transient', () => {
  assert(isTransientStatus(429) === true, '429 should be transient');
  assert(isTransientStatus(500) === true, '500 should be transient');
  assert(isTransientStatus(503) === true, '503 should be transient');
});

await check('treats ordinary 4xx and 2xx as not transient', () => {
  assert(isTransientStatus(400) === false, '400 should not be transient');
  assert(isTransientStatus(404) === false, '404 should not be transient');
  assert(isTransientStatus(422) === false, '422 should not be transient');
  assert(isTransientStatus(200) === false, '200 should not be transient');
});

await check('the 429 boundary: 428 is not transient, 429 is', () => {
  assert(isTransientStatus(428) === false, '428 should not be transient');
  assert(isTransientStatus(429) === true, '429 should be transient');
});

// ---------------------------------------------------------------------------------
// 3. submitOrder
// ---------------------------------------------------------------------------------

const PRINTFUL_TOKEN = 'pf_test_token';

console.log('');
console.log('submitOrder:');

await check('returns the existing order and does not create a duplicate', async () => {
  await withFetch([{ status: 200, body: { result: { id: 555 } } }], async (calls) => {
    const result = await submitOrder({ external_id: 'pi_dup', items: [] }, { token: PRINTFUL_TOKEN });
    assert(result.created === false, 'expected created:false for an existing order');
    assert(result.id === 555, `expected id 555, got ${result.id}`);
    assert(calls.length === 1, `expected only the lookup call, got ${calls.length}`);
    assert(calls[0].method === 'GET', 'the lookup should be a GET');
    assert(calls[0].url.includes('/orders/@pi_dup'), `lookup url wrong: ${calls[0].url}`);
  });
});

await check('creates the order with confirm=false by default when none exists', async () => {
  const order = { external_id: 'pi_new', items: [{ sync_variant_id: 1, quantity: 1 }] };
  await withFetch(
    [
      { status: 404, body: { error: { message: 'not found' } } },
      { status: 200, body: { result: { id: 777 } } },
    ],
    async (calls) => {
      const result = await submitOrder(order, { token: PRINTFUL_TOKEN });
      assert(result.created === true, 'expected created:true when the order did not exist');
      assert(result.id === 777, `expected id 777, got ${result.id}`);
      assert(calls.length === 2, `expected a lookup then a create, got ${calls.length}`);
      assert(calls[1].method === 'POST', 'the create call should be a POST');
      assert(calls[1].url.includes('confirm=false'), `expected confirm=false in the url: ${calls[1].url}`);
      assertDeepEqual(calls[1].body, order, 'the posted body should be the order, unchanged');
    }
  );
});

await check('creates the order with confirm=true when asked', async () => {
  const order = { external_id: 'pi_confirm', items: [{ sync_variant_id: 1, quantity: 1 }] };
  await withFetch(
    [
      { status: 404, body: null },
      { status: 200, body: { result: { id: 778 } } },
    ],
    async (calls) => {
      await submitOrder(order, { token: PRINTFUL_TOKEN, confirm: true });
      assert(calls[1].url.includes('confirm=true'), `expected confirm=true in the url: ${calls[1].url}`);
    }
  );
});

await check('throws (transient) and does not POST when the lookup itself fails', async () => {
  await withFetch([{ status: 500, body: null }], async (calls) => {
    let error;
    try {
      await submitOrder({ external_id: 'pi_err', items: [] }, { token: PRINTFUL_TOKEN });
    } catch (e) {
      error = e;
    }
    assert(error, 'expected submitOrder to throw on a failed lookup');
    assert(error.isFulfilmentError === true, `expected a FulfilmentError, got ${error.name}`);
    assert(error.transient === true, `expected transient=true for a failed lookup, got ${error.transient}`);
    assert(error.message.includes('HTTP 500'), `message was "${error.message}"`);
    assert(calls.length === 1, `expected no POST after a failed lookup, got ${calls.length} calls`);
  });
});

await check('marks a network failure during the lookup as transient', async () => {
  await withFetch([{ throws: true, throwMessage: 'ECONNRESET' }], async (calls) => {
    let error;
    try {
      await submitOrder({ external_id: 'pi_net', items: [] }, { token: PRINTFUL_TOKEN });
    } catch (e) {
      error = e;
    }
    assert(error, 'expected submitOrder to throw');
    assert(error.isFulfilmentError === true, `expected a FulfilmentError, got ${error.name}`);
    assert(error.transient === true, `expected transient=true for a network failure, got ${error.transient}`);
    assert(error.message.includes('Printful unreachable'), `message was "${error.message}"`);
    assert(calls.length === 1, `expected exactly the failed lookup attempt, got ${calls.length}`);
  });
});

await check('marks a network failure during the create POST as transient, without attempting a race lookup', async () => {
  await withFetch(
    [
      { status: 404, body: null },
      { throws: true, throwMessage: 'ECONNRESET' },
    ],
    async (calls) => {
      let error;
      try {
        await submitOrder({ external_id: 'pi_net_post', items: [] }, { token: PRINTFUL_TOKEN });
      } catch (e) {
        error = e;
      }
      assert(error, 'expected submitOrder to throw');
      assert(error.transient === true, `expected transient=true for a network failure, got ${error.transient}`);
      assert(error.message.includes('Printful unreachable'), `message was "${error.message}"`);
      assert(calls.length === 2, `a network failure on the POST itself should not trigger a race re-lookup, got ${calls.length} calls`);
    }
  );
});

await check('recovers via a second lookup when the POST is rejected because a concurrent delivery already created it', async () => {
  const order = { external_id: 'pi_race', items: [] };
  await withFetch(
    [
      { status: 404, body: null }, // initial lookup: not found
      { status: 400, body: { error: { reason: 'DUPLICATE_EXTERNAL_ID' } } }, // POST rejected
      { status: 200, body: { result: { id: 999 } } }, // race lookup: it exists now
    ],
    async (calls) => {
      const result = await submitOrder(order, { token: PRINTFUL_TOKEN });
      assert(result.created === false, 'a racily-created order should report created:false');
      assert(result.id === 999, `expected id 999, got ${result.id}`);
      assert(calls.length === 3, `expected lookup, POST, re-lookup; got ${calls.length}`);
      assert(calls[2].method === 'GET', 'the race recovery should be a GET lookup');
      assert(calls[2].url.includes('/orders/@pi_race'), `race lookup url wrong: ${calls[2].url}`);
    }
  );
});

await check("throws with only Printful's short reason - never its message, which may carry PII - when the order truly was not created", async () => {
  const order = { external_id: 'pi_bad_addr', items: [] };
  await withFetch(
    [
      { status: 404, body: null },
      {
        status: 400,
        body: { error: { reason: 'INVALID_ADDRESS', message: 'Jane Doe, 221B Baker Street, jane@example.com is not deliverable' } },
      },
      { status: 404, body: null }, // race lookup: still not found
    ],
    async () => {
      let error;
      try {
        await submitOrder(order, { token: PRINTFUL_TOKEN });
      } catch (e) {
        error = e;
      }
      assert(error, 'expected submitOrder to throw');
      assert(error.isFulfilmentError === true, `expected a FulfilmentError, got ${error.name}`);
      assert(error.message.includes('INVALID_ADDRESS'), `message was "${error.message}"`);
      assert(!error.message.includes('Jane Doe'), `message leaked PII: "${error.message}"`);
      assert(!error.message.includes('jane@example.com'), `message leaked PII: "${error.message}"`);
      assert(error.transient === false, `expected a permanent (400) failure, got transient=${error.transient}`);
    }
  );
});

await check('marks a rejected POST as transient when Printful returned a 5xx', async () => {
  await withFetch(
    [
      { status: 404, body: null },
      { status: 502, body: null },
      { status: 404, body: null },
    ],
    async () => {
      let error;
      try {
        await submitOrder({ external_id: 'pi_5xx', items: [] }, { token: PRINTFUL_TOKEN });
      } catch (e) {
        error = e;
      }
      assert(error, 'expected submitOrder to throw');
      assert(error.transient === true, `expected transient=true for a 502, got ${error.transient}`);
    }
  );
});

// ---------------------------------------------------------------------------------
// 4. applySyncProduct
// ---------------------------------------------------------------------------------

console.log('');
console.log('applySyncProduct:');

await check('matches on colour/size, mapping Natural->Off-White and 2XL->XXL, and copies price/availability', () => {
  const product = {
    handle: 'the-sync-test',
    price: 1,
    variants: [
      { id: 'v-black-xxl', options: { Colour: 'Black', Size: 'XXL' }, price: 0, available: false },
      { id: 'v-offwhite-3xl', options: { Colour: 'Off-White', Size: '3XL' }, price: 0, available: false },
    ],
  };
  const syncProduct = {
    sync_variants: [
      { id: 111, color: 'Black', size: '2XL', currency: 'GBP', retail_price: '30.00', availability_status: 'active' },
      { id: 222, color: 'Natural', size: '3XL', currency: 'GBP', retail_price: '32.50', availability_status: 'discontinued' },
    ],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.length === 0, `expected no problems, got ${JSON.stringify(problems)}`);
  assert(product.variants[0].printfulVariantId === 111, 'wrong printfulVariantId for v-black-xxl');
  assert(product.variants[0].price === 3000, `v-black-xxl price ${product.variants[0].price}`);
  assert(product.variants[0].available === true, 'v-black-xxl should be available');
  assert(product.variants[1].printfulVariantId === 222, 'wrong printfulVariantId for v-offwhite-3xl');
  assert(product.variants[1].price === 3250, `v-offwhite-3xl price ${product.variants[1].price}`);
  assert(product.variants[1].available === false, 'v-offwhite-3xl should not be available (discontinued)');
  assert(product.price === 3000, `product.price should be the cheapest variant, got ${product.price}`);
});

await check('flags a Printful variant with no catalogue partner and leaves price untouched', () => {
  const product = {
    handle: 'the-orphan-test',
    price: 1,
    variants: [{ id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false }],
  };
  const syncProduct = {
    sync_variants: [
      { id: 601, color: 'Black', size: 'M', currency: 'GBP', retail_price: '20.00', availability_status: 'active' },
      { id: 602, color: 'Purple', size: 'XL', currency: 'GBP', retail_price: '20.00', availability_status: 'active' },
    ],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.length === 1, `expected 1 problem, got ${JSON.stringify(problems)}`);
  assert(problems[0].includes('602') && problems[0].includes('has no catalogue variant'), `unexpected message: ${problems[0]}`);
  assert(product.price === 1, `product.price should be untouched, got ${product.price}`);
});

await check('flags a catalogue variant with no Printful partner', () => {
  const product = {
    handle: 'the-lonely-test',
    price: 1,
    variants: [
      { id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false },
      { id: 'v2', options: { Colour: 'White', Size: 'L' }, price: 0, available: false },
    ],
  };
  const syncProduct = {
    sync_variants: [{ id: 701, color: 'Black', size: 'M', currency: 'GBP', retail_price: '20.00', availability_status: 'active' }],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.length === 1, `expected 1 problem, got ${JSON.stringify(problems)}`);
  assert(problems[0].includes('v2 has no Printful variant'), `unexpected message: ${problems[0]}`);
});

await check('flags a non-GBP variant and leaves it unmatched', () => {
  const product = {
    handle: 'the-usd-test',
    price: 1,
    variants: [{ id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false }],
  };
  const syncProduct = {
    sync_variants: [{ id: 501, color: 'Black', size: 'M', currency: 'USD', retail_price: '25.00', availability_status: 'active' }],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.length === 2, `expected 2 problems (currency + unmatched), got ${JSON.stringify(problems)}`);
  assert(problems.some((p) => p.includes('priced in USD, not GBP')), `no currency problem in ${JSON.stringify(problems)}`);
  assert(problems.some((p) => p.includes('v1 has no Printful variant')), `no unmatched problem in ${JSON.stringify(problems)}`);
});

await check('flags a bad price', () => {
  const product = {
    handle: 'the-badprice-test',
    price: 1,
    variants: [{ id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false }],
  };
  const syncProduct = {
    sync_variants: [{ id: 901, color: 'Black', size: 'M', currency: 'GBP', retail_price: '0.00', availability_status: 'active' }],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.some((p) => p.includes('has price "0.00"')), `unexpected problems: ${JSON.stringify(problems)}`);
});

await check('skips is_ignored variants entirely', () => {
  const product = {
    handle: 'the-ignored-test',
    price: 1,
    variants: [{ id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false }],
  };
  const syncProduct = {
    sync_variants: [
      { id: 801, color: 'Black', size: 'M', currency: 'GBP', retail_price: '20.00', availability_status: 'active', is_ignored: true },
    ],
  };
  const problems = applySyncProduct(product, syncProduct);
  assert(problems.length === 1, `expected the ignored variant to leave v1 unmatched, got ${JSON.stringify(problems)}`);
  assert(problems[0].includes('v1 has no Printful variant'), `unexpected message: ${problems[0]}`);
  assert(product.variants[0].printfulVariantId === undefined, 'an ignored variant must not be applied');
});

await check('leaves product.price alone when there are unresolved problems', () => {
  const product = {
    handle: 'the-priceguard-test',
    price: 12345,
    variants: [{ id: 'v1', options: { Colour: 'Black', Size: 'M' }, price: 0, available: false }],
  };
  const problems = applySyncProduct(product, { sync_variants: [] });
  assert(problems.length === 1, `expected 1 problem, got ${JSON.stringify(problems)}`);
  assert(product.price === 12345, `price should stay 12345, got ${product.price}`);
});

// ---------------------------------------------------------------------------------
// 5. stripe-webhook handler, end to end
// ---------------------------------------------------------------------------------

const ENV = {
  STRIPE_WEBHOOK_SECRET: 'whsec_handler_test',
  STRIPE_SECRET_KEY: 'sk_test_handler',
  PRINTFUL_API_TOKEN: 'pf_test_handler',
  PRINTFUL_CONFIRM_ORDERS: undefined,
  ORDER_ALERT_EMAIL: undefined,
  RESEND_API_KEY: undefined,
};

const ENV_WITH_ALERTS = {
  ...ENV,
  ORDER_ALERT_EMAIL: 'owner@blitzspirit.example',
  RESEND_API_KEY: 're_test_key',
};

function fakeReq(bodyString, headers) {
  const stream = Readable.from([Buffer.from(bodyString, 'utf8')]);
  stream.headers = headers || {};
  stream.method = 'POST';
  return stream;
}

function fakeRes() {
  return {
    statusCode: undefined,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function signedRequest(payload, secret = ENV.STRIPE_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000)) {
  const bodyString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const h = header(bodyString, secret, ts);
  return fakeReq(bodyString, { 'stripe-signature': h });
}

/** A permanent (non-transient) failure that has nothing to do with the recipient:
 *  an unknown variant. Used to reach the alertOwner path while keeping the session's
 *  real PII (name/address/email) present but irrelevant to the failure, so a test can
 *  prove the alert does not simply dump the session. */
function unknownVariantLineItems() {
  return [{ id: 'li_bad', quantity: 1, price: { product: { metadata: { variant_id: 'the-ghost-xxl' } } } }];
}

console.log('');
console.log('stripe-webhook handler:');

await check('disables Vercel body parsing so the raw bytes Stripe signed are what gets read', () => {
  assert(
    stripeWebhook.config && stripeWebhook.config.api && stripeWebhook.config.api.bodyParser === false,
    'module.exports.config is missing (api.bodyParser:false) - Vercel will pre-parse the body before the handler runs, ' +
      'which corrupts the raw-body signature check'
  );
});

await check('rejects a bad signature before touching Stripe or Printful', () =>
  withEnv(ENV, () =>
    withFetch([], async (calls) => {
      const req = signedRequest(
        { type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } },
        'the_wrong_secret'
      );
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 400, `status ${res.statusCode}`);
      assert(calls.length === 0, `fetch should not be called for a bad signature, got ${calls.length} calls`);
    })
  ));

await check('rejects a payload that is not valid JSON', () =>
  withEnv(ENV, () =>
    withFetch([], async (calls) => {
      const req = signedRequest('{not json');
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 400, `status ${res.statusCode}`);
      assert(calls.length === 0, `fetch should not be called for a malformed payload, got ${calls.length} calls`);
    })
  ));

await check('returns 200 without fulfilling an event it does not handle', () =>
  withEnv(ENV, () =>
    withFetch([], async (calls) => {
      const req = signedRequest({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'cs_2', payment_status: 'paid' } },
      });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 200, `status ${res.statusCode}`);
      assert(res.body.ignored === 'payment_intent.succeeded', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 0, `fetch should not be called for an ignored event, got ${calls.length} calls`);
    })
  ));

await check('ignores a completed session that is not paid or zero-total', () =>
  withEnv(ENV, () =>
    withFetch([], async (calls) => {
      const req = signedRequest({
        type: 'checkout.session.completed',
        data: { object: sessionFixture({ payment_status: 'unpaid' }) },
      });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 200, `status ${res.statusCode}`);
      assert(res.body.ignored === 'checkout.session.completed', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 0, `fetch should not be called for an unpaid session, got ${calls.length} calls`);
    })
  ));

await check('fulfils a paid session end to end', () =>
  withEnv(ENV, () =>
    withFetch(
      [
        { status: 200, body: { data: lineItemsFixture() } }, // Stripe line_items
        { status: 404, body: null }, // Printful lookup: no existing order
        { status: 200, body: { result: { id: 4242 } } }, // Printful create
      ],
      async (calls) => {
        const req = signedRequest({
          type: 'checkout.session.completed',
          data: { object: sessionFixture() },
        });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 200, `status ${res.statusCode}, body ${JSON.stringify(res.body)}`);
        assert(res.body.printfulOrder === 4242, `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 3, `expected 3 fetch calls, got ${calls.length}`);
        assert(calls[0].url.includes('api.stripe.com'), `first call should hit Stripe: ${calls[0].url}`);
        assert(calls[0].url.includes('cs_test_123'), `Stripe call should target the session: ${calls[0].url}`);
        assert(calls[1].url.includes('api.printful.com'), `second call should hit Printful: ${calls[1].url}`);
        assert(calls[1].url.includes('/orders/@pi_test_123'), `lookup url wrong: ${calls[1].url}`);
        assert(calls[2].method === 'POST', 'third call should create the order');
        assert(calls[2].url.includes('confirm=false'), `expected confirm=false by default: ${calls[2].url}`);
      }
    )
  ));

await check('fulfils a completed zero-total session (payment_status: no_payment_required)', () =>
  withEnv(ENV, () =>
    withFetch(
      [
        { status: 200, body: { data: lineItemsFixture() } },
        { status: 404, body: null },
        { status: 200, body: { result: { id: 5001 } } },
      ],
      async (calls) => {
        const req = signedRequest({
          type: 'checkout.session.completed',
          data: { object: sessionFixture({ payment_status: 'no_payment_required' }) },
        });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 200, `status ${res.statusCode}`);
        assert(res.body.printfulOrder === 5001, `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 3, `expected the full flow, got ${calls.length}`);
      }
    )
  ));

await check('fulfils an async_payment_succeeded event whatever its payment_status', () =>
  withEnv(ENV, () =>
    withFetch(
      [
        { status: 200, body: { data: lineItemsFixture() } },
        { status: 404, body: null },
        { status: 200, body: { result: { id: 5002 } } },
      ],
      async (calls) => {
        const req = signedRequest({
          type: 'checkout.session.async_payment_succeeded',
          data: { object: sessionFixture({ payment_status: 'unpaid' }) },
        });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 200, `status ${res.statusCode}`);
        assert(res.body.printfulOrder === 5002, `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 3, `expected the full flow, got ${calls.length}`);
      }
    )
  ));

await check('returns 500 (retry) when a transient Printful failure happens', () =>
  withEnv(ENV, () =>
    withFetch(
      [
        { status: 200, body: { data: lineItemsFixture() } },
        { status: 500, body: null }, // Printful lookup fails
      ],
      async (calls) => {
        const req = signedRequest({
          type: 'checkout.session.completed',
          data: { object: sessionFixture() },
        });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 500, `status ${res.statusCode}`);
        assert(res.body.error === 'fulfilment failed, retry', `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 2, `expected no POST after a Printful failure, got ${calls.length} calls`);
      }
    )
  ));

await check('returns 500 when Stripe line_items is unreachable (network failure)', () =>
  withEnv(ENV, () =>
    withFetch([{ throws: true }], async (calls) => {
      const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 500, `status ${res.statusCode}`);
      assert(res.body.error === 'fulfilment failed, retry', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 1, `expected only the failed Stripe call, got ${calls.length}`);
    })
  ));

await check('returns 500 when Stripe line_items returns a 5xx', () =>
  withEnv(ENV, () =>
    withFetch([{ status: 503, body: null }], async (calls) => {
      const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 500, `status ${res.statusCode}`);
      assert(res.body.error === 'fulfilment failed, retry', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 1, `expected only the Stripe call, got ${calls.length}`);
    })
  ));

await check('returns 500 when Stripe line_items returns 429', () =>
  withEnv(ENV, () =>
    withFetch([{ status: 429, body: null }], async (calls) => {
      const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 500, `status ${res.statusCode}`);
      assert(calls.length === 1, `expected only the Stripe call, got ${calls.length}`);
    })
  ));

await check('returns 200 unfulfilled (not 500) when Stripe line_items returns an ordinary 4xx', () =>
  withEnv(ENV, () =>
    withFetch([{ status: 400, body: null }], async (calls) => {
      const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 200, `status ${res.statusCode}`);
      assert(res.body.unfulfilled === 'cs_test_123', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 1, `no alert should fire with ORDER_ALERT_EMAIL unset, got ${calls.length} calls`);
    })
  ));

await check('returns 200 unfulfilled and does not email an alert when no alert address is configured', () =>
  withEnv(ENV, () =>
    withFetch([{ status: 200, body: { data: unknownVariantLineItems() } }], async (calls) => {
      const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
      const res = fakeRes();
      await stripeWebhook(req, res);
      assert(res.statusCode === 200, `status ${res.statusCode}`);
      assert(res.body.unfulfilled === 'cs_test_123', `body ${JSON.stringify(res.body)}`);
      assert(calls.length === 1, `no alert should be sent with the env unset, got ${calls.length} calls`);
    })
  ));

await check('emails the owner with the session id but never the customer name, address or email', () =>
  withEnv(ENV_WITH_ALERTS, () =>
    withFetch(
      [
        { status: 200, body: { data: unknownVariantLineItems() } },
        { status: 200, body: {} }, // Resend accepts the alert
      ],
      async (calls) => {
        const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 200, `status ${res.statusCode}`);
        assert(res.body.unfulfilled === 'cs_test_123', `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 2, `expected the line_items call and the alert, got ${calls.length}`);
        const alert = calls[1];
        assert(alert.url === 'https://api.resend.com/emails', `alert url wrong: ${alert.url}`);
        assert(alert.method === 'POST', 'alert should be a POST');
        assertDeepEqual(alert.body.to, ['owner@blitzspirit.example'], `alert recipient wrong: ${JSON.stringify(alert.body.to)}`);
        const text = JSON.stringify(alert.body);
        assert(text.includes('cs_test_123'), `alert should reference the session id: ${text}`);
        assert(!text.includes('Jane Doe'), `alert leaked the customer name: ${text}`);
        assert(!text.includes('221B Baker Street'), `alert leaked the customer address: ${text}`);
        assert(!text.includes('jane@example.com'), `alert leaked the customer email: ${text}`);
      }
    )
  ));

await check('still returns 200 when the alert email itself fails to send', () =>
  withEnv(ENV_WITH_ALERTS, () =>
    withFetch(
      [
        { status: 200, body: { data: unknownVariantLineItems() } },
        { throws: true }, // Resend unreachable
      ],
      async (calls) => {
        const req = signedRequest({ type: 'checkout.session.completed', data: { object: sessionFixture() } });
        const res = fakeRes();
        await stripeWebhook(req, res);
        assert(res.statusCode === 200, `status ${res.statusCode}, an alert failure must not change the response`);
        assert(res.body.unfulfilled === 'cs_test_123', `body ${JSON.stringify(res.body)}`);
        assert(calls.length === 2, `expected the alert to still be attempted, got ${calls.length}`);
      }
    )
  ));

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nall printful tests passed');
