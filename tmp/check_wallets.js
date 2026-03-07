const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Wallet = require("../model/wallet");

async function checkWallets() {
  try {
    const mongoUrl = process.env.MONGO_URL;
    console.log("Connecting to:", mongoUrl);
    await mongoose.connect(mongoUrl);
    console.log("Connected to MongoDB");

    const wallets = await Wallet.find({});
    console.log(`Found ${wallets.length} wallets`);

    wallets.forEach(wallet => {
      console.log(`\nWallet ID: ${wallet._id}`);
      console.log(`User ID: ${wallet.userId}`);
      console.log(`Balance: ${wallet.balance}`);
      console.log(`Transactions Count: ${wallet.transactions.length}`);
      
      wallet.transactions.forEach((tx, idx) => {
        console.log(`  - Transaction ${idx}: ID=${tx.transactionId}, Desc=${tx.description}`);
      });
    });

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkWallets();
