import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  transactionId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["credit", "debit"], required: true },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now },
  orderId: { type: String }, // Storing unique orderId (the human-readable one) for clarity
});

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
