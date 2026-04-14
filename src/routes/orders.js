const express = require('express')
const prisma = require('../config/db')
const { auth } = require('../middleware/auth')

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

// PUT /api/orders/:token/customer — fill customer details
router.put('/:token/customer', async (req, res, next) => {
  try {
    const { name, phone, address, comment, coordinates } = req.body
    if (!name || !phone || !address) {
      return res.status(400).json({ success: false, message: 'name, phone, address required' })
    }
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Order already confirmed' })
    }
    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: {
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        customerComment: comment || null,
        customerLat: coordinates?.lat ?? null,
        customerLng: coordinates?.lng ?? null,
      }
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// PUT /api/orders/:token/courier — select courier & confirm
router.put('/:token/courier', async (req, res, next) => {
  try {
    const { selectedCourier, deliveryPrice, trackingUrl } = req.body
    if (!selectedCourier) {
      return res.status(400).json({ success: false, message: 'selectedCourier required' })
    }
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    const delivery = Number(deliveryPrice) || 0
    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: {
        selectedCourier,
        deliveryPrice: delivery,
        trackingUrl: trackingUrl || null,
        totalPrice: order.medicinesTotal + delivery,
        status: 'confirmed',
      }
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
