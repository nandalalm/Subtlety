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

    // Check if new password is same as current 
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
    return await addressRepository.save({ userId, ...addressData });
  },

  getAddressById: async (addressId) => {
    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND };
    }
    return address;
  },

  updateAddress: async (addressId, updateData) => {
    const updated = await addressRepository.findByIdAndUpdate(addressId, updateData);
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
