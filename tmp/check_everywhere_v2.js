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
    
    for (const dbInfo of dbs.databases) {
      if (['admin', 'local', 'config'].includes(dbInfo.name)) continue;
      
      const db = client.db(dbInfo.name);
      const collections = await db.listCollections().toArray();
      
      for (const col of collections) {
          const count = await db.collection(col.name).countDocuments();
          if (count > 0) {
              console.log(`DB: ${dbInfo.name}, Col: ${col.name}, Count: ${count}`);
              const indexes = await db.collection(col.name).indexes();
              const hasTxIdx = indexes.some(i => i.key && i.key['transactions.transactionId']);
              if (hasTxIdx) {
                  console.log(`  [!] FOUND tx index in ${dbInfo.name}.${col.name}`);
                  const docsWithNull = await db.collection(col.name).find({ 'transactions.transactionId': null }).toArray();
                  console.log(`  Docs with null txId: ${docsWithNull.length}`);
                  docsWithNull.forEach(d => console.log(`    _id: ${d._id}`));
              }
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
