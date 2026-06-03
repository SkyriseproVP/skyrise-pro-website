/**
 * Skyrise Pro — Voice Transcription (secure proxy to OpenAI Whisper)
 * Route: /api/transcribe  ->  /.netlify/functions/transcribe
 *
 * The browser records mic audio, base64-encodes it, and POSTs it here.
 * This function forwards it to OpenAI Whisper and returns the transcript text.
 * The OpenAI key lives ONLY in the Netlify env var OPENAI_API_KEY — never in the browser.
 */

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const origin = event.headers.origin || '';
  const allowed = [
    'https://skyrisepro.ai',
    'https://www.skyrisepro.ai',
    'https://skyrise-pro-website.netlify.app',
    'https://skyrisepro.netlify.app',
    'http://localhost',
    'http://localhost:8766',
    'null',
  ];
  const corsOrigin = allowed.includes(origin) ? origin : allowed[0];
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY env var not set');
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Transcription not configured', fallback: true }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Expect: { audio: "<base64>", mime: "audio/webm" }
  const audioB64 = body.audio;
  const mime = body.mime || 'audio/webm';
  if (!audioB64 || typeof audioB64 !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio' }) };
  }

  // Decode base64 -> Buffer
  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audioB64, 'base64');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad audio encoding' }) };
  }

  // Guard against empty / silence clips
  if (audioBuffer.length < 1000) {
    return { statusCode: 200, headers, body: JSON.stringify({ text: '' }) };
  }

  // Build multipart/form-data for OpenAI's /audio/transcriptions
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : 'webm';
  const boundary = '----SkyriseFormBoundary' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';

  const pre =
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
    `whisper-1${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}` +
    `verbose_json${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="language"${CRLF}${CRLF}` +
    `en${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="audio.${ext}"${CRLF}` +
    `Content-Type: ${mime}${CRLF}${CRLF}`;
  const post = `${CRLF}--${boundary}--${CRLF}`;

  const multipartBody = Buffer.concat([
    Buffer.from(pre, 'utf8'),
    audioBuffer,
    Buffer.from(post, 'utf8'),
  ]);

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error('Whisper error', resp.status, errTxt);
      // Surface the REAL upstream reason so we can diagnose from the browser.
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Transcription upstream error', fallback: true, upstreamStatus: resp.status, upstreamError: (errTxt || '').slice(0, 300) }) };
    }

    const data = await resp.json();
    let text = (data.text || '').trim();

    // ── Anti-hallucination filter ──────────────────────────────────────
    // Whisper invents filler phrases ("Thank you.", "Bye bye bye", "you")
    // on silent / near-silent audio. Use the segment confidence data from
    // verbose_json to drop those so Sky never reacts to phantom speech.
    const segs = Array.isArray(data.segments) ? data.segments : [];
    if (segs.length) {
      const maxNoSpeech = Math.max(...segs.map(s => (typeof s.no_speech_prob === 'number' ? s.no_speech_prob : 0)));
      const avgLogprob  = segs.reduce((a, s) => a + (typeof s.avg_logprob === 'number' ? s.avg_logprob : 0), 0) / segs.length;
      // High probability of no speech, or very low confidence => treat as silence.
      if (maxNoSpeech > 0.6 || avgLogprob < -1.0) {
        console.log('Dropped likely-silence transcript:', JSON.stringify(text), 'no_speech:', maxNoSpeech, 'logprob:', avgLogprob);
        text = '';
      }
    }

    if (text) {
      const norm = text.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
      // Known Whisper junk phrases (silence hallucinations).
      const JUNK = new Set([
        '', 'you', 'thank you', 'thanks', 'thank you very much', 'thank you so much',
        'thanks for watching', 'thank you for watching', 'bye', 'bye bye', 'goodbye',
        'okay', 'ok', 'so', 'yeah', 'uh', 'um', 'hmm', 'the', 'i', 'a',
        'please subscribe', 'subscribe', 'see you next time', 'see you',
      ]);
      // Repeated single token (e.g. "bye bye bye bye bye") => hallucination.
      const words = norm.split(' ').filter(Boolean);
      const allSame = words.length >= 3 && words.every(w => w === words[0]);
      if (JUNK.has(norm) || allSame) {
        console.log('Dropped junk/hallucination transcript:', JSON.stringify(text));
        text = '';
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (err) {
    console.error('Transcribe failed:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', fallback: true }) };
  }
};
