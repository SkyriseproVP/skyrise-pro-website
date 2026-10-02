/**
 * make-forward — tests. Run: node netlify/functions/tests/make-forward.test.js
 * No network: Make is mocked.
 */
'use strict';
const assert = require('assert');
const { makeForwarder, _test } = require('../lib/make-forward');

const ORIGIN = 'https://skyrisepro.ai';
let n = 0, failed = 0, seq = 0;
async function t(name, fn) {
  try { await fn(); n++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message); }
}
const ev = (over = {}, ip) => ({
  httpMethod: 'POST',
  headers: Object.assign({ origin: ORIGIN, 'x-nf-client-connection-ip': ip || ('10.0.0.' + Math.floor(Math.random() * 250 + 1) + '.' + (++seq)) }, over.headers || {}),
  body: over.body === undefined ? JSON.stringify({ email: 'a@b.co' }) : over.body,
  isBase64Encoded: false,
});
function mock(status = 200) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts }); return { ok: status >= 200 && status < 300, status }; };
  return { fn, calls };
}
const realBooking = {
  name: 'Jane Doe', email: 'jane@example.com', phone: '407-555-0100', service: 'Court Vision',
  business: 'GC', bottleneck: 'Handoffs',
  summary: 'New strategy-call request from Jane Doe — Court Vision — GC', victor_phone: '+16892046006',
};

