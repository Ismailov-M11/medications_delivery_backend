const crypto = require('crypto')

const BASE_URL = process.env.MULTICARD_BASE_URL || 'https://dev-mesh.multicard.uz'
const APP_ID   = process.env.MULTICARD_APP_ID   || 'rhmt_test'
const SECRET   = process.env.MULTICARD_SECRET   || 'Pw18axeBFo8V7NamKHXX'
const STORE_ID = process.env.MULTICARD_STORE_ID || '6'

let _token = null
let _tokenExpiresAt = 0

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt) return _token

  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ application_id: APP_ID, secret: SECRET }),
  })
  if (!res.ok) throw new Error(`Multicard auth failed: ${res.status}`)
  const json = await res.json()
  _token = json.token
  _tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000
  return _token
}

async function createInvoice({ invoiceId, amount }) {
  const token = await getToken()
  const FRONTEND = process.env.APP_FRONTEND_URL || 'https://app.tezyubor.uz'
  const BACKEND  = process.env.API_URL || 'https://medicationsdeliverybackend-production.up.railway.app'

  const res = await fetch(`${BASE_URL}/payment/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      store_id: STORE_ID,
      amount,
      invoice_id: invoiceId,
      return_url: `${FRONTEND}/?paid=1`,
      return_error_url: `${FRONTEND}/`,
      callback_url: `${BACKEND}/api/webhooks/multicard`,
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

module.exports = { createInvoice, verifySign }
