// One-time script: strip spaces from customerPhone values saved with formatting.
// Run once: node fix-phone-spaces.js
// Delete after running.
const prisma = require('./src/config/db')

async function main() {
  const orders = await prisma.order.findMany({
    where: { customerPhone: { contains: ' ' } },
    select: { id: true, customerPhone: true },
  })

  console.log(`Found ${orders.length} orders with spaces in phone`)
  if (!orders.length) { await prisma.$disconnect(); return }

  let fixed = 0
  for (const o of orders) {
    const cleaned = o.customerPhone.replace(/\s+/g, '')
    await prisma.order.update({ where: { id: o.id }, data: { customerPhone: cleaned } })
    fixed++
    if (fixed % 50 === 0) console.log(`  Fixed ${fixed}/${orders.length}...`)
  }

  console.log(`Done. Fixed ${fixed} records.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
