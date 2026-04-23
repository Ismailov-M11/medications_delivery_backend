const crypto = require('crypto')

const BASE_URL = process.env.MULTICARD_BASE_URL || 'https://dev-mesh.multicard.uz'
const APP_ID   = process.env.MULTICARD_APP_ID   || 'rhmt_test'
const SECRET   = process.env.MULTICARD_SECRET   || 'Pw18axeBFo8V7NamKHXX'
const STORE_ID = process.env.MULTICARD_STORE_ID || 'a1df872e-d5aa-11ee-8de8-005056b4367d'

let _token = null
let _tokenExpiresAt = 0

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt) return _token

  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_id: APP_ID, secret: SECRET }),
  })
  if (!res.ok) throw new Error(`Multicard auth failed: ${res.status}`)
  const json = await res.json()
  _token = json.token || json.access_token
  _tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000 // 23h to be safe
  return _token
}

async function createInvoice({ uuid, amount, description, successUrl, failUrl }) {
  const token = await getToken()
  const res = await fetch(`${BASE_URL}/invoices/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      store_id: STORE_ID,
      amount,
      currency: 'UZS',
      description: description || 'Подписка на 30 дней',
      success_url: successUrl || `${process.env.APP_FRONTEND_URL || 'https://app.tezyubor.uz'}/?paid=1`,
      fail_url: failUrl || `${process.env.APP_FRONTEND_URL || 'https://app.tezyubor.uz'}/`,
      callback_url: `${process.env.API_URL || 'https://api.tezyubor.uz'}/api/webhooks/multicard`,
      uuid,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Multicard createInvoice failed: ${res.status} ${text}`)
  }
  return res.json()
}

function verifySign(invoiceId, amount, receivedSign) {
  const expected = crypto
    .createHash('md5')
    .update(`${STORE_ID}${invoiceId}${amount}${SECRET}`)
    .digest('hex')
  return expected === receivedSign
}

module.exports = { createInvoice, verifySign, STORE_ID }
