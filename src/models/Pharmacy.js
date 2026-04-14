const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const pharmacySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Pharmacy name is required'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    login: {
      type: String,
      required: [true, 'Login is required'],
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    subscriptionExpiry: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

// Hash password before saving
pharmacySchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Deactivate expired subscriptions on save
pharmacySchema.pre('save', function (next) {
  if (this.subscriptionExpiry && this.subscriptionExpiry < new Date()) {
    this.isActive = false;
  }
  next();
});

// Compare plain password with hashed
pharmacySchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Pharmacy', pharmacySchema);
