const express = require('express')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { customAlphabet } = require('nanoid')
const prisma = require('../config/db')
const { auth } = require('../middleware/auth')
const { checkSubscription } = require('../middleware/checkSubscription')

const router = express.Router()

async function generateOrderToken() {
  while (true) {
    const digits = Math.floor(1000000 + Math.random() * 9000000).toString()
    const token = `ORD${digits}`
    const existing = await prisma.order.findUnique({ where: { token } })
    if (!existing) return token
  }
}

router.use(auth)

// GET /api/pharmacy/me — profile (no subscription check, needed for location setup)
router.get('/me', async (req, res, next) => {
  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, ownerName: true, address: true, phone: true,
        email: true, lat: true, lng: true, login: true,
        isActive: true, subscriptionExpiry: true, allowedCouriers: true, createdAt: true,
      }
    })
    if (!pharmacy) return res.status(404).json({ success: false, message: 'Not found' })
    res.json({ success: true, data: pharmacy })
  } catch (err) {
    next(err)
  }
})

// PUT /api/pharmacy/me — update own profile
router.put('/me', async (req, res, next) => {
  try {
    const { name, ownerName, phone, address, currentPassword, newPassword } = req.body
    const data = {}
    if (name !== undefined && name.trim()) data.name = name.trim()
    if (ownerName !== undefined) data.ownerName = ownerName || null
    if (phone !== undefined && phone.trim()) data.phone = phone.trim()
    if (address !== undefined) data.address = address || null

    if (newPassword && newPassword.trim()) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to set a new password' })
      }
      const pharmacy = await prisma.pharmacy.findUnique({ where: { id: req.user.id } })
      const valid = await bcrypt.compare(currentPassword, pharmacy.password)
      if (!valid) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' })
      }
      if (newPassword.trim().length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' })
      }
      data.password = await bcrypt.hash(newPassword.trim(), 10)
    }

    const updated = await prisma.pharmacy.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true, name: true, ownerName: true, address: true, phone: true,
        email: true, lat: true, lng: true, login: true,
        isActive: true, subscriptionExpiry: true,
      }
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// PUT /api/pharmacy/location — set own location (no subscription check)
router.put('/location', async (req, res, next) => {
  try {
    const { lat, lng, address } = req.body
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'lat and lng are required' })
    }
    const updated = await prisma.pharmacy.update({
      where: { id: req.user.id },
      data: {
        lat: Number(lat),
        lng: Number(lng),
        address: address || null,
        requiresLocation: false,
      },
      select: { id: true, lat: true, lng: true, address: true, requiresLocation: true }
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// POST /api/pharmacy/subscription/pay — create Multicard invoice (no subscription check needed)
router.post('/subscription/pay', async (req, res, next) => {
  try {
    const { createInvoice } = require('../utils/multicardApi')
    const invoiceId = crypto.randomUUID()
    const amount = 10000000 // 100,000 sum in tiyins

    const result = await createInvoice({ invoiceId, amount })

    await prisma.subscriptionPayment.create({
      data: {
        pharmacyId: req.user.id,
        invoiceId,
        amount,
        status: 'pending',
      }
    })

    res.json({ success: true, data: { checkoutUrl: result.data?.checkout_url } })
  } catch (err) {
    next(err)
  }
})

// All routes below require active subscription
router.use(checkSubscription)

// GET /api/pharmacy/orders
router.get('/orders', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 20))
    const where = { pharmacyId: req.user.id }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ])

    res.json({ success: true, data: { orders, total, page, pageSize } })
  } catch (err) {
    next(err)
  }
})

// POST /api/pharmacy/orders
router.post('/orders', async (req, res, next) => {
  try {
    const { pharmacyComment, medicinesTotal } = req.body
    const token = await generateOrderToken()
    const order = await prisma.order.create({
      data: {
        token,
        pharmacyId: req.user.id,
        pharmacyComment: pharmacyComment || null,
        medicinesTotal: medicinesTotal != null ? Number(medicinesTotal) : 0,
      },
    })
    const baseUrl = process.env.CLIENT_URL || 'https://tezyubor.uz'
    const orderUrl = `${baseUrl}/order/${token}`
    res.status(201).json({ success: true, data: { order, orderUrl } })
  } catch (err) {
    next(err)
  }
})

