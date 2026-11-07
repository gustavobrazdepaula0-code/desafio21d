const crypto = require('crypto');

const PIXEL_ID = process.env.META_PIXEL_ID || '1384249610451971';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN || 'EAANyPuQ3VpoBSwz2whKQ5YWJzzlE8LlEBeVdEmfFzdu2ievQhH7sj7TxXxhZChNX7wbG9BUVpwieCjMIH60b7jUySJi7Myace0CtpZBZAQjLxzo0epOI7EsZBpbWIALyalgJTBaDHOZAkPZCCnkwJot1SZAFVsIjQyxy7wfGwWmMTCxjts5MzP9PMZCriWB22HbQxgZDZD';

function sha256(val) {
  if (!val) return null;
  return crypto.createHash('sha256').update(String(val).trim().toLowerCase()).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true, msg: 'Hotmart Webhook Active' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const eventType = String(body.event || body.status || '').toUpperCase();
    // Dispara apenas em compras aprovadas
    if (eventType && !eventType.includes('APPROVED') && !eventType.includes('COMPLETE')) {
      return res.status(200).json({ ok: true, ignored: eventType });
    }

    const data = body.data || body;
    const buyer = data.buyer || {};
    const purchase = data.purchase || {};
    const price = (purchase.price && purchase.price.value) || purchase.original_offer_price?.value || 19.00;
    const currency = (purchase.price && purchase.price.currency_value) || 'USD';
    const txId = purchase.transaction || data.transaction || ('hm_' + Date.now());

    const emHash = buyer.email ? sha256(buyer.email) : null;
    const phRaw = (buyer.checkout_phone || buyer.phone || '').replace(/\D/g, '');
    const phHash = phRaw ? sha256(phRaw) : null;

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: nowSec,
          event_id: String(txId),
          action_source: 'website',
          user_data: {
            em: emHash ? [emHash] : undefined,
            ph: phHash ? [phHash] : [null]
          },
          custom_data: {
            currency: String(currency),
            value: String(price)
          },
          original_event_data: {
            event_name: 'Purchase',
            event_time: nowSec
          }
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