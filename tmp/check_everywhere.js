const { MongoClient } = require('mongodb');
const path = require('path');
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function checkEverywhere() {
  const url = process.env.MONGO_URL;
  const client = new MongoClient(url);

  try {
    await client.connect();
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    
    console.log("DBs FOUND:", dbs.databases.map(db => db.name).join(", "));

    for (const dbInfo of dbs.databases) {
      const db = client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      const walletCol = collections.find(c => c.name === 'wallets');
      if (walletCol) {
        const count = await db.collection('wallets').countDocuments();
        console.log(`DB '${dbInfo.name}' has 'wallets' collection with ${count} docs`);
        if (count > 0) {
            const sample = await db.collection('wallets').find({}).toArray();
            sample.forEach(s => {
                console.log(`  _id: ${s._id}, txs: ${JSON.stringify(s.transactions)}`);
            });
        }
      }
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

checkEverywhere();
