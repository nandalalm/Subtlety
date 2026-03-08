/**
 * One-time fix: Drop the stale 'transactions.transactionId_1' index
 * from the 'wallets' collection.
 *
 * This index was created when transactions were embedded inside the Wallet
 * document. After the refactor (transactions moved to their own collection),
 * this index became orphaned but MongoDB still enforces it on every wallet
 * insert – causing E11000 duplicate key errors for new users.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URL;

async function dropIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected ✔️");

    const db = mongoose.connection.db;
    const walletsCollection = db.collection("wallets");

    // List existing indexes so we can confirm before dropping
    const indexes = await walletsCollection.indexes();
    console.log(
      "Current wallet indexes:",
      indexes.map((i) => i.name)
    );

    const staleIndexName = "transactions.transactionId_1";
    const exists = indexes.some((i) => i.name === staleIndexName);

    if (exists) {
      await walletsCollection.dropIndex(staleIndexName);
      console.log(`✅ Dropped stale index: ${staleIndexName}`);
    } else {
      console.log(
        `ℹ️  Index '${staleIndexName}' not found – nothing to drop.`
      );
    }

    // Confirm final state
    const finalIndexes = await walletsCollection.indexes();
    console.log(
      "Remaining wallet indexes:",
      finalIndexes.map((i) => i.name)
    );
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

dropIndex();
