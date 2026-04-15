const NOOR_HOST = process.env.NOOR_HOST
const NOOR_TOKEN = process.env.NOOR_TOKEN

function normalizePhone(phone) {
  if (!phone) return ''
  return phone.startsWith('+998') ? phone : `+998${phone}`
}

function noorHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Auth': NOOR_TOKEN,
    ...extra,
  }
}

/**
 * Evaluate delivery feasibility.
 * Returns the full response body (evaluated_stage: 1 = ok, 23 = no funds, 27 = no couriers, 28 = out of zone).
 */
async function evaluate(orgLat, orgLon, destLat, destLon) {
  const url = `${NOOR_HOST}/api/v1/orders/eval`
  const body = {
    origin: [{ location: { lon: orgLon, lat: orgLat } }],
    destination: [{ location: { lon: destLon, lat: destLat } }],
    delivery: { type: 'EXPRESS', comment: null, cod: true, r2d: true, insurance: true, packages_qty: 1 },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: noorHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Noor evaluate failed ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Create a Noor Express delivery order.
 * order must include: id, medicinesTotal,
 *   pharmacy: { lat, lng, address, phone, name },
 *   customerLat, customerLng, customerAddress, customerPhone, customerName,
 *   apartment, entrance, floor, intercom, customerComment
 */
async function createOrder(order, acceptLanguage = 'uz') {
  const url = `${NOOR_HOST}/api/v1/orders`

  const floor = order.floor && /^\d+$/.test(order.floor) ? parseInt(order.floor) : null

  const body = {
    vendor_order_id: order.id,
    payment_type: 'BALANCE',
    origin: [
      {
        location: { lon: order.pharmacy.lng, lat: order.pharmacy.lat },
        order: 1,
        address: order.pharmacy.address,
        entrance: null,
        door_phone: null,
        floor: 1,
        apartment: null,
        comment: null,
        client: {
          phone: normalizePhone(order.pharmacy.phone),
          name: order.pharmacy.name,
          comment: null,
        },
      },
    ],
    destination: [
      {
        location: { lon: order.customerLng, lat: order.customerLat },
        order: 2,
        address: order.customerAddress,
        entrance: order.entrance || null,
        door_phone: order.intercom || null,
        floor,
        apartment: order.apartment || null,
        comment: order.customerComment || null,
        client: {
          phone: normalizePhone(order.customerPhone),
          name: order.customerName,
          comment: null,
        },
        products: {
          type_id: 1,
          description: null,
          items: [
            {
              name: 'Медикаменты',
              price_per_unit: Math.round(order.medicinesTotal),
              quantity: 1,
              weight: null,
              height: null,
              width: null,
              length: null,
            },
          ],
        },
      },
    ],
    delivery: { type: 'EXPRESS', comment: null, cod: true, r2d: true, insurance: true, packages_qty: 1 },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: noorHeaders({ 'Accept-Language': acceptLanguage }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Noor createOrder failed ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Re-order (retry finding a courier) for an existing Noor order.
 */
async function reorder(noorOrderId) {
  const url = `${NOOR_HOST}/api/v1/orders/${noorOrderId}/re-order`
  const res = await fetch(url, {
    method: 'POST',
    headers: noorHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Noor reorder failed ${res.status}: ${text}`)
  }
}

/**
 * Cancel a Noor order.
 */
async function cancelOrder(noorOrderId) {
  const url = `${NOOR_HOST}/api/v1/orders/${noorOrderId}/cancel`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: noorHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Noor cancel failed ${res.status}: ${text}`)
  }
}

module.exports = { evaluate, createOrder, reorder, cancelOrder }
