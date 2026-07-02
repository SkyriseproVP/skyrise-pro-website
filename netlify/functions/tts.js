/**
 * Skyrise Pro — Secure Text-to-Speech Proxy
 * Netlify Function: /.netlify/functions/tts → /api/tts
 *
 * Keeps the ElevenLabs API key server-side (Netlify env var ELEVENLABS_API_KEY).
 * The browser NEVER sees the key — it just POSTs { text, voice_id, ... } and gets audio back.
 */

exports.handler = async function (event) {
  const origin = event.headers.origin || '';
  const allowed = [
    'https://skyrisepro.netlify.app',
    'https://www.skyrisepro.ai',
    'https://skyrisepro.ai',
    'http://localhost',
    'null',
  ];
  const corsOrigin = allowed.includes(origin) ? origin : 'https://skyrisepro.ai';
  const cors = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const jsonH = { ...cors, 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: jsonH, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { statusCode: 500, headers: jsonH, body: JSON.stringify({ error: 'TTS not configured' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: jsonH, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const text = typeof body.text === 'string' ? body.text.slice(0, 1500) : '';
  if (!text) return { statusCode: 400, headers: jsonH, body: JSON.stringify({ error: 'text required' }) };

  const voiceId = /^[A-Za-z0-9]{1,40}$/.test(body.voice_id || '') ? body.voice_id : 'ePn9OncKq8KyJvrTRqTi';
  const modelId = /^[A-Za-z0-9_]{1,40}$/.test(body.model_id || '') ? body.model_id : 'eleven_turbo_v2_5';

  const payload = {
    text,
    model_id: modelId,
    voice_settings: (body.voice_settings && typeof body.voice_settings === 'object')
      ? body.voice_settings
      : { stability: 0.30, similarity_boost: 0.85, style: 0.20, use_speaker_boost: true },
  };
  if (typeof body.speed === 'number') payload.speed = body.speed;
  if (typeof body.language_code === 'string') payload.language_code = body.language_code.slice(0, 5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { statusCode: res.status, headers: jsonH, body: JSON.stringify({ error: 'TTS upstream ' + res.status }) };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    clearTimeout(timer);
    return { statusCode: 502, headers: jsonH, body: JSON.stringify({ error: 'TTS failed' }) };
  }
};
