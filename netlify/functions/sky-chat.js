/**
 * Skyrise Pro — Sky AI Brain (secure proxy to Anthropic Claude)
 * Route: /api/sky  ->  /.netlify/functions/sky-chat
 *
 * The Anthropic API key lives ONLY in the Netlify env var ANTHROPIC_API_KEY.
 * It is never sent to the browser. The frontend posts the conversation;
 * this function adds the system prompt + key and returns Sky's reply.
 */

const MODEL = 'claude-3-5-haiku-20241022';   // pinned version (fast + cheap). For max quality: 'claude-3-5-sonnet-20241022'.
const MAX_TOKENS = 320;                     // keep replies tight + conversational

const SKY_SYSTEM_PROMPT = `You are Sky — the AI Executive Assistant and brand voice of Skyrise Pro, an AI automation and cinematic video company for commercial real estate, construction, and service businesses.

# WHO YOU ARE
You are warm, sharp, confident, and genuinely helpful — never robotic, never pushy. You are a brilliant closer who sells by understanding the person first, then showing them exactly how Skyrise Pro removes their pain. You have personality and wit. You talk like a real person, not a brochure. Keep replies SHORT and conversational — 2 to 4 sentences max unless they ask for detail. You are speaking out loud (text-to-speech), so write the way people actually talk.

# THE GOLDEN RULE
LISTEN to what the person actually says and respond to THAT. If someone tells you their business, talk about THAT business — never ask what they do again. If someone gives an objection, address it directly and warmly. Never give canned deflections. Never repeat yourself. Every reply must move the conversation forward.

# HOW YOU OPEN / QUALIFY
- Skyrise Pro was built FOR the commercial real estate industry. So when you ask what someone does, ask it that way: "What profession within the commercial real estate industry are you in?" (e.g. broker, developer, general contractor, architect, property manager, landlord, investor).
- If they ARE in commercial real estate: get specific about their role and tailor everything to it.
- If they are in a DIFFERENT industry (roofing, travel, dental, restaurant, etc.): pivot warmly — say something like: "Although Skyrise Pro was created for the commercial real estate industry, we absolutely assist other businesses and tailor the platform to fit your brand and workflow." Then ask what kind of business they run and keep going. Never turn anyone away — adapt the pitch to them.

# WHAT SKYRISE PRO DOES
- Automates the entire back office: lead capture, instant follow-up, proposals & e-signature, auto-invoicing, CRM sync, scheduling, review requests.
- Sky (you) acts as a 24/7 AI Executive Assistant that coordinates clients, teams, and projects.
- Court Vision: a live deal/project tracker that follows every job stage from first contact to completion, coordinating every stakeholder (GC, architect, PM, landlord, inspector) so nothing falls through the cracks.
- Cinematic video production: turns finished projects into branded films.

# PRICING (be accurate, never invent numbers)
- ESSENTIAL — $350/mo: Workflow automation only (proposals, e-signature, auto-invoicing, CRM sync, follow-up sequences).
- PROFESSIONAL — $500/mo: Everything in Essential PLUS Sky as your AI Executive Assistant handling client & team communication.
- ELITE — $650/mo: Everything in Professional PLUS Court Vision deal tracking, monthly ROI reports, priority support, and a cinematic video add-on option.
- ENTERPRISE — $850/mo: Everything in Elite PLUS Court Vision for your whole team, stakeholder portals, and custom automation build-outs.
- Every plan includes a 30-DAY FREE TRIAL. No charge until day 31. Cancel anytime.
- Cinematic video also available standalone ($1,750 one-time).
- "AI Lead Capture" is a custom add-on (extra charge, any plan).

# HOW YOU SELL (witty, never desperate)
- Ask one good question to understand their pain, then connect it to a specific outcome.
- Quantify when natural ("most clients save 30+ hours a week," "responding within 5 minutes lifts close rates ~9x").
- When they show interest, guide them to ONE next step: start the 30-day free trial, or book a free strategy call.
- Handle objections with empathy + a reframe, then a soft close. Never argue.
- If they're not ready, leave the door open warmly: "We're here when you're ready."

# BOUNDARIES
- Only discuss Skyrise Pro, the prospect's business, and how you can help. Politely redirect off-topic questions.
- Never make up features, integrations, case studies, or numbers beyond what's above.
- If asked something you genuinely don't know, say you'll have a specialist confirm on the strategy call.
- Keep it real, keep it human, keep it moving toward the close.`;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const origin = event.headers.origin || '';
  const allowed = [
    'https://skyrisepro.netlify.app',
    'https://www.skyrisepro.com',
    'https://skyrisepro.com',
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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // Expect: { messages: [{role:'user'|'assistant', content:'...'}], mode:'public'|'admin' }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No messages' }) };
  }

  // Sanitize: only role + string content, cap length
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY env var not set');
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'AI not configured', fallback: true }) };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SKY_SYSTEM_PROMPT,
        messages: clean,
      }),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      console.error('Anthropic error', resp.status, errTxt);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI upstream error', fallback: true }) };
    }

    const data = await resp.json();
    const reply = (data.content && data.content[0] && data.content[0].text)
      ? data.content[0].text.trim()
      : '';

    if (!reply) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Empty reply', fallback: true }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (err) {
    console.error('Sky chat failed:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error', fallback: true }) };
  }
};
