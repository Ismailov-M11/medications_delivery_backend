const bcrypt = require('bcryptjs')
const prisma = require('../config/db')

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@meddelivery.com'
  const adminPassword = process.env.ADMIN_PASSWORD
  const pharmacyLogin = process.env.SEED_PHARMACY_LOGIN || 'pharmacy'
  const pharmacyPassword = process.env.SEED_PHARMACY_PASSWORD

  // Admin seed — create or fix if password is not a bcrypt hash
  const existing = await prisma.admin.findUnique({
    where: { email: adminEmail }
  })

  if (!existing) {
    if (!adminPassword) {
      console.warn('ADMIN_PASSWORD env var not set — skipping admin seed')
    } else {
      const adminHashed = await bcrypt.hash(adminPassword, 10)
      await prisma.admin.create({
        data: { email: adminEmail, password: adminHashed }
      })
      console.log(`Admin created: ${adminEmail}`)
    }
  } else if (!existing.password.startsWith('$2') && adminPassword) {
    const adminHashed = await bcrypt.hash(adminPassword, 10)
    await prisma.admin.update({
      where: { email: adminEmail },
      data: { password: adminHashed }
    })
    console.log('Admin password re-hashed and fixed')
  }

  // Pharmacy seed — create or fix
  const existingPharmacy = await prisma.pharmacy.findUnique({
    where: { login: pharmacyLogin }
  })

  if (!existingPharmacy) {
    if (!pharmacyPassword) {
      console.warn('SEED_PHARMACY_PASSWORD env var not set — skipping pharmacy seed')
    } else {
      const pharmacyHashed = await bcrypt.hash(pharmacyPassword, 10)
      await prisma.pharmacy.create({
        data: {
          name: 'Test Pharmacy',
          address: 'Tashkent, Chilonzor 1',
          phone: '+998901234567',
          login: pharmacyLogin,
          password: pharmacyHashed,
          isActive: true,
          subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          lat: 41.2995,
          lng: 69.2401,
        }
      })
      console.log(`Test pharmacy created: login=${pharmacyLogin}`)
    }
  } else if (!existingPharmacy.password.startsWith('$2') && pharmacyPassword) {
    const pharmacyHashed = await bcrypt.hash(pharmacyPassword, 10)
    await prisma.pharmacy.update({
      where: { login: pharmacyLogin },
      data: { password: pharmacyHashed }
    })
    console.log('Pharmacy password re-hashed and fixed')
  }
}

module.exports = { seedAdmin }