// PUT /api/pharmacy/orders/:token/confirm — merchant confirms order, calls courier API
router.put('/orders/:token/confirm', async (req, res, next) => {
  try {
    const noorApi = require('../utils/noorApi')
    const millenniumApi = require('../utils/millenniumApi')
    const SKIP = process.env.SKIP_COURIER_DISPATCH === 'true'

    const order = await prisma.order.findUnique({
      where: { token: req.params.token },
      include: { pharmacy: { select: { lat: true, lng: true, address: true, phone: true, name: true } } },
    })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.pharmacyId !== req.user.id) return res.status(403).json({ success: false, message: 'Forbidden' })
    if (order.status !== 'awaiting_confirmation') {
      return res.status(400).json({ success: false, message: 'Order is not awaiting confirmation' })
    }

    const courier = order.selectedCourier

    let noorOrderId = order.noorOrderId
    let millenniumOrderId = order.millenniumOrderId
    let trackingUrl = order.trackingUrl

    if (!SKIP) {
      if (courier === 'noor') {
        const evalResult = await noorApi.evaluate(order.pharmacy.lat, order.pharmacy.lng, order.customerLat, order.customerLng)
        const stage = evalResult?.evaluated_stage
        if (stage !== 1) {
          const NOOR_ERRORS = { 23: 'Недостаточно средств на балансе Noor', 27: 'Нет свободных курьеров', 28: 'Адрес вне зоны Noor' }
          return res.status(400).json({ success: false, message: NOOR_ERRORS[stage] || `Noor: ошибка (stage ${stage})` })
        }
        const noorRes = await noorApi.createOrder({ ...order, pharmacy: order.pharmacy })
        noorOrderId = noorRes?.order?.id ?? null
        trackingUrl = noorRes?.order?.link ?? noorRes?.order?.tracking_url ?? null
      } else if (courier === 'millennium') {
        const tmRes = await millenniumApi.createOrder({ ...order, pharmacy: order.pharmacy })
        millenniumOrderId = tmRes?.data?.order_id ?? null
      }
    }

    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: { status: 'confirmed', noorOrderId, millenniumOrderId, trackingUrl },
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// PUT /api/pharmacy/orders/:token/cancel — merchant cancels order
router.put('/orders/:token/cancel', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { token: req.params.token } })
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' })
    if (order.pharmacyId !== req.user.id) return res.status(403).json({ success: false, message: 'Forbidden' })
    const updated = await prisma.order.update({
      where: { token: req.params.token },
      data: { status: 'cancelled' },
    })
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
})

// GET /api/pharmacy/analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const pharmacyId = req.user.id
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [totalOrders, aggregates, ordersByStatus, ordersByCourier, recentOrders] = await Promise.all([
      prisma.order.count({ where: { pharmacyId } }),
      prisma.order.aggregate({
        where: { pharmacyId },
        _sum: { medicinesTotal: true, deliveryPrice: true, totalPrice: true }
      }),
      prisma.order.groupBy({ by: ['status'], where: { pharmacyId }, _count: { id: true } }),
      prisma.order.groupBy({
        by: ['selectedCourier'],
        where: { pharmacyId, selectedCourier: { not: null } },
        _count: { id: true }
      }),
      prisma.order.findMany({
        where: { pharmacyId, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' }
      })
    ])

    const ordersByDay = {}
    recentOrders.forEach(o => {
      const day = o.createdAt.toISOString().split('T')[0]
      ordersByDay[day] = (ordersByDay[day] || 0) + 1
    })

    res.json({
      success: true,
      data: {
        totalOrders,
        totalMedicinesAmount: aggregates._sum.medicinesTotal || 0,
        totalDeliveryAmount: aggregates._sum.deliveryPrice || 0,
        totalRevenue: aggregates._sum.totalPrice || 0,
        ordersByStatus: ordersByStatus.map(s => ({ status: s.status, count: s._count.id })),
        ordersByCourier: ordersByCourier.map(c => ({ courier: c.selectedCourier, count: c._count.id })),
        ordersByDay: Object.entries(ordersByDay).map(([date, count]) => ({ date, count }))
      }
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/pharmacy/clients
router.get('/clients', async (req, res, next) => {
  try {
    const pharmacyId = req.user.id
    const orders = await prisma.order.findMany({
      where: { pharmacyId, customerPhone: { not: null } },
      select: {
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    })

    const clientsMap = new Map()
    for (const order of orders) {
      const phone = order.customerPhone
      if (!phone) continue
      if (!clientsMap.has(phone)) {
        clientsMap.set(phone, {
          phone,
          name: order.customerName,
          addresses: new Set(),
          ordersCount: 0,
          lastOrderAt: order.createdAt,
        })
      }
      const client = clientsMap.get(phone)
      client.ordersCount++
      if (order.customerAddress) {
        client.addresses.add(order.customerAddress)
      }
    }

    const clients = Array.from(clientsMap.values())
      .map(c => ({ ...c, addresses: Array.from(c.addresses) }))
      .sort((a, b) => b.ordersCount - a.ordersCount)

    res.json({ success: true, data: { clients, total: clients.length } })
  } catch (err) {
    next(err)
  }
})

module.exports = router
