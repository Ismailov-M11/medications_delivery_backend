const express = require('express')
const bcrypt = require('bcryptjs')
const { customAlphabet } = require('nanoid')
const prisma = require('../config/db')
const { auth } = require('../middleware/auth')
const { checkSubscription } = require('../middleware/checkSubscription')

const router = express.Router()
const generateToken = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12)

router.use(auth)

// GET /api/pharmacy/me — profile (no subscription check, needed for location setup)
router.get('/me', async (req, res, next) => {
  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, ownerName: true, address: true, phone: true,
        email: true, lat: true, lng: true, login: true,
        isActive: true, subscriptionExpiry: true, createdAt: true,
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
    if (!medicinesTotal || isNaN(Number(medicinesTotal))) {
      return res.status(400).json({ success: false, message: 'medicinesTotal is required' })
    }
    const token = generateToken()
    const order = await prisma.order.create({
      data: {
        token,
        pharmacyId: req.user.id,
        pharmacyComment: pharmacyComment || null,
        medicinesTotal: Number(medicinesTotal),
      },
    })
    const orderUrl = `${process.env.CLIENT_URL}/order/${token}`
    res.status(201).json({ success: true, data: { order, orderUrl } })
  } catch (err) {
    next(err)
  }
})

module.exports = router
