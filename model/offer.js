const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "offerFor",
      required: true,
    },
    offerFor: {
      type: String,
      enum: ["Product", "Category"],
      required: true,
    },
    offerType: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
    },
    value: Number,
    maxDiscount: Number,
    minProductPrice: Number,
    expiresAt: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Offer = mongoose.model("Offer", offerSchema);
module.exports = Offer;
