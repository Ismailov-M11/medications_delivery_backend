const express = require('express');
const Order = require('../models/Order');
const { auth } = require('../middleware/auth');
const checkSubscription = require('../middleware/checkSubscription');

const router = express.Router();

// Valid status transitions (enforced on PUT /status)
const VALID_STATUSES = [
  'pending',
  'confirmed',
  'courier_pickup',
  'courier_picked',
  'courier_delivery',
  'delivered',
];

// ---------------------------------------------------------------------------
// GET /api/orders/:token
// Public: get order details by unique token.
// ---------------------------------------------------------------------------
router.get('/:token', async (req, res) => {
  try {
    const order = await Order.findOne({ token: req.params.token })
      .populate('pharmacy', 'name address phone coordinates')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Order retrieved successfully.',
      data: order,
    });
  } catch (error) {
    console.error('Get order by token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving order.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/orders/:token/customer
// Public: customer fills in delivery details.
// Body: { name, phone, address, comment?, coordinates? }
// ---------------------------------------------------------------------------
router.put('/:token/customer', async (req, res) => {
  try {
    const { name, phone, address, comment, coordinates } = req.body;

    if (!name || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: 'name, phone and address are required.',
      });
    }

    const order = await Order.findOne({ token: req.params.token });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Customer details can only be set when order is pending.',
      });
    }

    order.customer = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      comment: comment ? comment.trim() : '',
      coordinates: coordinates
        ? { lat: coordinates.lat, lng: coordinates.lng }
        : undefined,
    };

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Customer details saved successfully.',
      data: order,
    });
  } catch (error) {
    console.error('Update customer details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating customer details.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/orders/:token/courier
// Public: customer selects courier and pays.
// Body: { selectedCourier, deliveryPrice, trackingUrl? }
// ---------------------------------------------------------------------------
router.put('/:token/courier', async (req, res) => {
  try {
    const { selectedCourier, deliveryPrice, trackingUrl } = req.body;

    if (!selectedCourier || deliveryPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: 'selectedCourier and deliveryPrice are required.',
      });
    }

    const allowedCouriers = ['yandex', 'noor', 'millennium'];
    if (!allowedCouriers.includes(selectedCourier)) {
      return res.status(400).json({
        success: false,
        message: `selectedCourier must be one of: ${allowedCouriers.join(', ')}.`,
      });
    }

    const order = await Order.findOne({ token: req.params.token });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Courier can only be selected while order is pending.',
      });
    }

    if (!order.customer || !order.customer.name) {
      return res.status(400).json({
        success: false,
        message: 'Customer details must be filled before selecting a courier.',
      });
    }

    order.selectedCourier = selectedCourier;
    order.deliveryPrice = Number(deliveryPrice);
    order.trackingUrl = trackingUrl ? trackingUrl.trim() : '';
    order.totalPrice = (order.medicinesTotal || 0) + Number(deliveryPrice);
    order.status = 'confirmed';

    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Courier selected and order confirmed.',
      data: order,
    });
  } catch (error) {
    console.error('Select courier error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error selecting courier.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/orders/:token/status
// Protected (pharmacy JWT): update order status.
// Body: { status }
// ---------------------------------------------------------------------------
router.put('/:token/status', auth, checkSubscription, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required.',
      });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${VALID_STATUSES.join(', ')}.`,
      });
    }

    const order = await Order.findOne({ token: req.params.token });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    // Ensure the pharmacy owns this order
    if (order.pharmacy.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: this order does not belong to your pharmacy.',
      });
    }

    order.status = status;
    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order status updated to "${status}".`,
      data: order,
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating order status.',
    });
  }
});

module.exports = router;
