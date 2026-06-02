/**
 * Skyrise Pro — Secure Signup Proxy
 * Netlify Function: /.netlify/functions/signup → /api/signup
 *
 * Keeps the Make.com webhook URL server-side (set as Netlify env var).
 * Validates + sanitizes input before forwarding.
 * Never exposes the webhook URL in browser source.
 */

const ALLOWED_INDUSTRIES = [
  'Commercial Real Estate',
  'Construction / General Contractor',
  'Architecture / Engineering',
  'Property Management',
  'Service Business',
  'Other',
];

function sanitize(val, maxLen = 120) {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/<[^>]*>/g, '').slice(0, maxLen);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function isValidPhone(phone) {
  return /^[\d\s\-\+\(\)\.]{7,20}$/.test(phone);
}

exports.handler = async function (event) {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS — only allow requests from the Skyrise Pro domain
  const origin = event.headers.origin || '';
  const allowed = [
    'https://skyrisepro.netlify.app',
    'https://www.skyrisepro.com',
    'https://skyrisepro.com',
    'http://localhost',          // local dev
    'null',                      // file:// local dev
  ];
  const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── Validate required fields ───────────────────────────────
  const firstName = sanitize(body.first_name);
  const lastName  = sanitize(body.last_name);
  const email     = sanitize(body.email, 254);
  const phone     = sanitize(body.phone, 30);
  const company   = sanitize(body.company);
  const industry  = sanitize(body.industry);
  const website   = sanitize(body.website, 200);
  const plan      = sanitize(body.plan, 40);
  const planPrice = sanitize(body.plan_price, 20);
  const source    = sanitize(body.source, 60);

  const errors = [];
  if (!firstName)                          errors.push('first_name required');
  if (!email || !isValidEmail(email))      errors.push('valid email required');
  if (!phone || !isValidPhone(phone))      errors.push('valid phone required');
  if (!company)                            errors.push('company required');
  if (!ALLOWED_INDUSTRIES.includes(industry)) errors.push('valid industry required');

  if (errors.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: errors.join('; ') }) };
  }

  // ── Forward to Make.com (URL stored in Netlify env var) ───
  const webhookUrl = process.env.MAKE_SIGNUP_WEBHOOK;
  if (!webhookUrl) {
    console.error('MAKE_SIGNUP_WEBHOOK env var not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration error' }) };
  }

  const payload = {
    first_name: firstName,
    last_name:  lastName,
    email,
    phone,
    company,
    industry,
    website,
    plan,
    plan_price: planPrice,
    source,
    submitted_at: new Date().toISOString(),
  };

  try {
    const resp = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!resp.ok) {
      console.error('Make.com webhook returned', resp.status);
      // Still return success to client — don't block signup if webhook is flaky
    }
  } catch (err) {
    console.error('Webhook fetch failed:', err.message);
    // Non-blocking — client still proceeds to Stripe
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, message: 'Signup received' }),
  };
};
