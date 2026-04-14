const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Pharmacy = require('../models/Pharmacy');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All admin routes require a valid admin JWT
router.use(auth, requireRole('admin'));

// ---------------------------------------------------------------------------
// GET /api/admin/orders
// All orders with pagination and optional pharmacy filter.
// Query: ?page=1&limit=20&pharmacy=<pharmacyId>
// ---------------------------------------------------------------------------
router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.pharmacy) {
      if (!mongoose.Types.ObjectId.isValid(req.query.pharmacy)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pharmacy ID.',
        });
      }
      filter.pharmacy = req.query.pharmacy;
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('pharmacy', 'name address phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Orders retrieved successfully.',
      data: {
        orders,
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Admin get orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving orders.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/pharmacies
// All pharmacies.
// ---------------------------------------------------------------------------
router.get('/pharmacies', async (req, res) => {
  try {
    const pharmacies = await Pharmacy.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Pharmacies retrieved successfully.',
      data: pharmacies,
    });
  } catch (error) {
    console.error('Admin get pharmacies error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving pharmacies.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/pharmacies
// Create a new pharmacy.
// Body: { name, address, phone, coordinates?, login, password, subscriptionExpiry? }
// ---------------------------------------------------------------------------
router.post('/pharmacies', async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      coordinates,
      login,
      password,
      subscriptionExpiry,
    } = req.body;

    if (!name || !address || !phone || !login || !password) {
      return res.status(400).json({
        success: false,
        message: 'name, address, phone, login and password are required.',
      });
    }

    const existingLogin = await Pharmacy.findOne({ login: login.trim() });
    if (existingLogin) {
      return res.status(409).json({
        success: false,
        message: 'A pharmacy with this login already exists.',
      });
    }

    const pharmacy = new Pharmacy({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      coordinates: coordinates || undefined,
      login: login.trim(),
      password, // hashed by pre-save hook
      subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : undefined,
    });

    await pharmacy.save();

    const pharmacyObj = pharmacy.toObject();
    delete pharmacyObj.password;

    return res.status(201).json({
      success: true,
      message: 'Pharmacy created successfully.',
      data: pharmacyObj,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A pharmacy with this login already exists.',
      });
    }
    console.error('Admin create pharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error creating pharmacy.',
    });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/pharmacies/:id
// Update pharmacy fields (excluding login/password).
// Body: { isActive?, subscriptionExpiry?, name?, address?, phone? }
// ---------------------------------------------------------------------------
router.put('/pharmacies/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pharmacy ID.',
      });
    }

    const allowedFields = ['isActive', 'subscriptionExpiry', 'name', 'address', 'phone', 'coordinates'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.subscriptionExpiry) {
      updates.subscriptionExpiry = new Date(updates.subscriptionExpiry);
    }

    // If re-activating but subscription is expired, block
    if (updates.isActive === true) {
      const pharmacy = await Pharmacy.findById(req.params.id);
      if (!pharmacy) {
        return res.status(404).json({
          success: false,
          message: 'Pharmacy not found.',
        });
      }
      const expiry = updates.subscriptionExpiry || pharmacy.subscriptionExpiry;
      if (expiry && expiry < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot activate pharmacy with expired subscription. Update subscriptionExpiry first.',
        });
      }
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Pharmacy updated successfully.',
      data: pharmacy,
    });
  } catch (error) {
    console.error('Admin update pharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating pharmacy.',
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/pharmacies/:id
// Soft delete: set isActive = false.
// ---------------------------------------------------------------------------
router.delete('/pharmacies/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pharmacy ID.',
      });
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    ).select('-password');

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Pharmacy deactivated (soft deleted) successfully.',
      data: pharmacy,
    });
  } catch (error) {
    console.error('Admin delete pharmacy error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting pharmacy.',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/analytics
// Returns aggregated stats.
// ---------------------------------------------------------------------------
router.get('/analytics', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Run all aggregations in parallel
    const [
      totalsResult,
      ordersByStatus,
      ordersByDay,
      ordersByCourier,
    ] = await Promise.all([
      // Total orders, total medicines amount, total delivery amount
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalMedicinesAmount: { $sum: { $ifNull: ['$medicinesTotal', 0] } },
            totalDeliveryAmount: { $sum: { $ifNull: ['$deliveryPrice', 0] } },
          },
        },
      ]),

      // Orders grouped by status
      Order.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            status: '$_id',
            count: 1,
          },
        },
      ]),

      // Orders per day for last 30 days
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            count: { $sum: 1 },
            medicinesAmount: { $sum: { $ifNull: ['$medicinesTotal', 0] } },
            deliveryAmount: { $sum: { $ifNull: ['$deliveryPrice', 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            count: 1,
            medicinesAmount: 1,
            deliveryAmount: 1,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Orders grouped by courier
      Order.aggregate([
        {
          $match: {
            selectedCourier: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$selectedCourier',
            count: { $sum: 1 },
            totalDeliveryAmount: { $sum: { $ifNull: ['$deliveryPrice', 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            courier: '$_id',
            count: 1,
            totalDeliveryAmount: 1,
          },
        },
      ]),
    ]);

    const totals = totalsResult[0] || {
      totalOrders: 0,
      totalMedicinesAmount: 0,
      totalDeliveryAmount: 0,
    };

    return res.status(200).json({
      success: true,
      message: 'Analytics retrieved successfully.',
      data: {
        totalOrders: totals.totalOrders,
        totalMedicinesAmount: totals.totalMedicinesAmount,
        totalDeliveryAmount: totals.totalDeliveryAmount,
        ordersByStatus,
        ordersByDay,
        ordersByCourier,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error retrieving analytics.',
    });
  }
});

module.exports = router;
