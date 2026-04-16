const crypto = require('crypto')

const TM_HOST   = process.env.MILLENNIUM_API_HOST || 'https://millennium.tm.taxi:8089'
const SECRET_KEY = process.env.MILLENNIUM_SECRET_KEY || '61CB859C-F7A5-4B68-B83E-DE235517B99D'
const USER_ID    = process.env.MILLENNIUM_USER_ID   || '189'
const CLIENT_ID  = Number(process.env.MILLENNIUM_CLIENT_ID  || '145964')
// crew_group_id: 25 = test, 4 = prod
const CREW_GROUP_ID = Number(process.env.MILLENNIUM_CREW_GROUP_ID || '25')

/**
 * TaxiMaster Signature = MD5(JSON_body_string + SECRET_KEY)
 */
function buildSignature(body) {
  const str = JSON.stringify(body) + SECRET_KEY
  return crypto.createHash('md5').update(str).digest('hex')
}

function tmHeaders(body) {
  return {
    'Content-Type': 'application/json',
    'Signature': buildSignature(body),
    'X-User-Id': USER_ID,
  }
}

function sourceTime() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  )
}

/**
 * Calculate delivery cost before creating order.
 * Returns data.sum (delivery price in UZS) or null on failure.
 */
async function calcOrderCost(pharmacyLat, pharmacyLng, customerLat, customerLng) {
  const url = `${TM_HOST}/common_api/1.0/calc_order_cost2`

  const body = {
    crew_group_id: CREW_GROUP_ID,
    client_id: CLIENT_ID,
    analyze_route: true,
    source_time: sourceTime(),
    source_lat: pharmacyLat,
    source_lon: pharmacyLng,
    dest_lat: customerLat,
    dest_lon: customerLng,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: tmHeaders(body),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Millennium calcOrderCost failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`Millennium API error ${data.code}: ${data.descr}`)
  }

  return data.data?.sum ?? null
}

/**
 * Create a delivery order in TaxiMaster (Millennium).
 * Returns full response; on success response.data.order_id is the Millennium order ID.
 */
async function createOrder(order) {
  const url = `${TM_HOST}/common_api/1.0/create_order2`

  const comment = [
    order.customerComment,
    order.floor     ? `Этаж: ${order.floor}`       : '',
    order.intercom  ? `Домофон: ${order.intercom}`  : '',
    order.entrance  ? `Подъезд: ${order.entrance}`  : '',
    order.apartment ? `Кв: ${order.apartment}`      : '',
    `Заказ: ${order.token}`,
  ]
    .filter(Boolean)
    .join('. ')

  const body = {
    crew_group_id: CREW_GROUP_ID,
    client_id: CLIENT_ID,
    phone: order.customerPhone,
    addresses: [
      // Origin — pharmacy (pickup point)
      {
        address: order.pharmacy.address,
        lat: order.pharmacy.lat,
        lon: order.pharmacy.lng,
      },
      // Destination — customer
      {
        address: order.customerAddress,
        lat: order.customerLat,
        lon: order.customerLng,
      },
    ],
    source_time: sourceTime(),
    comment,
    check_duplicate: false,
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: tmHeaders(body),
    body: JSON.stringify(body),
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

module.exports = { calcOrderCost, createOrder }
