const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  12
);

const orderSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      unique: true,
      required: true,
    },
    pharmacy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'Pharmacy reference is required'],
    },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'courier_pickup',
        'courier_picked',
        'courier_delivery',
        'delivered',
      ],
      default: 'pending',
    },
    pharmacyComment: {
      type: String,
      trim: true,
    },
    medicinesTotal: {
      type: Number,
      min: 0,
    },
    customer: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      comment: { type: String, trim: true },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    selectedCourier: {
      type: String,
      enum: ['yandex', 'noor', 'millennium'],
    },
    deliveryPrice: {
      type: Number,
      min: 0,
    },
    trackingUrl: {
      type: String,
      trim: true,
    },
    totalPrice: {
      type: Number,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

// Auto-generate token before validation if not set
orderSchema.pre('validate', function (next) {
  if (!this.token) {
    this.token = nanoid();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
