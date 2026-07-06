/**
 * Skyrise Pro — Jarvis Live Brief (reads the Attio "brain")
 * Route: /api/jarvis-brief  ->  /.netlify/functions/jarvis-brief
 *
 * Jarvis (Victor's admin AI) calls this at login to get a LIVE snapshot of the
 * real pipeline straight from Attio, so he advises on current status instead of
 * a hardcoded snapshot.
 *
 * DEALS-CENTRIC: Attio is full of seed/demo companies (Microsoft, Apple, etc.).
 * The real Skyrise pipeline lives in the Deals object. So the brief is built
 * from Deals, and only surfaces the companies/people LINKED to those deals —
 * which naturally filters out all the demo noise.
 *
 * Key lives ONLY in Netlify env var ATTIO_API_KEY.
 *
 * Modes:
 *   GET /api/jarvis-brief              -> { brief, generatedAt }
 *   GET /api/jarvis-brief?debug=schema -> objects + attributes
 *   GET /api/jarvis-brief?debug=raw    -> summarized records
 */

const ATTIO = 'https://api.attio.com/v2';

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  const apiKey = process.env.ATTIO_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'Brain not configured', detail: 'ATTIO_API_KEY missing' }) };
  }
  const auth = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const debug = (event.queryStringParameters || {}).debug || '';

  async function aGet(path) {
    const r = await fetch(`${ATTIO}${path}`, { headers: auth });
    const t = await r.text();
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${t.slice(0, 200)}`);
    return JSON.parse(t);
  }
  async function aQuery(objectSlug, limit) {
    const r = await fetch(`${ATTIO}/objects/${objectSlug}/records/query`, {
      method: 'POST', headers: auth, body: JSON.stringify({ limit: limit || 100 }),
    });
    const t = await r.text();
    if (!r.ok) throw new Error(`QUERY ${objectSlug} -> ${r.status}: ${t.slice(0, 200)}`);
    return JSON.parse(t).data || [];
  }
  const recId = r => (r && r.id && r.id.record_id) || '';
  function flatten(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(v => {
      if (v == null) return '';
      if (typeof v !== 'object') return String(v);
      return v.full_name || v.email_address || v.phone_number ||
             (v.option && v.option.title) || (v.status && v.status.title) ||
             v.value || '';
    }).filter(Boolean).join('; ');
  }
  const refIds = arr => Array.isArray(arr) ? arr.map(x => x && x.target_record_id).filter(Boolean) : [];
  function summarize(values) {
    const out = {};
    for (const slug in values) { const s = flatten(values[slug]); if (s) out[slug] = s; }
    return out;
  }

  try {
    if (debug === 'schema') {
      const objs = (await aGet('/objects')).data || [];
      const slugs = objs.map(o => o.api_slug).filter(Boolean);
      const attributes = {};
      for (const slug of ['people', 'companies', 'deals'].filter(s => slugs.includes(s))) {
        try { attributes[slug] = ((await aGet(`/objects/${slug}/attributes`)).data || []).map(x => ({ slug: x.api_slug, title: x.title, type: x.type })); }
        catch (e) { attributes[slug] = { error: e.message }; }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ objects: slugs, attributes }, null, 2) };
    }

    const objs = (await aGet('/objects')).data || [];
    const slugs = objs.map(o => o.api_slug).filter(Boolean);
    const has = s => slugs.includes(s);

    const peopleRecs    = has('people')    ? await aQuery('people', 200)    : [];
    const companyRecs   = has('companies') ? await aQuery('companies', 200) : [];
    const dealRecs      = has('deals')     ? await aQuery('deals', 200)     : [];

    // Lookup maps (id -> readable)
    const companyById = {};
    companyRecs.forEach(r => { companyById[recId(r)] = flatten(r.values.name) || '(unnamed company)'; });
    const personById = {};
    peopleRecs.forEach(r => {
      const v = r.values;
      personById[recId(r)] = {
        name: flatten(v.name) || '(unnamed)',
        email: flatten(v.email_addresses),
        phone: flatten(v.phone_numbers),
        title: flatten(v.job_title),
        lastContact: flatten(v.last_email_interaction) || flatten(v.last_calendar_interaction),
      };
    });

    if (debug === 'raw') {
      return { statusCode: 200, headers, body: JSON.stringify({
        counts: { people: peopleRecs.length, companies: companyRecs.length, deals: dealRecs.length },
        deals: dealRecs.map(d => summarize(d.values)),
      }, null, 2) };
    }

    // ── Read notes to surface "Documents Needed" / outstanding items ──
    let notes = [];
    try { notes = (await aGet('/notes?limit=100')).data || []; } catch (e) { /* notes optional */ }
    const notesByRecord = {};
    notes.forEach(n => {
      const pid = n.parent_record_id || (n.parent && n.parent.record_id);
      if (!pid) return;
      const body = n.content_plaintext || n.content_markdown || (n.content && (n.content.plaintext || n.content.markdown)) || '';
      (notesByRecord[pid] = notesByRecord[pid] || []).push({ title: n.title || '', body: String(body) });
    });

    // Build deals-centric brief
    const lines = [];
    lines.push('JARVIS DIRECTIVE: When you greet Victor, OPEN by briefing him — concisely and proactively — on the ACTION ITEMS below (what needs him today). Lead with the most urgent. Then ask how you can help. You are his executive assistant watching his back, not a passive chatbot.');
    lines.push('');
    lines.push('LIVE PIPELINE FROM ATTIO (authoritative — use this over any earlier/hardcoded snapshot).');
    lines.push(`Pulled: ${new Date().toISOString()}`);
    lines.push('');

    // ── Live pipeline only — drop Lost/dead deals so Jarvis never briefs on them ──
    const isDead = d => /lost|dead|dropped|closed.?lost/.test((flatten(d.values.stage) || flatten(d.values.status) || '').toLowerCase());
    const liveDeals = dealRecs.filter(d => !isDead(d));

    // ── ACTION ITEMS (computed from deals + Documents Needed notes) ──
    const actionItems = [];
    liveDeals.forEach(d => {
      const v = d.values;
      const stageRaw = flatten(v.stage) || flatten(v.status) || '';
      const stage = stageRaw.toLowerCase();
      if (/won|active|paying|closed.?won|client/.test(stage)) return; // already a client
      const name = flatten(v.name) || '(unnamed deal)';
      const dealNotes = notesByRecord[recId(d)] || [];
      const docNote = dealNotes.find(n => /document/i.test(n.title));
      const docsOutstanding = !!docNote && !/all (docs|documents) received|complete/i.test(docNote.body);
      const contact = refIds(v.associated_people).map(id => personById[id] && personById[id].name).filter(Boolean)[0] || '';
      if (docsOutstanding) {
        actionItems.push(`• ${name} (${stageRaw || stage}) — documents OUTSTANDING. Chase ${contact || 'the contact'} for the required docs (see its Documents Needed note). This is blocking progress.`);
      } else {
        actionItems.push(`• ${name} (${stageRaw || stage}) — follow up to advance${contact ? ' with ' + contact : ''}.`);
      }
    });
    if (actionItems.length) {
      lines.push('⚡ ACTION ITEMS — NEEDS YOUR ATTENTION TODAY:');
      actionItems.forEach(a => lines.push(a));
      lines.push('');
    }

    if (liveDeals.length) {
      lines.push(`DEALS / PIPELINE (${liveDeals.length}):`);
      liveDeals.forEach(d => {
        const v = d.values;
        const name = flatten(v.name) || '(unnamed deal)';
        const stage = flatten(v.stage) || flatten(v.status) || 'unknown';
        const plan = flatten(v.plan_tier) || flatten(v.value);
        const companies = refIds(v.associated_company).map(id => companyById[id] || id).join(', ');
        const contacts = refIds(v.associated_people).map(id => {
          const p = personById[id]; if (!p) return id;
          return p.name + (p.email ? ` <${p.email}>` : '') + (p.phone ? ` ${p.phone}` : '');
        }).join('; ');
        const opened = (flatten(v.created_at) || '').slice(0, 10);
        let line = `• ${name} — Stage: ${stage}`;
        if (plan) line += ` | Plan: ${plan}`;
        if (companies) line += ` | Company: ${companies}`;
        if (contacts) line += ` | Contact(s): ${contacts}`;
        if (opened) line += ` | Opened: ${opened}`;
        lines.push(line);
        // Last-contact note (useful for follow-up advice)
        const lc = refIds(v.associated_people).map(id => personById[id] && personById[id].lastContact).filter(Boolean)[0];
        if (lc) lines.push(`    last contact: ${String(lc).slice(0, 10)}`);
      });
      lines.push('');
      lines.push('Note: "Lead" stage = prospect not yet signed up. Advise Victor on next steps to advance each deal.');
    } else {
      lines.push('(No deals found in Attio yet — pipeline is empty.)');
    }

    return { statusCode: 200, headers, body: JSON.stringify({ brief: lines.join('\n'), generatedAt: Date.now() }) };
  } catch (e) {
    console.error('jarvis-brief failed:', e.message);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Attio read failed', detail: e.message }) };
  }
};
