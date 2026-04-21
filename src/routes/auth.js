const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const prisma = require('../config/db')

const router = express.Router()

// POST /api/auth/pharmacy/login
router.post('/pharmacy/login', async (req, res, next) => {
  try {
    const { login, password } = req.body
    if (!login || !password) {
      return res.status(400).json({ success: false, message: 'Login and password required' })
    }
    const pharmacy = await prisma.pharmacy.findUnique({ where: { login } })
    if (!pharmacy) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }
    if (!pharmacy.isActive) {
      return res.status(403).json({ success: false, message: 'Account inactive or subscription expired' })
    }
    if (pharmacy.subscriptionExpiry && pharmacy.subscriptionExpiry < new Date()) {
      await prisma.pharmacy.update({ where: { id: pharmacy.id }, data: { isActive: false } })
      return res.status(403).json({ success: false, message: 'Subscription expired' })
    }
    const valid = await bcrypt.compare(password, pharmacy.password)
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }
    const token = jwt.sign(
      { id: pharmacy.id, role: 'pharmacy', name: pharmacy.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: pharmacy.id,
          role: 'pharmacy',
          name: pharmacy.name,
          lat: pharmacy.lat,
          lng: pharmacy.lng,
          requiresLocation: pharmacy.requiresLocation,
        }
      }
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/admin/login
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' })
    }
    const admin = await prisma.admin.findUnique({ where: { email } })
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }
    const valid = await bcrypt.compare(password, admin.password)
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }
    const token = jwt.sign(
      { id: admin.id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )
    res.json({
      success: true,
      data: {
        token,
        user: { id: admin.id, role: 'admin' }
      }
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/signup — creates pharmacy account with 7-day trial
router.post('/signup', async (req, res, next) => {
  try {
    const { name, ownerName, phone, email, password } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' })
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }

    // Use email as login
    const login = email.trim().toLowerCase()
    if (!login.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email address' })
    }

    const exists = await prisma.pharmacy.findUnique({ where: { login } })
    if (exists) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const subscriptionExpiry = new Date()
    subscriptionExpiry.setDate(subscriptionExpiry.getDate() + 7)

    const pharmacy = await prisma.pharmacy.create({
      data: {
        name,
        ownerName: ownerName || null,
        email: login,
        phone: phone || '',
        login,
        password: hashed,
        isActive: true,
        requiresLocation: true,
        subscriptionExpiry,
      }
    })

    res.status(201).json({
      success: true,
      data: {
        login,
        message: 'Account created successfully. You have a 7-day free trial.'
      }
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
