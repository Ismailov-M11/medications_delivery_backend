const crypto = require('crypto')

const TM_HOST = process.env.MILLENNIUM_API_HOST   // e.g. https://api.millennium.tm.taxi
const API_KEY = process.env.MILLENNIUM_API_KEY     // api_key param
const SECRET_KEY = process.env.MILLENNIUM_SECRET_KEY // for MD5 signature

/**
 * Build MD5 Signature for TaxiMaster API.
 * Formula: MD5(sorted_param_values_concatenated + SECRET_KEY)
 */
function buildSignature(params) {
  const values = Object.keys(params)
    .sort()
    .map((k) => params[k])
    .join('')
  return crypto.createHash('md5').update(values + SECRET_KEY).digest('hex')
}

function normalizePhone(phone) {
  if (!phone) return ''
  return phone.startsWith('+998') ? phone : `+998${phone}`
}

/**
 * Create a delivery order in TaxiMaster (Millennium).
 * Returns the full response body; on success response.data.order_id is the Millennium order ID.
 */
async function createOrder(order) {
  const url = `${TM_HOST}/create_order2`

  const params = {
    api_key: API_KEY,
    phone: normalizePhone(order.customerPhone),
    customer_name: order.customerName,
    // Origin — pharmacy (pickup)
    source: order.pharmacy.address,
    source_lat: String(order.pharmacy.lat),
    source_lon: String(order.pharmacy.lng),
    // Destination — customer
    destination: order.customerAddress,
    destination_lat: String(order.customerLat),
    destination_lon: String(order.customerLng),
    // Extra delivery details
    entrance: order.entrance || '',
    apartment: order.apartment || '',
    comments: [
      order.customerComment,
      order.floor ? `Этаж: ${order.floor}` : '',
      order.intercom ? `Домофон: ${order.intercom}` : '',
      `Заказ: ${order.token}`,
    ]
      .filter(Boolean)
      .join('. '),
  }

  const signature = buildSignature(params)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Signature: signature,
    },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Millennium createOrder failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`Millennium API error ${data.code}: ${data.descr}`)
  }
  return data
}

module.exports = { createOrder }
