const express = require('express')
const prisma = require('../config/db')
const { auth } = require('../middleware/auth')
const noorApi = require('../utils/noorApi')
const millenniumApi = require('../utils/millenniumApi')

const NOOR_EVAL_ERRORS = {
  23: 'Недостаточно средств на балансе Noor',
  27: 'Нет свободных курьеров в вашем районе',
  28: 'Адрес доставки вне зоны обслуживания Noor',
}

const router = express.Router()

// GET /api/orders/:token/saved-addresses — public, returns saved addresses for this customer+pharmacy
router.get('/:token/saved-addresses', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (!order.customerPhone) return res.json({ success: true, data: { addresses: [] } })

    const pastOrders = await prisma.order.findMany({
      where: {
        pharmacyId: order.pharmacyId,
        customerPhone: order.customerPhone,
        customerAddress: { not: null },
        token: { not: order.token },
        status: { in: ['awaiting_confirmation', 'confirmed', 'courier_pickup', 'courier_picked', 'courier_delivery', 'delivered'] },
      },
      select: {
        customerAddress: true,
        apartment: true,
        entrance: true,
        floor: true,
        intercom: true,
        customerLat: true,
        customerLng: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const seen = new Set()
    const addresses = []
    for (const o of pastOrders) {
      if (!o.customerAddress || seen.has(o.customerAddress)) continue
      seen.add(o.customerAddress)
      addresses.push({
        customerAddress: o.customerAddress,
        apartment: o.apartment,
        entrance: o.entrance,
        floor: o.floor,
        intercom: o.intercom,
        customerLat: o.customerLat,
        customerLng: o.customerLng,
      })
    }

    res.json({ success: true, data: { addresses } })
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:token — public
router.get('/:token', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: {
        pharmacy: {
          select: { name: true, address: true, phone: true, lat: true, lng: true, allowedCouriers: true }
        }
      }
    })
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }
    // Flatten pharmacy coords onto order for frontend convenience
    const response = {
      ...order,
      pharmacyName: order.pharmacy.name,
      pharmacyAddress: order.pharmacy.address,
      pharmacyPhone: order.pharmacy.phone,
      pharmacyLat: order.pharmacy.lat,
      pharmacyLng: order.pharmacy.lng,
      pharmacyAllowedCouriers: order.pharmacy.allowedCouriers,
    }
    res.json({ success: true, data: response })
  } catch (err) {
    next(err)
  }
})

// PUT /api/orders/:token/confirm — fill customer details
router.put('/:token/confirm', async (req, res, next) => {
  try {
    const {
      customerName, customerPhone, customerAddress, customerComment,
      customerLat, customerLng,
      apartment, entrance, floor, intercom,
    } = req.body
    if (!customerName || !customerPhone || !customerAddress) {
      return res.status(400).json({ success: false, message: 'customerName, customerPhone, customerAddress required' })
    }
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Order already confirmed' })
    }
    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: {
        customerName,
        customerPhone,
        customerAddress,
        apartment:  apartment  || null,
        entrance:   entrance   || null,
        floor:      floor      || null,
        intercom:   intercom   || null,
        customerComment: customerComment || null,
        customerLat: customerLat ?? null,
        customerLng: customerLng ?? null,
      }
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:token/noor/evaluate — get Noor price & availability before confirming
router.post('/:token/noor/evaluate', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: { pharmacy: { select: { lat: true, lng: true } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (!order.customerLat || !order.customerLng) {
      return res.status(400).json({ success: false, message: 'Координаты клиента не указаны' })
    }
    if (!order.pharmacy.lat || !order.pharmacy.lng) {
      return res.status(400).json({ success: false, message: 'Координаты аптеки не настроены' })
    }

    console.log(`[Noor] evaluate coords: pharmacy(${order.pharmacy.lat},${order.pharmacy.lng}) -> customer(${order.customerLat},${order.customerLng})`)

    const result = await noorApi.evaluate(
      order.pharmacy.lat, order.pharmacy.lng,
      order.customerLat, order.customerLng,
    )

    console.log('[Noor] evaluate response:', JSON.stringify(result))

    const stage = result?.evaluated_stage
    const available = stage === 1
    const errorMessage = available ? null : (NOOR_EVAL_ERRORS[stage] || `Ошибка оценки (stage ${stage})`)

    const price = result?.total_delivery_price ?? null

    console.log(`[Noor] result: available=${available}, stage=${stage}, price=${price}, error=${errorMessage}`)

    res.json({ success: true, data: { available, stage, price, error: errorMessage } })
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/:token/millennium/evaluate — get Millennium price before confirming
router.post('/:token/millennium/evaluate', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: { pharmacy: { select: { lat: true, lng: true } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (!order.customerLat || !order.customerLng) {
      return res.status(400).json({ success: false, message: 'Координаты клиента не указаны' })
    }
    if (!order.pharmacy.lat || !order.pharmacy.lng) {
      return res.status(400).json({ success: false, message: 'Координаты аптеки не настроены' })
    }

    console.log(`[Millennium] evaluate coords: pharmacy(${order.pharmacy.lat},${order.pharmacy.lng}) -> customer(${order.customerLat},${order.customerLng})`)

    const price = await millenniumApi.calcOrderCost(
      order.pharmacy.lat, order.pharmacy.lng,
      order.customerLat, order.customerLng,
    )

    console.log(`[Millennium] result: available=true, price=${price}`)

    res.json({ success: true, data: { available: true, price } })
  } catch (err) {
    console.log('[Millennium] error:', err.message)
    res.json({ success: true, data: { available: false, price: null, error: err.message } })
  }
})

// PUT /api/orders/:token/courier — customer selects courier, sets awaiting_confirmation
router.put('/:token/courier', async (req, res, next) => {
  try {
    const { courier, selectedCourier, deliveryPrice } = req.body
    const courierValue = courier || selectedCourier
    if (!courierValue) {
      return res.status(400).json({ success: false, message: 'courier required' })
    }

    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    const delivery = Number(deliveryPrice) || 0

    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: {
        selectedCourier: courierValue,
        deliveryPrice: delivery,
        totalPrice: (order.medicinesTotal || 0) + delivery,
        status: 'awaiting_confirmation',
      },
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// PUT /api/orders/:token/status — update status (pharmacy auth)
router.put('/:token/status', auth, async (req, res, next) => {
  try {
    const { status } = req.body
    const validStatuses = ['pending', 'confirmed', 'courier_pickup', 'courier_picked', 'courier_delivery', 'delivered']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' })
    }
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    // Pharmacy can only update their own orders
    if (req.user.role === 'pharmacy' && order.pharmacyId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }
    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: { status }
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

module.exports = router
