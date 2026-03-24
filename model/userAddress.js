import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  username: {
    type: String,
    required: true,
  },
  phoneNo: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  pincode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  district: {
    type: String,
    required: true,
  },
  houseFlatNo: {
    type: String,
  },
  addressType: {
    type: String,
    enum: ["home", "work"],
    required: true,
  },
});

const Address = mongoose.model("Address", addressSchema);
export default Address;
