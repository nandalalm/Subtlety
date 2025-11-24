const mongoose = require("mongoose");

let isConnected = false; 

const connectDB = async () => {
  if (isConnected) {
    console.log("MongoDB already connected ✔️");
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URL);

    isConnected = conn.connections[0].readyState === 1;
    console.log("MongoDB connected successfully ✔️");
  } catch (error) {
    console.error("MongoDB connection error ❌", error);
    throw error;
  }
};

module.exports = connectDB;
