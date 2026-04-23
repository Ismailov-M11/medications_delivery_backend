const express = require('express')
const prisma = require('../config/db')
const { verifySign } = require('../utils/multicardApi')

const router = express.Router()

// POST /api/webhooks/multicard
// Multicard sends this only on successful payment
router.post('/multicard', async (req, res) => {
  try {
    const { invoice_id, amount, sign } = req.body

    if (!verifySign(invoice_id, amount, sign)) {
      console.warn('[webhook/multicard] invalid signature, invoice_id:', invoice_id)
      return res.status(400).json({ success: false, message: 'Invalid signature' })
    }

    const payment = await prisma.subscriptionPayment.findUnique({
      where: { invoiceId: invoice_id },
    })

    if (!payment) {
      // Unknown invoice — acknowledge anyway
      return res.json({ success: true })
    }

    if (payment.status === 'paid') {
      // Idempotency: already processed
      return res.json({ success: true })
    }

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
        where: { invoiceId: invoice_id },
        data: { status: 'paid', paidAt: now },
      }),
      prisma.pharmacy.update({
        where: { id: payment.pharmacyId },
        data: { subscriptionExpiry: newExpiry, isActive: true },
      }),
    ])

    console.log(`[webhook/multicard] subscription extended for pharmacy ${payment.pharmacyId} until ${newExpiry.toISOString()}`)
    res.json({ success: true })
  } catch (err) {
    console.error('[webhook/multicard] error:', err)
    // Always return 200 — otherwise Multicard cancels the payment
    res.json({ success: true })
  }
})

module.exports = router
