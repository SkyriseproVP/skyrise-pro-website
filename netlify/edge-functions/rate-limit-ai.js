/**
 * Skyrise Pro (website) — rate limit for the public AI + voice endpoints.
 *
 * Added 2026-10-02 (security hardening). These endpoints have no login because
 * any visitor can talk to Sky, which means anyone could also loop them and run
 * up the Anthropic / ElevenLabs / OpenAI bills. Netlify enforces the `rateLimit`
 * below at its edge (per visitor IP), so it holds across every function instance,
 * unlike an in-memory counter. Over the limit the visitor gets HTTP 429.
 *
 * This function does nothing else: returning undefined passes the request on
 * unchanged to the real endpoint (or to the next edge function, e.g. sky-stream).
 *
 * Budget: a real voice conversation is ~3 requests per spoken turn and the guided
 * demo speaks one line at a time (most lines are pre-recorded MP3s), so 60 per
 * minute is far above genuine use. Rate-limit rules are capped per site by plan
 * (2 on Free/Starter/Personal) — this is rule 1 of 2; rate-limit-forms.js is 2.
 * Direct /.netlify/functions/* paths are listed too so the /api alias can't be
 * sidestepped.
 */
export default async () => {};

export const config = {
  path: [
    '/api/sky',
    '/api/sky-stream',
    '/api/transcribe',
    '/api/tts',
    '/api/weather',
    '/.netlify/functions/sky-chat',
    '/.netlify/functions/transcribe',
    '/.netlify/functions/tts',
    '/.netlify/functions/weather',
  ],
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
