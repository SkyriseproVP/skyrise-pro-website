/**
 * Skyrise Pro — Sky AI Brain, STREAMING (Netlify EDGE function, Deno runtime)
 * Route: /api/sky-stream   (declared by the `config` export at the bottom)
 *
 * WHY EDGE, NOT A REGULAR FUNCTION
 * -------------------------------
 * The first attempt at this lived in netlify/functions/sky-chat-stream.mjs as a
 * standard Node function. It returned a correct ReadableStream, and it still
 * did not stream: measured against production, response HEADERS did not arrive
 * until ~22s, and that ~22s was identical for "say hi" and for a full question
 * — a flat platform delay, not generation time. Both SSE events landed together
 * at the 22s mark. Standard Netlify Functions buffer the whole response unless
 * they are invoked over the Lambda Function URL path.
 *
 * Edge functions run on Deno at the CDN edge and stream natively, which is what
 * this needs. The old Node version is retired; this replaces it on the same
 * public route so index.html needs no change to its fetch URL.
 *
 * Emits Server-Sent Events:
 *   event: sentence   data: {"text":"..."}     one complete sentence, as it lands
 *   event: done       data: {"reply":"..."}    the full reply, once
 *   event: error      data: {"fallback":true}  caller should fall back to /api/sky
 *
 * The client treats ANY error event, transport failure, or empty stream as a
 * signal to use /api/sky instead, so this can never take Sky down.
 *
 * ANTHROPIC_API_KEY must be scoped to Functions to be readable here.
 */

import {
  SKY_SYSTEM_PROMPT,
  CV_STAKEHOLDER_ARC,
  CV_PROJECT_CONTROL_MODE,
} from './sky-prompts.js';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 160;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Split streamed text into speakable sentences. Sky talks out loud, so a
 *  sentence is the smallest unit worth handing to TTS — anything shorter makes
 *  the voice sound chopped. */
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

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export default async (request) => {
  // A null-body status must be constructed with `null`, never '' — an empty
  // string throws "Invalid response status code 204". That bug 502'd the
  // previous version of this endpoint on every preflight.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  const apiKey =
    (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get('ANTHROPIC_API_KEY')) ||
    (typeof Deno !== 'undefined' && Deno.env && Deno.env.get('ANTHROPIC_API_KEY'));

  if (!apiKey) return json({ error: 'AI not configured', fallback: true }, 503);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const clean = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (!clean.length) return json({ error: 'No messages', fallback: true }, 400);

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
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages: clean, stream: true }),
    });
  } catch (err) {
    console.error('Sky edge stream: upstream unreachable:', err && err.message);
    return json({ error: 'Upstream unreachable', fallback: true }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    console.error('Sky edge stream: upstream error', upstream.status);
    return json({ error: 'AI upstream error', fallback: true }, 502);
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
        for (;;) {
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

        // a trailing fragment with no terminal punctuation still needs saying
        const tail = pending.trim();
        if (tail) send('sentence', { text: tail });

        if (!full.trim()) send('error', { error: 'Empty reply', fallback: true });
        else send('done', { reply: full.trim() });
      } catch (err) {
        console.error('Sky edge stream failed mid-flight:', err && err.message);
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
      'X-Accel-Buffering': 'no',
    },
  });
};

export const config = { path: '/api/sky-stream' };
