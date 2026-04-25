import mongoose from "mongoose";

const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  username: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  phoneNo: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  pincode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
    enum: ["India"],
  },
  state: {
    type: String,
    required: true,
    trim: true,
    enum: INDIA_STATES,
  },
  district: {
    type: String,
    required: true,
    trim: true,
    maxlength: 40,
  },
  houseFlatNo: {
    type: String,
    trim: true,
    maxlength: 20,
  },
  addressType: {
    type: String,
    enum: ["home", "work"],
    required: true,
  },
});

const Address = mongoose.model("Address", addressSchema);
export default Address;
