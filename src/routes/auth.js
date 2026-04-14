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
        user: { id: pharmacy.id, role: 'pharmacy', name: pharmacy.name }
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

module.exports = router
