const express = require('express')
const bcrypt = require('bcryptjs')
const prisma = require('../config/db')
const { auth, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(auth)
router.use(requireRole('admin'))

// GET /api/admin/orders
router.get('/orders', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, parseInt(req.query.limit) || 20)
    const skip = (page - 1) * limit
    const where = {}
    if (req.query.pharmacyId) where.pharmacyId = req.query.pharmacyId

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { pharmacy: { select: { name: true } } }
      }),
      prisma.order.count({ where })
    ])
    res.json({
      success: true,
      data: { orders, total, page, pages: Math.ceil(total / limit) }
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/pharmacies
router.get('/pharmacies', async (req, res, next) => {
  try {
    // Auto-deactivate expired subscriptions
    await prisma.pharmacy.updateMany({
      where: {
        isActive: true,
        subscriptionExpiry: { lt: new Date() }
      },
      data: { isActive: false }
    })

    const pharmacies = await prisma.pharmacy.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, ownerName: true, address: true, phone: true,
        lat: true, lng: true, login: true,
        isActive: true, subscriptionExpiry: true, allowedCouriers: true, createdAt: true,
        _count: { select: { orders: true } }
      }
    })
    res.json({ success: true, data: { pharmacies } })
  } catch (err) {
    next(err)
  }
})

// POST /api/admin/pharmacies
router.post('/pharmacies', async (req, res, next) => {
  try {
    const { name, ownerName, address, phone, login, password, lat, lng, subscriptionExpiry, allowedCouriers } = req.body
    if (!name || !phone || !login || !password) {
      return res.status(400).json({ success: false, message: 'All fields required' })
    }
    const exists = await prisma.pharmacy.findUnique({ where: { login } })
    if (exists) {
      return res.status(409).json({ success: false, message: 'Login already taken' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const pharmacy = await prisma.pharmacy.create({
      data: {
        name,
        ownerName: ownerName || null,
        address: address || null,
        phone,
        login,
        password: hashed,
        lat: lat ? Number(lat) : null,
        lng: lng ? Number(lng) : null,
        subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : null,
        allowedCouriers: Array.isArray(allowedCouriers) ? allowedCouriers.join(',') : (allowedCouriers || 'yandex,noor,millennium'),
      }
    })
    const { password: _, ...safePharmacy } = pharmacy
    res.status(201).json({ success: true, data: safePharmacy })
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/pharmacies/:id
router.put('/pharmacies/:id', async (req, res, next) => {
  try {
    const { name, ownerName, address, phone, isActive, subscriptionExpiry, login, password, lat, lng, allowedCouriers } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (ownerName !== undefined) data.ownerName = ownerName || null
    if (address !== undefined) data.address = address || null
    if (phone !== undefined) data.phone = phone
    if (isActive !== undefined) data.isActive = Boolean(isActive)
    if (subscriptionExpiry !== undefined) data.subscriptionExpiry = subscriptionExpiry ? new Date(subscriptionExpiry) : null
    if (lat !== undefined) data.lat = lat ? Number(lat) : null
    if (lng !== undefined) data.lng = lng ? Number(lng) : null
    if (allowedCouriers !== undefined) {
      data.allowedCouriers = Array.isArray(allowedCouriers) ? allowedCouriers.join(',') : (allowedCouriers || 'yandex,noor,millennium')
    }

    if (login !== undefined && login.trim()) {
      // Check login uniqueness (exclude current pharmacy)
      const exists = await prisma.pharmacy.findFirst({
        where: { login: login.trim(), NOT: { id: req.params.id } }
      })
      if (exists) {
        return res.status(409).json({ success: false, message: 'Login already taken by another pharmacy' })
      }
      data.login = login.trim()
    }

    if (password !== undefined && password.trim()) {
      data.password = await bcrypt.hash(password.trim(), 10)
    }

    const pharmacy = await prisma.pharmacy.update({
      where: { id: req.params.id },
      data,
      select: {
        id: true, name: true, ownerName: true, address: true, phone: true, login: true,
        lat: true, lng: true, isActive: true, subscriptionExpiry: true, createdAt: true
      }
    })
    res.json({ success: true, data: pharmacy })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/admin/pharmacies/:id — soft delete
router.delete('/pharmacies/:id', async (req, res, next) => {
  try {
    await prisma.pharmacy.update({
      where: { id: req.params.id },
      data: { isActive: false }
    })
    res.json({ success: true, message: 'Pharmacy deactivated' })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/clients
router.get('/clients', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerPhone: { not: null } },
      select: {
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        apartment: true,
        entrance: true,
        floor: true,
        intercom: true,
        createdAt: true,
        pharmacy: { select: { name: true } }
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
          pharmacies: new Set(),
          ordersCount: 0,
          lastOrderAt: order.createdAt,
        })
      }
      const client = clientsMap.get(phone)
      client.ordersCount++
      if (order.customerAddress) {
        const parts = [
          order.apartment ? `кв. ${order.apartment}` : null,
          order.entrance  ? `п. ${order.entrance}`   : null,
          order.floor     ? `эт. ${order.floor}`     : null,
          order.intercom  ? `домофон ${order.intercom}` : null,
        ].filter(Boolean)
        const fullAddress = parts.length
          ? `${order.customerAddress}, ${parts.join(', ')}`
          : order.customerAddress
        client.addresses.add(fullAddress)
      }
      if (order.pharmacy?.name) client.pharmacies.add(order.pharmacy.name)
    }

    const clients = Array.from(clientsMap.values())
      .map(c => ({ ...c, addresses: Array.from(c.addresses), pharmacies: Array.from(c.pharmacies) }))
      .sort((a, b) => b.ordersCount - a.ordersCount)

    res.json({ success: true, data: { clients, total: clients.length } })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/analytics
router.get('/analytics', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [
      totalOrders,
      activePharmacies,
      aggregates,
      ordersByStatus,
      ordersByCourier,
      recentOrders
    ] = await Promise.all([
      prisma.order.count(),
      prisma.pharmacy.count({ where: { isActive: true } }),
      prisma.order.aggregate({
        _sum: { medicinesTotal: true, deliveryPrice: true, totalPrice: true }
      }),
      prisma.order.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.order.groupBy({
        by: ['selectedCourier'],
        where: { selectedCourier: { not: null } },
        _count: { id: true }
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' }
      })
    ])

    // Group recent orders by day
    const ordersByDay = {}
    recentOrders.forEach(o => {
      const day = o.createdAt.toISOString().split('T')[0]
      ordersByDay[day] = (ordersByDay[day] || 0) + 1
    })

    res.json({
      success: true,
      data: {
        totalOrders,
        activePharmacies,
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

module.exports = router
