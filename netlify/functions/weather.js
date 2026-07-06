/**
 * Skyrise Pro — Weather tool for Jarvis
 * Route: /api/weather?location=<city>  ->  /.netlify/functions/weather
 *
 * Free, no API key (Open-Meteo geocoding + forecast). Returns a short spoken-ready
 * summary Jarvis can read out. Registered as a server tool on the ElevenLabs agent.
 */

const WMO = {
  0:'clear skies',1:'mainly clear',2:'partly cloudy',3:'overcast',
  45:'foggy',48:'freezing fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',
  56:'freezing drizzle',57:'freezing drizzle',61:'light rain',63:'rain',65:'heavy rain',
  66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',
  77:'snow grains',80:'light rain showers',81:'rain showers',82:'violent rain showers',
  85:'snow showers',86:'heavy snow showers',95:'thunderstorms',96:'thunderstorms with hail',99:'thunderstorms with hail'
};

exports.handler = async function (event) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }, body: '' };

  const q = event.queryStringParameters || {};
  let location = q.location || '';
  if (!location && event.body) { try { location = (JSON.parse(event.body).location) || ''; } catch (e) {} }
  location = String(location).trim().slice(0, 80);
  if (!location) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'location required' }) };

  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const gd = await g.json();
    if (!gd.results || !gd.results.length) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ summary: `I couldn't find a place called "${location}", sir.` }) };
    }
    const p = gd.results[0];
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`);
    const wd = await w.json();
    const c = wd.current || {};
    const d = (wd.daily || {});
    const desc = WMO[c.weather_code] || 'mixed conditions';
    const place = [p.name, p.admin1, p.country_code].filter(Boolean).join(', ');
    const hi = d.temperature_2m_max ? Math.round(d.temperature_2m_max[0]) : null;
    const lo = d.temperature_2m_min ? Math.round(d.temperature_2m_min[0]) : null;
    let summary = `${place}: ${desc}, ${Math.round(c.temperature_2m)}°F (feels like ${Math.round(c.apparent_temperature)}°)`;
    if (hi != null && lo != null) summary += `, high ${hi}° / low ${lo}°`;
    summary += `, humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} mph.`;
    return { statusCode: 200, headers: cors, body: JSON.stringify({ summary, place, temperature_f: Math.round(c.temperature_2m), conditions: desc, high_f: hi, low_f: lo }) };
  } catch (e) {
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'weather lookup failed' }) };
  }
};
