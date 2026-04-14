const express = require('express')
const { customAlphabet } = require('nanoid')
const prisma = require('../config/db')
const { auth } = require('../middleware/auth')
const { checkSubscription } = require('../middleware/checkSubscription')

const router = express.Router()
const generateToken = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12)

// All pharmacy routes require auth + active subscription
router.use(auth)
router.use(checkSubscription)

// GET /api/pharmacy/orders
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { pharmacyId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: orders })
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
    const orderLink = `${process.env.CLIENT_URL}/order/${token}`
    res.status(201).json({ success: true, data: { ...order, orderLink } })
  } catch (err) {
    next(err)
  }
})

module.exports = router
