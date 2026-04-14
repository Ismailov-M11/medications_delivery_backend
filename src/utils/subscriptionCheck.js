const prisma = require('../config/db')

async function deactivateExpiredPharmacies() {
  const result = await prisma.pharmacy.updateMany({
    where: {
      isActive: true,
      subscriptionExpiry: { lt: new Date() },
    },
    data: { isActive: false },
  })
  if (result.count > 0) {
    console.log(`Deactivated ${result.count} expired pharmacy subscription(s)`)
  }
}

module.exports = { deactivateExpiredPharmacies }
