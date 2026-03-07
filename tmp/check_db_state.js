const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const connectDB = require("./config/db");
const Wallet = require("./model/wallet");

async function check() {
    try {
        await connectDB();
        console.log("Database Name:", mongoose.connection.db.databaseName);
        
        const count = await Wallet.countDocuments();
        console.log("Wallet count:", count);
        
        if (count > 0) {
            const wallets = await Wallet.find({});
            wallets.forEach(w => {
                console.log(`Wallet _id: ${w._id}, userId: ${w.userId}, txCount: ${w.transactions.length}`);
            });
        }
        
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name).join(", "));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
