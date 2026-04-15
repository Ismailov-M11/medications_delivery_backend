const bcrypt = require('bcryptjs')
const prisma = require('../config/db')

async function seedAdmin() {
  // Seed default admin
  const adminCount = await prisma.admin.count()
  if (adminCount === 0) {
    const hashed = await bcrypt.hash('Admin123!', 10)
    await prisma.admin.create({
      data: { email: 'admin@meddelivery.com', password: hashed }
    })
    console.log('Default admin created: admin@meddelivery.com / Admin123!')
  }

  // Seed default test pharmacy
  const pharmacyCount = await prisma.pharmacy.count()
  if (pharmacyCount === 0) {
    const hashed = await bcrypt.hash('Pharmacy123!', 10)
    await prisma.pharmacy.create({
      data: {
        name: 'Test Pharmacy',
        address: 'Tashkent, Chilonzor 1',
        phone: '+998901234567',
        login: 'pharmacy',
        password: hashed,
        isActive: true,
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // +1 year
        lat: 41.2995,
        lng: 69.2401,
      }
    })
    console.log('Default pharmacy created: login=pharmacy / Pharmacy123!')
  }
}

module.exports = { seedAdmin }
