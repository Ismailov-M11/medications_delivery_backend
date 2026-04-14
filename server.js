require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const prisma = require('./src/config/db')
const { deactivateExpiredPharmacies } = require('./src/utils/subscriptionCheck')
const { seedAdmin } = require('./src/utils/seedAdmin')

const authRoutes = require('./src/routes/auth')
const pharmacyRoutes = require('./src/routes/pharmacy')
const ordersRoutes = require('./src/routes/orders')
const adminRoutes = require('./src/routes/admin')

const app = express()

// Middleware
app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }))
app.use(morgan('combined'))
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/pharmacy', pharmacyRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/admin', adminRoutes)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(500).json({ success: false, message: err.message || 'Server error' })
})

async function start() {
  try {
    // Verify DB connection
    await prisma.$connect()
    console.log('PostgreSQL connected')

    // Seed default admin if needed
    await seedAdmin()

    // Deactivate expired subscriptions
    await deactivateExpiredPharmacies()

    const PORT = process.env.PORT || 5000
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
  } catch (err) {
    console.error('Startup error:', err)
    process.exit(1)
  }
}

start()
