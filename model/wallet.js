const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  balance: { type: Number, default: 0 },
  transactions: [
    {
      amount: { type: Number, required: true },
      type: { type: String, enum: ["credit", "debit"], required: true },
      date: { type: Date, default: Date.now },
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    },
  ],
});

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;
