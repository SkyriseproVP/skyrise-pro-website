/**
 * Skyrise Pro (website) — rate limit for the public form endpoints.
 *
 * Added 2026-10-02 (security hardening). Each form submission triggers a Make
 * scenario (emails, a text to Victor, an Attio contact), so a loop could flood
 * the inbox and burn Make operations. Netlify enforces the `rateLimit` below at
 * its edge, per visitor IP; over the limit the visitor gets HTTP 429.
 * Nobody genuine submits more than a couple of forms a minute, so 10 is generous.
 *
 * Pass-through only. Rule 2 of 2 for this site (see rate-limit-ai.js). The form
 * proxies also keep their own in-memory limiter as a second layer.
 */
export default async () => {};

export const config = {
  path: [
    '/api/signup',
    '/api/booking-submit',
    '/api/lead-submit',
    '/.netlify/functions/signup',
    '/.netlify/functions/booking-submit',
    '/.netlify/functions/lead-submit',
  ],
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
