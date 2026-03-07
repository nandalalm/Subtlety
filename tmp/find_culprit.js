const { MongoClient } = require('mongodb');
const path = require('path');
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function findTheCulprit() {
  const url = process.env.MONGO_URL;
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db('Subtlety');
    console.log("Connected to Subtlety");

    const collections = await db.listCollections().toArray();
    for (const col of collections) {
      const docs = await db.collection(col.name).find({}).toArray();
      if (docs.length > 0) {
        console.log(`\nCollection: ${col.name} (${docs.length} docs)`);
        docs.forEach(d => {
            if (d.transactions) {
                console.log(`  _id: ${d._id}, transactions: ${JSON.stringify(d.transactions)}`);
            } else {
                // If it's the wallets collection, print anyway
                if (col.name === 'wallets') {
                    console.log(`  _id: ${d._id}, userId: ${d.userId}`);
                }
            }
        });
      }
    }

    const indexes = await db.collection('wallets').indexes();
    console.log("\nWallets Indexes:", JSON.stringify(indexes, null, 2));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

findTheCulprit();
