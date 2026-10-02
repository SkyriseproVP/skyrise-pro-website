/**
 * Skyrise Pro — booking + questionnaire forms -> Make hook "Skyrise Pro Booking form"
 * Route: /api/booking-submit  ->  /.netlify/functions/booking-submit
 * See lib/make-forward.js for why this exists and the env vars it needs.
 */
const { makeForwarder } = require('./lib/make-forward');

exports.handler = makeForwarder({ name: 'booking-submit', urlEnv: 'MAKE_BOOKING_WEBHOOK' });
