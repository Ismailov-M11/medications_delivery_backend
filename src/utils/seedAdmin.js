const bcrypt = require('bcryptjs')
const prisma = require('../config/db')

async function seedAdmin() {
  const count = await prisma.admin.count()
  if (count === 0) {
    const hashed = await bcrypt.hash('Admin123!', 10)
    await prisma.admin.create({
      data: { email: 'admin@meddelivery.com', password: hashed }
    })
    console.log('Default admin created: admin@meddelivery.com / Admin123!')
  }
}

module.exports = { seedAdmin }
