const { MongoClient } = require('mongodb');
const path = require('path');
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function checkRaw() {
  const url = process.env.MONGO_URL;
  const client = new MongoClient(url);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(); // This uses the database from the URL (Subtlety)
    console.log("Database name:", db.databaseName);

    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    const wallets = await db.collection('wallets').find({}).toArray();
    console.log(`Found ${wallets.length} wallets in 'wallets' collection`);

    wallets.forEach(w => {
      console.log(`\nWallet _id: ${w._id}`);
      console.log(`User ID: ${w.userId}`);
      console.log(`Transactions:`, JSON.stringify(w.transactions));
    });

    const indexes = await db.collection('wallets').indexes();
    console.log("\nIndexes on 'wallets':", JSON.stringify(indexes, null, 2));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

checkRaw();
