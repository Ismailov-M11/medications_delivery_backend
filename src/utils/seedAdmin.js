const bcrypt = require('bcryptjs')
const prisma = require('../config/db')

async function seedAdmin() {
  const adminPassword = 'Admin123!'
  const pharmacyPassword = 'Pharmacy123!'

  // Admin seed — create or fix if password is not a bcrypt hash
  const existing = await prisma.admin.findUnique({
    where: { email: 'admin@meddelivery.com' }
  })

  const adminHashed = await bcrypt.hash(adminPassword, 10)

  if (!existing) {
    await prisma.admin.create({
      data: { email: 'admin@meddelivery.com', password: adminHashed }
    })
    console.log('Admin created: admin@meddelivery.com / Admin123!')
  } else if (!existing.password.startsWith('$2')) {
    await prisma.admin.update({
      where: { email: 'admin@meddelivery.com' },
      data: { password: adminHashed }
    })
    console.log('Admin password re-hashed and fixed')
  }

  // Pharmacy seed — create or fix
  const existingPharmacy = await prisma.pharmacy.findUnique({
    where: { login: 'pharmacy' }
  })

  const pharmacyHashed = await bcrypt.hash(pharmacyPassword, 10)

  if (!existingPharmacy) {
    await prisma.pharmacy.create({
      data: {
        name: 'Test Pharmacy',
        address: 'Tashkent, Chilonzor 1',
        phone: '+998901234567',
        login: 'pharmacy',
        password: pharmacyHashed,
        isActive: true,
        subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        lat: 41.2995,
        lng: 69.2401,
      }
    })
    console.log('Test pharmacy created: login=pharmacy / Pharmacy123!')
  } else if (!existingPharmacy.password.startsWith('$2')) {
    await prisma.pharmacy.update({
      where: { login: 'pharmacy' },
      data: { password: pharmacyHashed }
    })
    console.log('Pharmacy password re-hashed and fixed')
  }
}

module.exports = { seedAdmin }
