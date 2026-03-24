import mongoose from "mongoose";
import { dbLogger } from "../middleware/logger.js";
import MESSAGES from "../Constants/messages.js";

let isConnected = false; 

const connectDB = async () => {
  if (isConnected) {
    dbLogger(MESSAGES.DB.ALREADY_CONNECTED);
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URL);

    isConnected = conn.connections[0].readyState === 1;
    dbLogger(MESSAGES.DB.CONNECTED);
  } catch (error) {
    dbLogger(MESSAGES.DB.ERROR, true);
    console.error(error);
    throw error;
  }
};

export default connectDB;
