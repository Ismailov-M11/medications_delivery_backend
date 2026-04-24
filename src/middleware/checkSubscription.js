const prisma = require('../config/db')

async function checkSubscription(req, res, next) {
  try {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: req.user.id },
      select: { isActive: true, subscriptionExpiry: true }
    })
    if (!pharmacy || !pharmacy.isActive) {
      return res.status(403).json({ success: false, message: 'Account is inactive' })
    }
    if (pharmacy.subscriptionExpiry && pharmacy.subscriptionExpiry < new Date()) {
      await prisma.pharmacy.update({ where: { id: req.user.id }, data: { isActive: false } })
      return res.status(403).json({ success: false, message: 'Subscription expired' })
    }
    next()
  } catch (err) {
    next(err)
  }
}

module.exports = { checkSubscription }
