const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  discountAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  discountType: {
    type: String,
    enum: ["flat", "percentage"],
    default: "flat",
  },
  maxDiscount: {
    type: Number,
    default: 0,
  },
  minOrderValue: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  usageLimit: {
    type: Number,
    default: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
  },
  isActive: { type: Boolean, default: true },
});

const Coupon = mongoose.model("Coupon", couponSchema);
module.exports = Coupon;
