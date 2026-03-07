const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const connectDB = require("./config/db");

async function dropWalletIndex() {
  try {
    await connectDB();
    console.log("Connected to MongoDB for index cleanup");

    const db = mongoose.connection.db;
    const collection = db.collection('wallets');

    // List all indexes to find the exact name
    const indexes = await collection.indexes();
    console.log("Current indexes:", indexes.map(i => i.name));

    const targetIndex = "transactions.transactionId_1";
    
    if (indexes.some(idx => idx.name === targetIndex)) {
      console.log(`Dropping index: ${targetIndex}...`);
      await collection.dropIndex(targetIndex);
      console.log("Index dropped successfully ✔️");
    } else {
      console.log("Index not found or already dropped.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Error dropping index:", error);
    process.exit(1);
  }
}

dropWalletIndex();
