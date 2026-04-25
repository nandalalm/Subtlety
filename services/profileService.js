import transactionRepository from "../repositories/transactionRepository.js";
import orderRepository from "../repositories/orderRepository.js";
import productRepository from "../repositories/productRepository.js";
import userRepository from "../repositories/userRepository.js";
import addressRepository from "../repositories/addressRepository.js";
import walletRepository from "../repositories/walletRepository.js";
import { roundToTwo, generateTransactionId } from "../utils/helper.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import bcrypt from "bcryptjs";

const INDIA_STATES = new Set([
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
]);

function throwAddressValidation(message) {
  throw { statusCode: HTTP_STATUS.BAD_REQUEST, message };
}

function normalizeAddressField(value) {
  return String(value || "").trim();
}

function normalizeAddressData(addressData) {
  const normalized = {
    ...addressData,
    username: normalizeAddressField(addressData.username),
    phoneNo: normalizeAddressField(addressData.phoneNo),
    address: normalizeAddressField(addressData.address),
    country: normalizeAddressField(addressData.country),
    state: normalizeAddressField(addressData.state),
    district: normalizeAddressField(addressData.district),
    pincode: normalizeAddressField(addressData.pincode),
    houseFlatNo: normalizeAddressField(addressData.houseFlatNo),
    addressType: normalizeAddressField(addressData.addressType).toLowerCase(),
  };

  if (!normalized.username) throwAddressValidation("Username is required.");
  if (normalized.username.length > 50) throwAddressValidation("Username cannot exceed 50 characters.");
  if (!/^[A-Za-z]+$/.test(normalized.username)) throwAddressValidation("Username must contain only letters with no spaces.");
  if (normalized.username.length < 3) throwAddressValidation("Username must be at least 3 letters long.");

  if (!/^\d{10}$/.test(normalized.phoneNo)) throwAddressValidation("Phone number must be exactly 10 digits.");

  if (!normalized.address) throwAddressValidation("Address is required.");
  if (normalized.address.length > 200) throwAddressValidation("Address cannot exceed 200 characters.");
  if (normalized.address.length < 10) throwAddressValidation("Address must be at least 10 characters long.");
  if (!/^[A-Za-z0-9,.-]+$/.test(normalized.address)) throwAddressValidation("Address contains invalid characters.");

  if (normalized.country !== "India") throwAddressValidation("Country must be India.");

  if (!INDIA_STATES.has(normalized.state)) throwAddressValidation("Please select a valid state in India.");

  if (!normalized.district) throwAddressValidation("District is required.");
  if (normalized.district.length > 40) throwAddressValidation("District cannot exceed 40 characters.");
  if (!/^[A-Za-z]+$/.test(normalized.district)) throwAddressValidation("District must contain only letters with no spaces.");

  if (!/^\d{6}$/.test(normalized.pincode)) throwAddressValidation("Pincode must be exactly 6 digits.");

  if (!normalized.houseFlatNo) throwAddressValidation("House/Flat No is required.");
  if (normalized.houseFlatNo.length > 20) throwAddressValidation("House/Flat No cannot exceed 20 characters.");
  if (!/^[A-Za-z0-9\s/-]+$/.test(normalized.houseFlatNo)) throwAddressValidation("House/Flat No must be alphanumeric.");

  if (!["home", "work"].includes(normalized.addressType)) {
    throwAddressValidation("Please choose a valid address type.");
  }

  return normalized;
}

const profileService = {
  updateProfile: async (userId, updateData) => {
    return await userRepository.updateById(userId, updateData);
  },

  updatePassword: async (userId, currentPassword, newPassword) => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.USER_NOT_FOUND };
    }

    if (!user.password) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PROFILE.PASSWORD_NOT_AVAILABLE };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PROFILE.PASSWORD_INCORRECT };
    }

    const isNewSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isNewSameAsOld) {
        throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PROFILE.SAME_PASSWORD };
    }

    if (newPassword.length < 6) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.PROFILE.PASSWORD_TOO_SHORT };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return await userRepository.updateById(userId, { password: hashedPassword });
  },

  getAddresses: async (userId, page = 1, limit = 2) => {
    const skip = (page - 1) * limit;
    const totalAddresses = await addressRepository.countDocuments({ userId });
    const addresses = await addressRepository.find({ userId }, { createdAt: -1 }, skip, limit);
    return {
      addresses,
      totalPages: Math.ceil(totalAddresses / limit) || 1,
      limit
    };
  },

  addAddress: async (userId, addressData) => {
    const normalizedAddress = normalizeAddressData(addressData);
    return await addressRepository.save({ userId, ...normalizedAddress });
  },

  getAddressById: async (addressId) => {
    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND };
    }
    return address;
  },

  updateAddress: async (addressId, updateData) => {
    const normalizedAddress = normalizeAddressData(updateData);
    const updated = await addressRepository.findByIdAndUpdate(addressId, normalizedAddress);
    if (!updated) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND };
    }
    return updated;
  },

  deleteAddress: async (addressId) => {
    const deleted = await addressRepository.findByIdAndDelete(addressId);
    if (!deleted) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND };
    }
    return deleted;
  },

  getWalletData: async (userId, queryParams) => {
    const { page = 1, limit = 4, search, sort } = queryParams;
    const skip = (page - 1) * limit;

    let wallet = await walletRepository.findOne({ userId });
    if (!wallet) {
      wallet = await walletRepository.save({ userId, balance: 0 });
    }

    let query = { userId };
    if (search) {
      query.transactionId = { $regex: search.trim(), $options: "i" };
    }
    if (sort === "credit" || sort === "debit") {
      query.type = sort;
    }

    const sortOption = { date: sort === "oldest" ? 1 : -1 };

    const transactions = await transactionRepository.find(query, sortOption, skip, limit);
    const totalTransactionsFiltered = await transactionRepository.countDocuments(query);
    const totalTransactionsUnfiltered = await transactionRepository.countDocuments({ userId });

    return {
      wallet,
      transactions,
      totalPages: Math.max(1, Math.ceil(totalTransactionsFiltered / limit)),
      totalTransactions: totalTransactionsFiltered,
      totalTransactionsUnfiltered,
      limit
    };
  },

  getWalletBalance: async (userId) => {
    let wallet = await walletRepository.findOne({ userId });
    if (!wallet) {
      wallet = await walletRepository.save({ userId, balance: 0 });
    }
    return wallet.balance;
  },

  deductWalletAmount: async (userId, orderId, amount) => {
    const [user, wallet, order] = await Promise.all([
      userRepository.findById(userId),
      walletRepository.findOne({ userId }),
      orderRepository.findById(orderId)
    ]);

    if (!user) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.USER_NOT_FOUND };
    if (!wallet) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.WALLET.NOT_FOUND };
    if (!order) throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.WALLET.ORDER_NOT_FOUND };

    if (wallet.balance < amount) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.WALLET.INSUFFICIENT_BALANCE };
    }

    wallet.balance = roundToTwo(wallet.balance - amount);
    
    const transactionId = await generateTransactionId();
    const newTransaction = await transactionRepository.save({
      userId,
      transactionId,
      amount,
      type: "debit",
      orderId: order.orderId,
      description: MESSAGES.ORDER.PAYMENT_DESC(order.orderId)
    });

    await wallet.save();

    order.paymentStatus = "Successful";
    await order.save();

    // Reduce stock
    for (const item of order.items) {
      await productRepository.updateById(item.productId, { $inc: { stock: -item.quantity } });
    }

    return { balance: wallet.balance };
  }
};

export default profileService;
