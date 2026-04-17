const express = require('express')
const prisma = require('../config/db')
const noorApi = require('../utils/noorApi')

const router = express.Router()

const WEBHOOK_TOKEN = process.env.NOOR_WEBHOOK_TOKEN

// Noor stage → our OrderStatus mapping
const STAGE_STATUS = {
  4: 'courier_pickup',   // performer found
  5: 'courier_pickup',   // arrived at pickup
  6: 'courier_picked',   // picked up from pharmacy
  7: 'courier_delivery', // on the way to customer
  8: 'delivered',        // delivered
}

// POST /api/noor/webhook — called by Noor on status changes
router.post('/webhook', async (req, res) => {
  try {
    console.log('[Noor webhook] headers:', JSON.stringify(req.headers))
    console.log('[Noor webhook] body:', JSON.stringify(req.body))

    const authHeader = req.headers['authorization']
    if (!authHeader || authHeader !== WEBHOOK_TOKEN) {
      console.log('[Noor webhook] Unauthorized — received token:', authHeader)
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { vendor_order_id, stage, order: noorOrder } = req.body

    if (!vendor_order_id) {
      return res.status(400).json({ success: false, message: 'vendor_order_id required' })
    }

    const order = await prisma.order.findUnique({
      where: { id: vendor_order_id },
    })
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' })
    }

    const updateData = {}

    // Map stage → our status
    const newStatus = STAGE_STATUS[stage]
    if (newStatus) {
      updateData.status = newStatus
    }

    // Save noorOrderId if not already stored
    if (noorOrder?.id && !order.noorOrderId) {
      updateData.noorOrderId = noorOrder.id
    }

    // Save tracking URL when courier is assigned (stage 4+)
    if (noorOrder?.tracking_url) {
      updateData.trackingUrl = noorOrder.tracking_url
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.order.update({ where: { id: vendor_order_id }, data: updateData })
    }

    // Retry finding a courier when Noor couldn't find one
    if (stage === 3 && order.noorOrderId) {
      try {
        await noorApi.reorder(order.noorOrderId)
      } catch (err) {
        console.error('Noor reorder error:', err.message)
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Noor webhook error:', err)
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
