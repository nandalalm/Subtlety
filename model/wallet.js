const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  balance: { type: Number, default: 0 },
  transactions: [
    {
      transactionId: { type: String, required: true, unique: true, sparse: true },
      amount: { type: Number, required: true },
      type: { type: String, enum: ["credit", "debit"], required: true },
      description: { type: String, required: true },
      date: { type: Date, default: Date.now },
      orderId: { type: String }, // Storing unique orderId instead of ObjectId for clarity
    },
  ],
});

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;
