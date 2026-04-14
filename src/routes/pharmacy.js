const express = require('express');
const Order = require('../models/Order');
const { auth } = require('../middleware/auth');
const checkSubscription = require('../middleware/checkSubscription');

const router = express.Router();

// Apply auth + subscription check to all pharmacy routes
router.use(auth, checkSubscription);

// ---------------------------------------------------------------------------
// GET /api/pharmacy/orders
// Returns all orders belonging to the authenticated pharmacy, newest first.
// ---------------------------------------------------------------------------
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({ pharmacy: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully.',
      data: orders,
    });
  } catch (error) {
    console.error('Get pharmacy orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving orders.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/pharmacy/orders
// Create a new order for the authenticated pharmacy.
// Body: { pharmacyComment?, medicinesTotal? }
// ---------------------------------------------------------------------------
router.post('/orders', async (req, res) => {
  try {
    const { pharmacyComment, medicinesTotal } = req.body;

    const order = new Order({
      pharmacy: req.user.id,
      pharmacyComment: pharmacyComment || '',
      medicinesTotal: medicinesTotal !== undefined ? Number(medicinesTotal) : 0,
      // token is auto-generated in the model pre-validate hook
    });

    await order.save();

    // Build the customer-facing link using CLIENT_URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const orderLink = `${clientUrl}/order/${order.token}`;

    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        order,
        orderLink,
      },
    });
  } catch (error) {
    console.error('Create pharmacy order error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error creating order.',
    });
  }
});

module.exports = router;
