/**
 * Skyrise Pro — server-side forwarder to Make.com webhooks (website)
 *
 * WHY THIS EXISTS (2026-10-01): the site's forms used to POST straight to
 * hook.us2.make.com/<id> from the browser, so both webhook URLs sat in public
 * page source AND in the public git history. On 2026-09-30 a bot found them and
 * fired blank bodies at both (a blank "New Strategy Call Booking" email, and a
 * Lead Capture scenario that Make auto-deactivated). A URL anyone can read is
 * not a secret.
 *
 * NOW: the browser posts here. This function validates the submission, rate
 * limits it, and forwards it to Make with an `x-make-apikey` header. The Make
 * hooks then REQUIRE that key, so the old URLs are worthless on their own.
 *
 * Env vars (Netlify, WEBSITE site — they never cross to the app site):
 *   MAKE_BOOKING_WEBHOOK  full booking-hook URL   (hook 2333631)
 *   MAKE_LEAD_WEBHOOK     full lead-hook URL      (hook 2499796)
 *   MAKE_WEBHOOK_APIKEY   the key value Make shows for its "API Key Auth" key
 *
 * The payload is forwarded UNCHANGED — the Make scenarios reference fields like
 * {{1.email}} and {{1.summary}}, so nothing may be renamed, dropped or escaped.
 *
 * A submission the site's own forms could never produce (no "@" in the email,
 * not a JSON object, oversized, wrong origin) is refused here and never reaches
 * Make. Same rule the scenario filters apply (email contains "@").
 */
'use strict';

const ALLOWED_ORIGINS = [
  'https://skyrisepro.ai',
  'https://www.skyrisepro.ai',
  'https://skyrise-pro-website.netlify.app',
];

const MAX_BYTES = 60 * 1024;       // the longest real form (the questionnaire) is a few KB
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8;                // submissions per IP per window, per function instance
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort limiter: in-memory, so it resets on a cold start and is per
// function instance. It blunts a loop; it is not a substitute for Make's own
// queue limit or a CAPTCHA.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < RATE_WINDOW_MS)) hits.delete(k);
  return recent.length > RATE_MAX;
}

function clientIp(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || h['x-forwarded-for'] || 'unknown').split(',')[0].trim();
}

/**
 * @param {{ name: string, urlEnv: string, fetchImpl?: Function }} cfg
 */
function makeForwarder({ name, urlEnv, fetchImpl }) {
  return async function handler(event) {
    const doFetch = fetchImpl || fetch;
    const h = event.headers || {};
    const origin = h.origin || h.Origin || '';
    const headers = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    const reply = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });

    // Every real submission comes from a page on our own domain, which always sends Origin.
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: 'Forbidden' });

    if (rateLimited(clientIp(event))) return reply(429, { error: 'Too many requests' });

    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    if (Buffer.byteLength(raw) > MAX_BYTES) return reply(413, { error: 'Too large' });

    let payload;
    try { payload = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid JSON' }); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(400, { error: 'Invalid submission' });

    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return reply(400, { error: 'A valid email is required' });

    const url = process.env[urlEnv];
    if (!url) {
      console.error(`[${name}] ${urlEnv} is not set — submission NOT forwarded`);
      return reply(503, { error: 'Not configured' });
    }

    const out = { 'Content-Type': 'application/json' };
    if (process.env.MAKE_WEBHOOK_APIKEY) out['x-make-apikey'] = process.env.MAKE_WEBHOOK_APIKEY;

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      let res;
      try { res = await doFetch(url, { method: 'POST', headers: out, body: JSON.stringify(payload), signal: ctl.signal }); }
      finally { clearTimeout(timer); }
      if (!res.ok) {
        // A lead that Make refused must be LOUD, never silent: the 502 lets the
        // page's own fallback run, and this line is what you look for in the logs.
        console.error(`[${name}] Make refused the submission: HTTP ${res.status} — LEAD NOT DELIVERED${res.status === 401 || res.status === 403 ? ' (webhook key missing/wrong in MAKE_WEBHOOK_APIKEY?)' : ''}`);
        return reply(502, { error: 'Upstream error' });
      }
      return reply(200, { ok: true });
    } catch (err) {
      console.error(`[${name}] forward failed — LEAD NOT DELIVERED:`, err.message);
      return reply(502, { error: 'Upstream error' });
    }
  };
}

module.exports = { makeForwarder, _test: { hits, ALLOWED_ORIGINS, RATE_MAX } };
