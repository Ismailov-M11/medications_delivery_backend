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

// GET /api/orders/:token — public
router.get('/:token', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: {
        pharmacy: {
          select: { name: true, address: true, phone: true, lat: true, lng: true }
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

    const result = await noorApi.evaluate(
      order.pharmacy.lat, order.pharmacy.lng,
      order.customerLat, order.customerLng,
    )

    const stage = result?.evaluated_stage
    const available = stage === 1
    const errorMessage = available ? null : (NOOR_EVAL_ERRORS[stage] || `Ошибка оценки (stage ${stage})`)

    // Extract delivery price from Noor evaluate response
    const price = result?.total_delivery_price ?? null

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

    const price = await millenniumApi.calcOrderCost(
      order.pharmacy.lat, order.pharmacy.lng,
      order.customerLat, order.customerLng,
    )

    res.json({ success: true, data: { available: true, price } })
  } catch (err) {
    // calcOrderCost throws on API error — treat as unavailable
    res.json({ success: true, data: { available: false, price: null, error: err.message } })
  }
})

// PUT /api/orders/:token/courier — select courier & confirm
router.put('/:token/courier', async (req, res, next) => {
  try {
    const { courier, selectedCourier, deliveryPrice, trackingUrl } = req.body
    const courierValue = courier || selectedCourier
    if (!courierValue) {
      return res.status(400).json({ success: false, message: 'courier required' })
    }

    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: { pharmacy: { select: { lat: true, lng: true, address: true, phone: true, name: true } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })

    const delivery = Number(deliveryPrice) || 0

    // ── Noor Express ──────────────────────────────────────────────────
    if (courierValue === 'noor') {
      if (!order.customerLat || !order.customerLng) {
        return res.status(400).json({ success: false, message: 'Координаты клиента не указаны' })
      }
      if (!order.pharmacy.lat || !order.pharmacy.lng) {
        return res.status(400).json({ success: false, message: 'Координаты аптеки не настроены' })
      }

      // 1. Evaluate
      const evalResult = await noorApi.evaluate(
        order.pharmacy.lat, order.pharmacy.lng,
        order.customerLat, order.customerLng,
      )
      const stage = evalResult?.evaluated_stage
      if (stage !== 1) {
        const message = NOOR_EVAL_ERRORS[stage] || `Noor: ошибка оценки (stage ${stage})`
        return res.status(400).json({ success: false, message })
      }

      // 2. Create order in Noor
      const noorResponse = await noorApi.createOrder({
        ...order,
        pharmacy: order.pharmacy,
      })
      const noorOrderId = noorResponse?.order?.id ?? null

      const updated = await prisma.order.update({
        where: { token: req.params.token },
        data: {
          selectedCourier: courierValue,
          deliveryPrice: delivery,
          noorOrderId,
          totalPrice: order.medicinesTotal + delivery,
          status: 'confirmed',
        },
      })
      return res.json({ success: true, data: updated })
    }
    // ─────────────────────────────────────────────────────────────────

    // ── Millennium ────────────────────────────────────────────────────
    if (courierValue === 'millennium') {
      if (!order.customerLat || !order.customerLng) {
        return res.status(400).json({ success: false, message: 'Координаты клиента не указаны' })
      }
      if (!order.pharmacy.lat || !order.pharmacy.lng) {
        return res.status(400).json({ success: false, message: 'Координаты аптеки не настроены' })
      }

      const tmResponse = await millenniumApi.createOrder({
        ...order,
        pharmacy: order.pharmacy,
      })
      const millenniumOrderId = tmResponse?.data?.order_id ?? null

      const updated = await prisma.order.update({
        where: { token: req.params.token },
        data: {
          selectedCourier: courierValue,
          deliveryPrice: delivery,
          millenniumOrderId,
          totalPrice: order.medicinesTotal + delivery,
          status: 'confirmed',
        },
      })
      return res.json({ success: true, data: updated })
    }
    // ─────────────────────────────────────────────────────────────────

    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: {
        selectedCourier: courierValue,
        deliveryPrice: delivery,
        trackingUrl: trackingUrl || null,
        totalPrice: order.medicinesTotal + delivery,
        status: 'confirmed',
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
