require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const connectDB = require('./src/config/db');
const Admin = require('./src/models/Admin');
const deactivateExpiredPharmacies = require('./src/utils/subscriptionCheck');

const authRoutes = require('./src/routes/auth');
const pharmacyRoutes = require('./src/routes/pharmacy');
const ordersRoutes = require('./src/routes/orders');
const adminRoutes = require('./src/routes/admin');

const app = express();

// ---------------------------------------------------------------------------
// Security & logging middleware
// ---------------------------------------------------------------------------
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running.' });
});

// 404 handler – must be after all routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error.';

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------------------
// Startup: connect DB, seed admin, run subscription check, then listen
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;

const seedDefaultAdmin = async () => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      await Admin.create({
        email: 'admin@meddelivery.com',
        password: 'Admin123!',
        role: 'admin',
      });
      console.log(
        'Default admin created: admin@meddelivery.com / Admin123!'
      );
    }
  } catch (error) {
    console.error('Admin seed error:', error.message);
  }
};

const startServer = async () => {
  await connectDB();

  // Run startup tasks
  await seedDefaultAdmin();
  await deactivateExpiredPharmacies();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
};

startServer();
