/**
 * booking-submit — files each valid booking with Axis on the app. Run:
 *   node netlify/functions/tests/booking-submit.test.js
 * No network: Make and the app are both mocked.
 */
'use strict';
const assert = require('assert');
const { _test } = require('../booking-submit');

let n = 0, failed = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message); }
}
const booking = { name: 'Jane Doe', email: 'jane@example.com', source: 'cost-page', projects: 3, hours_week: 8, team_rate: 75, rent_credit_15: 15000, slip_days: 30 };
const ev = (body = booking) => ({ httpMethod: 'POST', headers: { origin: 'https://skyrisepro.ai' }, body: JSON.stringify(body), isBase64Encoded: false });
function mockFetch(status = 200, throws) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts }); if (throws) throw new Error('down'); return { ok: status < 300, status }; };
  return { fn, calls };
}
const fwd = (statusCode) => async () => ({ statusCode, headers: {}, body: '{}' });

(async () => {
  process.env.MAKE_WEBHOOK_APIKEY = 'make-key-123';
  delete process.env.PROSPECT_INTEL_KEY;
  console.log('booking-submit');

  await t('Make took it -> filed with Axis, keyed, kind request, payload intact', async () => {
    const m = mockFetch(); const h = _test.makeHandler(m.fn, fwd(200));
    const r = await h(ev());
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(m.calls.length, 1);
    assert.strictEqual(m.calls[0].url, 'https://app.skyrisepro.ai/api/prospect-intel');
    assert.strictEqual(m.calls[0].opts.headers['x-intel-key'], 'make-key-123');
    const sent = JSON.parse(m.calls[0].opts.body);
    assert.strictEqual(sent.kind, 'request');
    assert.strictEqual(sent.projects, 3);
    assert.strictEqual(sent.email, 'jane@example.com');
  });

  await t('Make refused (502) -> still filed, so an outage still reaches Victor', async () => {
    const m = mockFetch(); const r = await _test.makeHandler(m.fn, fwd(502))(ev());
    assert.strictEqual(r.statusCode, 502); assert.strictEqual(m.calls.length, 1);
  });

  await t('invalid submission (400/403/429) -> never filed', async () => {
    for (const s of [400, 403, 413, 429]) {
      const m = mockFetch(); await _test.makeHandler(m.fn, fwd(s))(ev());
      assert.strictEqual(m.calls.length, 0, 'filed on ' + s);
    }
  });

  await t('app down -> the booking reply is unchanged', async () => {
    const m = mockFetch(200, true); const r = await _test.makeHandler(m.fn, fwd(200))(ev());
    assert.strictEqual(r.statusCode, 200);
  });

  await t('a dedicated PROSPECT_INTEL_KEY wins over the Make key', async () => {
    process.env.PROSPECT_INTEL_KEY = 'intel-key-456';
    const m = mockFetch(); await _test.makeHandler(m.fn, fwd(200))(ev());
    assert.strictEqual(m.calls[0].opts.headers['x-intel-key'], 'intel-key-456');
    delete process.env.PROSPECT_INTEL_KEY;
  });

  await t('no key at all -> not filed, booking unaffected', async () => {
    const saved = process.env.MAKE_WEBHOOK_APIKEY; delete process.env.MAKE_WEBHOOK_APIKEY;
    const m = mockFetch(); const r = await _test.makeHandler(m.fn, fwd(200))(ev());
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(m.calls.length, 0);
    process.env.MAKE_WEBHOOK_APIKEY = saved;
  });

  console.log(`\n${n} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