(async () => {
  process.env.MAKE_BOOKING_WEBHOOK = 'https://hook.example.test/abc123';
  process.env.MAKE_WEBHOOK_APIKEY = 'test-key-xyz';

  console.log('make-forward');

  await t('OPTIONS preflight -> 204 with CORS for our origin', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const r = await h({ httpMethod: 'OPTIONS', headers: { origin: ORIGIN } });
    assert.strictEqual(r.statusCode, 204);
    assert.strictEqual(r.headers['Access-Control-Allow-Origin'], ORIGIN);
    assert.strictEqual(m.calls.length, 0);
  });

  await t('GET -> 405, nothing forwarded', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const r = await h({ httpMethod: 'GET', headers: { origin: ORIGIN } });
    assert.strictEqual(r.statusCode, 405); assert.strictEqual(m.calls.length, 0);
  });

  await t('foreign origin -> 403, nothing forwarded', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    for (const o of ['https://evil.example', '', 'null']) {
      const r = await h(ev({ headers: { origin: o } }));
      assert.strictEqual(r.statusCode, 403, 'origin ' + JSON.stringify(o));
    }
    assert.strictEqual(m.calls.length, 0);
  });

  await t('the 9/30 bot bodies (5 B and 76 B, no email) never reach Make', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const junk = ['{"a":1}', '{}', '', '[]', '"hi"', 'null', '{"email":""}', '{"email":"nope"}', '{"email":"a@b"}', '{"email":123}',
      JSON.stringify({ name: 'x', service: 'y', business: 'z', bottleneck: 'q', summary: 'New strategy-call request from  —  — ' })];
    for (const body of junk) {
      const r = await h(ev({ body }));
      assert.strictEqual(r.statusCode, 400, 'body ' + body.slice(0, 40));
    }
    assert.strictEqual(m.calls.length, 0);
  });

  await t('invalid JSON -> 400', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    assert.strictEqual((await h(ev({ body: '{not json' }))).statusCode, 400); assert.strictEqual(m.calls.length, 0);
  });

  await t('oversized body -> 413', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const r = await h(ev({ body: JSON.stringify({ email: 'a@b.co', pad: 'x'.repeat(70 * 1024) }) }));
    assert.strictEqual(r.statusCode, 413); assert.strictEqual(m.calls.length, 0);
  });

  await t('a real booking is forwarded UNCHANGED, with the key header, to the env URL', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const r = await h(ev({ body: JSON.stringify(realBooking) }));
    assert.strictEqual(r.statusCode, 200); assert.deepStrictEqual(JSON.parse(r.body), { ok: true });
    assert.strictEqual(m.calls.length, 1);
    assert.strictEqual(m.calls[0].url, 'https://hook.example.test/abc123');
    assert.strictEqual(m.calls[0].opts.headers['x-make-apikey'], 'test-key-xyz');
    assert.deepStrictEqual(JSON.parse(m.calls[0].opts.body), realBooking);
  });

  await t('a long questionnaire (nested arrays, newlines, unicode) passes through unchanged', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const q = { name: 'José Ñ', email: 'jose@ex.com', tools: ['Excel', 'QuickBooks'], automations: ['a', 'b'], summary: 'NEW QUESTIONNAIRE\nEmail: x\n\n<b>keep</b> & "quotes" ✓', notes: 'x'.repeat(5000) };
    assert.strictEqual((await h(ev({ body: JSON.stringify(q) }))).statusCode, 200);
    assert.deepStrictEqual(JSON.parse(m.calls[0].opts.body), q);
  });

  await t('no key configured yet -> still forwards (pre-enforcement rollout), without the header', async () => {
    const saved = process.env.MAKE_WEBHOOK_APIKEY; delete process.env.MAKE_WEBHOOK_APIKEY;
    try {
      const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
      assert.strictEqual((await h(ev({ body: JSON.stringify(realBooking) }))).statusCode, 200);
      assert.ok(!('x-make-apikey' in m.calls[0].opts.headers));
    } finally { process.env.MAKE_WEBHOOK_APIKEY = saved; }
  });

  await t('Make refuses (401) -> 502 and a LOUD "LEAD NOT DELIVERED" log, never a fake success', async () => {
    const logs = []; const orig = console.error; console.error = (...a) => logs.push(a.join(' '));
    try {
      const m = mock(401); const h = makeForwarder({ name: 'booking-submit', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
      const r = await h(ev({ body: JSON.stringify(realBooking) }));
      assert.strictEqual(r.statusCode, 502);
      assert.ok(logs.some(l => /LEAD NOT DELIVERED/.test(l) && /MAKE_WEBHOOK_APIKEY/.test(l)), logs.join('|'));
    } finally { console.error = orig; }
  });

  await t('network failure -> 502 + loud log', async () => {
    const logs = []; const orig = console.error; console.error = (...a) => logs.push(a.join(' '));
    try {
      const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: async () => { throw new Error('boom'); } });
      assert.strictEqual((await h(ev({ body: JSON.stringify(realBooking) }))).statusCode, 502);
      assert.ok(logs.some(l => /LEAD NOT DELIVERED/.test(l)));
    } finally { console.error = orig; }
  });

  await t('URL env missing -> 503, nothing forwarded', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_NOT_SET_ANYWHERE', fetchImpl: m.fn });
    const orig = console.error; console.error = () => {};
    try { assert.strictEqual((await h(ev({ body: JSON.stringify(realBooking) }))).statusCode, 503); } finally { console.error = orig; }
    assert.strictEqual(m.calls.length, 0);
  });

  await t('rate limit: the 9th submission from one IP inside the window -> 429', async () => {
    const m = mock(); const h = makeForwarder({ name: 'x', urlEnv: 'MAKE_BOOKING_WEBHOOK', fetchImpl: m.fn });
    const ip = '203.0.113.77'; const codes = [];
    for (let i = 0; i < _test.RATE_MAX + 1; i++) codes.push((await h(ev({ body: JSON.stringify(realBooking) }, ip))).statusCode);
    assert.deepStrictEqual(codes.slice(0, _test.RATE_MAX), Array(_test.RATE_MAX).fill(200));
    assert.strictEqual(codes[_test.RATE_MAX], 429);
    assert.strictEqual(m.calls.length, _test.RATE_MAX);
  });

  console.log(failed ? `\n${failed} FAILED` : `\nALL ${n} PASS`);
  process.exit(failed ? 1 : 0);
})();
