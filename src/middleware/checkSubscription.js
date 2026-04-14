const Pharmacy = require('../models/Pharmacy');

const checkSubscription = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'pharmacy') {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: pharmacy role required.',
      });
    }

    const pharmacy = await Pharmacy.findById(req.user.id);

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found.',
      });
    }

    if (!pharmacy.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Pharmacy account is inactive.',
      });
    }

    if (pharmacy.subscriptionExpiry && pharmacy.subscriptionExpiry < new Date()) {
      // Mark as inactive in DB if not already
      if (pharmacy.isActive) {
        pharmacy.isActive = false;
        await pharmacy.save({ validateBeforeSave: false });
      }
      return res.status(403).json({
        success: false,
        message: 'Pharmacy subscription has expired.',
      });
    }

    // Attach full pharmacy doc to request for downstream use
    req.pharmacy = pharmacy;
    next();
  } catch (error) {
    console.error('checkSubscription error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during subscription check.',
    });
  }
};

module.exports = checkSubscription;
