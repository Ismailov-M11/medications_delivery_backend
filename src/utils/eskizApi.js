const BASE_URL = 'https://notify.eskiz.uz/api'
const EMAIL    = process.env.ESKIZ_EMAIL
const PASSWORD = process.env.ESKIZ_PASSWORD
const FROM     = process.env.ESKIZ_FROM || '4546'

let _token = null
let _tokenExpiresAt = 0

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('998')) return digits
  if (digits.length === 9) return `998${digits}`
  return digits
}

async function getToken() {
  if (_token && Date.now() < _tokenExpiresAt) return _token

  console.log('[eskiz] Requesting new token...')
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Eskiz auth failed: ${res.status}`)
  const json = await res.json()
  _token = json.data?.token
  _tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000
  console.log('[eskiz] Token received, valid for 23h')
  return _token
}

async function sendSms(phone, message) {
  const token = await getToken()
  const mobile_phone = normalizePhone(phone)

  console.log(`[eskiz] Sending SMS → ${mobile_phone}`)
  console.log(`[eskiz] Message: ${message}`)

  const res = await fetch(`${BASE_URL}/message/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ mobile_phone, message, from: FROM }),
  })
  const json = await res.json()

  if (json.status === 'waiting' || json.id) {
    console.log(`[eskiz] ✓ SMS sent → ${mobile_phone} | id: ${json.id} | status: ${json.status}`)
  } else {
    console.warn(`[eskiz] ✗ SMS failed → ${mobile_phone} | response: ${JSON.stringify(json)}`)
  }

  return json
}

module.exports = { sendSms }
