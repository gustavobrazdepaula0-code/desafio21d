const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID || '1384249610451971';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN || 'EAANyPuQ3VpoBSwz2whKQ5YWJzzlE8LlEBeVdEmfFzdu2ievQhH7sj7TxXxhZChNX7wbG9BUVpwieCjMIH60b7jUySJi7Myace0CtpZBZAQjLxzo0epOI7EsZBpbWIALyalgJTBaDHOZAkPZCCnkwJot1SZAFVsIjQyxy7wfGwWmMTCxjts5MzP9PMZCriWB22HbQxgZDZD';

function sha256(val) {
  if (!val) return null;
  return crypto.createHash('sha256').update(String(val).trim().toLowerCase()).digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    const userData = {
      client_ip_address: ip || undefined,
      client_user_agent: ua || undefined,
      fbp: body.fbp || undefined,
      fbc: body.fbc || undefined
    };
    if (body.email) userData.em = [sha256(body.email)];
    if (body.phone) userData.ph = [sha256(String(body.phone).replace(/\D/g, ''))];

    const payload = {
      data: [
        {
          event_name: body.event_name || 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id || ('ev_' + Date.now()),
          event_source_url: body.event_source_url || req.headers.referer || '',
          action_source: 'website',
          user_data: userData,
          custom_data: body.custom_data || {}
        }
      ]
    };

    const url = 'https://graph.facebook.com/v19.0/' + PIXEL_ID + '/events?access_token=' + encodeURIComponent(ACCESS_TOKEN);
    const fbRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const fbJson = await fbRes.json();
    return res.status(200).json({ ok: true, fb: fbJson });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
};