/**
 * Skyrise Pro — Sky AI Brain, STREAMING (secure proxy to Anthropic Claude)
 * Route: /api/sky-stream  ->  /.netlify/functions/sky-chat-stream
 *
 * Why this exists as a SEPARATE function from sky-chat.js:
 *   sky-chat.js uses the classic `exports.handler` signature, which buffers the
 *   whole reply and returns one JSON blob — it physically cannot stream. Only
 *   the modern `export default (req, ctx) => Response` signature can.
 *   Keeping them separate means the proven non-streaming path stays untouched
 *   and is always available as a fallback, exactly like Jarvis's STREAM_VOICE.
 *
 * Emits Server-Sent Events:
 *   event: sentence   data: {"text":"..."}     one complete sentence, as it lands
 *   event: done       data: {"reply":"..."}    the full reply, once
 *   event: error      data: {"fallback":true}  caller should use /api/sky
 *
 * The Anthropic key lives ONLY in the Netlify env var ANTHROPIC_API_KEY.
 */

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 160;

// Sky's persona is owned by sky-chat.js. Import it so the two endpoints can
// never drift apart — one voice, one source of truth.
// sky-chat.js is CommonJS. In an ESM function `require` is not reliably
// available, so use the ESM/CJS default-import interop instead.
import skyChat from './sky-chat.js';
const { SKY_SYSTEM_PROMPT, CV_STAKEHOLDER_ARC, CV_PROJECT_CONTROL_MODE } = skyChat;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Split streamed text into speakable sentences. Sky talks out loud, so a
 *  sentence is the smallest unit worth sending to TTS — anything shorter
 *  makes the voice sound chopped. */
function drainSentences(buf) {
  const out = [];
  const re = /[^.!?]*[.!?]+["')\]]*\s*/g;
  let m, last = 0;
  while ((m = re.exec(buf)) !== null) {
    const s = m[0].trim();
    if (s.length >= 2) out.push(s);
    last = re.lastIndex;
  }
  return { sentences: out, rest: buf.slice(last) };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI not configured', fallback: true }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  const clean = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!clean.length) {
    return new Response(JSON.stringify({ error: 'No messages', fallback: true }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const system = body.mode === 'courtvision-active' ? SKY_SYSTEM_PROMPT + CV_PROJECT_CONTROL_MODE
               : body.mode === 'courtvision'        ? SKY_SYSTEM_PROMPT + CV_STAKEHOLDER_ARC
               : SKY_SYSTEM_PROMPT;

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: clean,
        stream: true,
      }),
    });
  } catch (err) {
    console.error('Sky stream: upstream unreachable:', err.message);
    return new Response(JSON.stringify({ error: 'Upstream unreachable', fallback: true }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  if (!upstream.ok || !upstream.body) {
    console.error('Sky stream: upstream error', upstream.status, await upstream.text().catch(() => ''));
    return new Response(JSON.stringify({ error: 'AI upstream error', fallback: true }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      let full = '';      // everything Sky has said
      let pending = '';   // text not yet emitted as a complete sentence
      let raw = '';       // partial SSE frame from Anthropic

      try {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += dec.decode(value, { stream: true });

          const frames = raw.split('\n\n');
          raw = frames.pop() || '';

          for (const frame of frames) {
            const line = frame.split('\n').find(l => l.startsWith('data: '));
            if (!line) continue;
            let evt;
            try { evt = JSON.parse(line.slice(6)); } catch { continue; }

            if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
              full += evt.delta.text;
              pending += evt.delta.text;
              const { sentences, rest } = drainSentences(pending);
              pending = rest;
              for (const s of sentences) send('sentence', { text: s });
            }
          }
        }

        // whatever is left without terminal punctuation still needs saying
        const tail = pending.trim();
        if (tail) send('sentence', { text: tail });

        if (!full.trim()) {
          send('error', { error: 'Empty reply', fallback: true });
        } else {
          send('done', { reply: full.trim() });
        }
      } catch (err) {
        console.error('Sky stream failed mid-flight:', err.message);
        // The client falls back to /api/sky on this event, so a mid-stream
        // failure degrades to the proven path rather than going silent.
        send('error', { error: 'Stream failed', fallback: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
