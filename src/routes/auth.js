const express = require('express');
const jwt = require('jsonwebtoken');
const Pharmacy = require('../models/Pharmacy');
const Admin = require('../models/Admin');

const router = express.Router();

/**
 * Generate a signed JWT for the given payload.
 */
const signToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// ---------------------------------------------------------------------------
// POST /api/auth/pharmacy/login
// ---------------------------------------------------------------------------
router.post('/pharmacy/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        message: 'Login and password are required.',
      });
    }

    const pharmacy = await Pharmacy.findOne({ login: login.trim() });

    if (!pharmacy) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    const isMatch = await pharmacy.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    if (!pharmacy.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Pharmacy account is inactive.',
      });
    }

    if (pharmacy.subscriptionExpiry && pharmacy.subscriptionExpiry < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Pharmacy subscription has expired.',
      });
    }

    const token = signToken({ id: pharmacy._id, role: 'pharmacy' });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        pharmacy: {
          id: pharmacy._id,
          name: pharmacy.name,
          login: pharmacy.login,
          isActive: pharmacy.isActive,
          subscriptionExpiry: pharmacy.subscriptionExpiry,
        },
      },
    });
  } catch (error) {
    console.error('Pharmacy login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/admin/login
// ---------------------------------------------------------------------------
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      });
    }

    const token = signToken({ id: admin._id, role: 'admin' });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        admin: {
          id: admin._id,
          email: admin.email,
          role: admin.role,
        },
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
});

module.exports = router;
