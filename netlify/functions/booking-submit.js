/**
 * Skyrise Pro — booking + questionnaire forms -> Make hook "Skyrise Pro Booking form"
 * Route: /api/booking-submit  ->  /.netlify/functions/booking-submit
 * See lib/make-forward.js for why this exists and the env vars it needs.
 *
 * Also files every valid submission with Axis on the app (2026-10-19, Victor):
 * the app's /api/prospect-intel stores it for the "Upcoming strategy calls"
 * panel and texts + emails Victor the TI cost chart and inputs. Filed even
 * when Make refuses, so a Make outage still reaches him. Never blocks the reply
 * on more than a few seconds, and never fails the booking.
 */
const { makeForwarder } = require('./lib/make-forward');

const forward = makeForwarder({ name: 'booking-submit', urlEnv: 'MAKE_BOOKING_WEBHOOK' });
const INTEL_URL = process.env.PROSPECT_INTEL_URL || 'https://app.skyrisepro.ai/api/prospect-intel';

async function fileWithAxis(event, doFetch) {
  // The app checks this key. A dedicated PROSPECT_INTEL_KEY wins when set;
  // until then it is the Make key both sites already hold.
  const key = process.env.PROSPECT_INTEL_KEY || process.env.MAKE_WEBHOOK_APIKEY;
  if (!key) { console.error('[booking-submit] no intel key — prospect NOT filed with Axis'); return; }
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  let body;
  try { body = JSON.parse(raw); } catch { return; }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await doFetch(INTEL_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-intel-key': key },
      body: JSON.stringify({ ...body, kind: 'request' }),
    });
    if (!res.ok) console.error('[booking-submit] Axis filing refused: HTTP ' + res.status + ' — prospect NOT filed');
  } catch (e) {
    console.error('[booking-submit] Axis filing failed — prospect NOT filed:', e.message);
  } finally { clearTimeout(timer); }
}

function makeHandler(doFetch = (...a) => fetch(...a), fwd = forward) {
  return async function handler(event) {
    const out = await fwd(event);
    // 200 = Make took it; 502 = Make refused but the submission itself was valid.
    if (out.statusCode === 200 || out.statusCode === 502) await fileWithAxis(event, doFetch);
    return out;
  };
}

exports.handler = makeHandler();
exports._test = { makeHandler, fileWithAxis };
