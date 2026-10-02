/**
 * Skyrise Pro — AI-readiness quiz + support fallback -> Make hook "Lead Capture Webhook"
 * Route: /api/lead-submit  ->  /.netlify/functions/lead-submit
 * See lib/make-forward.js for why this exists and the env vars it needs.
 */
const { makeForwarder } = require('./lib/make-forward');

exports.handler = makeForwarder({ name: 'lead-submit', urlEnv: 'MAKE_LEAD_WEBHOOK' });
