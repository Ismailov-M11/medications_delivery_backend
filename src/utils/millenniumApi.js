const crypto = require('crypto')
const https = require('https')

const TM_HOST    = process.env.MILLENNIUM_API_HOST   || 'https://millennium.tm.taxi:8089'
const SECRET_KEY = process.env.MILLENNIUM_SECRET_KEY || 'DEB3C898-50D7-489C-98E0-B7CA7C203E3D'
const USER_ID    = process.env.MILLENNIUM_USER_ID    || '242'
const CLIENT_ID  = Number(process.env.MILLENNIUM_CLIENT_ID        || '164274')
const CREW_GROUP_ID = Number(process.env.MILLENNIUM_CREW_GROUP_ID || '25')

function normalizePhone(phone) {
  if (!phone) return ''
  return phone.startsWith('+998') ? phone : `+998${phone}`
}

function buildSignature(bodyStr) {
  return crypto.createHash('md5').update(bodyStr + SECRET_KEY).digest('hex')
}

function sourceTime() {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/**
 * POST to TaxiMaster API — bypasses SSL cert validation (self-signed on millennium.tm.taxi)
 */
function tmPost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const url = new URL(`${TM_HOST}${path}`)

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      rejectUnauthorized: false, // bypass self-signed cert
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Signature': buildSignature(payload),
        'X-User-Id': USER_ID,
      },
    }

    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', (chunk) => { raw += chunk })
      res.on('end', () => {
        try {
          const data = JSON.parse(raw)
          if (data.code !== 0) {
            reject(new Error(`Millennium API error ${data.code}: ${data.descr}`))
          } else {
            resolve(data)
          }
        } catch {
          reject(new Error(`Millennium invalid JSON: ${raw}`))
        }
      })
    })

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/**
 * Calculate delivery cost (calc_order_cost2).
 * Returns price in UZS (data.sum) or throws on error.
 */
async function calcOrderCost(pharmacyLat, pharmacyLng, customerLat, customerLng) {
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
  const data = await tmPost('/common_api/1.0/calc_order_cost2', body)
  return data.data?.sum ?? null
}

/**
 * Create delivery order (create_order2).
 * Returns full response; data.order_id = Millennium order ID.
 */
async function createOrder(order) {
  const details = [
    order.entrance  ? `Подъезд: ${order.entrance}` : '',
    order.intercom  ? `Домофон: ${order.intercom}` : '',
    order.floor     ? `Этаж: ${order.floor}`       : '',
    order.apartment ? `Кв: ${order.apartment}`     : '',
  ].filter(Boolean).join('. ')

  const comment = [
    `Заказ: ${order.token}`,
    details,
    order.customerComment ? `Комментарий: ${order.customerComment}` : '',
    `Номер клиента: ${(order.customerPhone || '').replace(/\s+/g, '')}`,
  ].filter(Boolean).join('\n')

  const sourceAddress = order.pharmacy.name || ''

  const body = {
    crew_group_id: CREW_GROUP_ID,
    client_id: CLIENT_ID,
    phone: normalizePhone(order.pharmacy.phone),
    addresses: [
      { address: sourceAddress,         lat: order.pharmacy.lat, lon: order.pharmacy.lng },
      { address: order.customerAddress, lat: order.customerLat,  lon: order.customerLng  },
    ],
    source_time: sourceTime(),
    comment,
    check_duplicate: false,
    attribute_values: [{ id: 232, bool_value: true }],
  }
  return tmPost('/common_api/1.0/create_order2', body)
}

module.exports = { calcOrderCost, createOrder }
