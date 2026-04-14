const Pharmacy = require('../models/Pharmacy');

/**
 * Deactivates all pharmacies whose subscriptionExpiry is in the past
 * and are still marked as active. Called once on server startup.
 */
const deactivateExpiredPharmacies = async () => {
  try {
    const now = new Date();

    const result = await Pharmacy.updateMany(
      {
        isActive: true,
        subscriptionExpiry: { $lt: now },
      },
      { $set: { isActive: false } }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `Subscription check: deactivated ${result.modifiedCount} expired pharmacy(ies).`
      );
    } else {
      console.log('Subscription check: no expired pharmacies found.');
    }
  } catch (error) {
    console.error('Subscription check error:', error.message);
  }
};

module.exports = deactivateExpiredPharmacies;
