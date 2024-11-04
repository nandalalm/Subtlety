const mongoose = require("mongoose");

const returnRequestSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        status: {
          type: String,
          enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Returned"],
          default: "Pending",
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    offerDiscount: {
      type: Number,
      default: 0, // Set default value if needed
    },
    couponDiscount: {
      type: Number,
      default: 0, // Set default value if needed
    },
    orderStatus: {
      type: String,
      enum: ["Pending", "Completed", "Cancelled"],
      default: "Pending",
    },
    paymentStatus: {
      // Add paymentStatus field
      type: String,
      enum: ["Failed", "Successful"], // Define the possible values
      required: true,
      default: "Pending", // Set a default value if needed
    },
    shippingAddress: {
      fullname: { type: String, required: true },
      address: { type: String, required: true },
      pincode: { type: String, required: true },
      phone: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    returnRequests: [returnRequestSchema], // Add the return requests field
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
