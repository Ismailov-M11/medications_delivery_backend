const express = require('express')
const prisma = require('../config/db')
const { verifySign } = require('../utils/multicardApi')

const router = express.Router()

// POST /api/webhooks/multicard
router.post('/multicard', async (req, res) => {
  try {
    const { invoice_id, uuid, amount, sign, status } = req.body

    if (!verifySign(invoice_id, amount, sign)) {
      console.warn('[webhook/multicard] invalid signature', { invoice_id, uuid })
      return res.status(400).json({ success: false, message: 'Invalid signature' })
    }

    const payment = await prisma.subscriptionPayment.findUnique({ where: { uuid } })
    if (!payment) {
      // Unknown payment — acknowledge and ignore
      return res.json({ success: true })
    }

    if (payment.status === 'paid') {
      // Idempotency: already processed
      return res.json({ success: true })
    }

    const isPaid = status === 'paid' || status === 'success' || status === 1 || status === '1'
    if (isPaid) {
      const pharmacy = await prisma.pharmacy.findUnique({
        where: { id: payment.pharmacyId },
        select: { subscriptionExpiry: true },
      })

      const now = new Date()
      const base = pharmacy?.subscriptionExpiry && pharmacy.subscriptionExpiry > now
        ? pharmacy.subscriptionExpiry
        : now
      const newExpiry = new Date(base)
      newExpiry.setDate(newExpiry.getDate() + 30)

      await Promise.all([
        prisma.subscriptionPayment.update({
          where: { uuid },
          data: { status: 'paid', paidAt: now, invoiceId: invoice_id },
        }),
        prisma.pharmacy.update({
          where: { id: payment.pharmacyId },
          data: { subscriptionExpiry: newExpiry, isActive: true },
        }),
      ])

      console.log(`[webhook/multicard] subscription extended for pharmacy ${payment.pharmacyId} until ${newExpiry.toISOString()}`)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('[webhook/multicard] error:', err)
    // Always return 200 so Multicard doesn't cancel the payment
    res.json({ success: true })
  }
})

module.exports = router
