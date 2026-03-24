import { roundToTwo, generateTransactionId } from "../utils/helper.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import Transaction from "../model/transaction.js";
import User from "../model/user.js";
import Address from "../model/userAddress.js";
import Wallet from "../model/wallet.js";
import Order from "../model/order.js";

async function getUserProfile(req, res, next) {
  try {
    const user = req.session.user;
    res.render("user/profile", { user });
  } catch (error) {
    next(error);
  }
}

async function updateUserProfile(req, res, next) {
  const { firstname, lastname } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { firstname, lastname });

    req.session.user.firstname = firstname;
    req.session.user.lastname = lastname;

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.UPDATED });
  } catch (error) {
    next(error);
  }
}

async function updateEmail(req, res, next) {
  const { email } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { email });
    req.session.user.email = email;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.EMAIL_UPDATED });
  } catch (error) {
    next(error);
  }
}

async function updatePhoneNumber(req, res, next) {
  const { phone } = req.body;
  const userId = req.session.user._id;

  try {
    await User.findByIdAndUpdate(userId, { phoneNo: phone });
    req.session.user.phoneNo = phone;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.PHONE_UPDATED });
  } catch (error) {
    next(error);
  }
}

async function getAddresses(req, res, next) {
  const userId = req.session.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = 2;
  const skip = (page - 1) * limit;

  try {
    const totalAddresses = await Address.countDocuments({ userId });
    const totalPages = Math.ceil(totalAddresses / limit);
    const addresses = await Address.find({ userId }).skip(skip).limit(limit);
    const user = req.session.user;
    res.render("user/address", {
      addresses,
      user,
      currentPage: page,
      totalPages: totalPages || 1
    });
  } catch (error) {
    next(error);
  }
}

async function addAddress(req, res, next) {
  const {
    username,
    phoneNo,
    address,
    pincode,
    country,
    state,
    district,
    houseFlatNo,
    addressType,
  } = req.body;
  const userId = req.session.user._id;

  try {
    const newAddress = new Address({
      userId,
      username,
      phoneNo,
      address,
      pincode,
      country,
      state,
      district,
      houseFlatNo,
      addressType,
    });

    await newAddress.save();
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.ADDRESS_ADDED });
  } catch (error) {
    next(error);
  }
}

async function editAddress(req, res, next) {
  const { id } = req.params;
  const {
    username,
    phoneNo,
    address,
    pincode,
    country,
    state,
    district,
    houseFlatNo,
    addressType,
  } = req.body;

  const updateData = {}; // Object to hold fields that need to be updated

  // Only add fields to updateData if they are provided in the request
  if (username) updateData.username = username;
  if (phoneNo) updateData.phoneNo = phoneNo;
  if (address) updateData.address = address;
  if (pincode) updateData.pincode = pincode;
  if (country) updateData.country = country;
  if (state) updateData.state = state;
  if (district) updateData.district = district;
  if (houseFlatNo) updateData.houseFlatNo = houseFlatNo;
  if (addressType) updateData.addressType = addressType;

  try {
    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedAddress) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND });
    }

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.PROFILE.ADDRESS_UPDATED,
      address: updatedAddress,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAddress(req, res, next) {
  const { id } = req.params;

  try {
    const deletedAddress = await Address.findByIdAndDelete(id);
    if (!deletedAddress) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.ADDRESS_NOT_FOUND });
    }

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.ADDRESS_DELETED });
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.USER_NOT_FOUND });
    }

    // Check if the current password is correct
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ message: MESSAGES.PROFILE.PASSWORD_INCORRECT });
    }

    // Check if new password and confirm password match
    if (newPassword !== confirmPassword) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.PROFILE.PASSWORDS_DONT_MATCH });
    }

    if (newPassword.length < 6) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .json({ message: MESSAGES.PROFILE.PASSWORD_TOO_SHORT });
    }

    // Hash new password and save
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.PROFILE.PASSWORD_CHANGED });
  } catch (error) {
    next(error);
  }
}

const getWalletBalance = async (req, res, next) => {
  try {
    const userId = req.session.user._id;
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 });
      await wallet.save();
    }

    return res.status(HTTP_STATUS.OK).json({ balance: wallet.balance });
  } catch (error) {
    next(error);
  }
};

const deductWalletAmount = async (req, res, next) => {
  try {
    const userId = req.session.user._id;
    const { orderId, amount } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.PROFILE.USER_NOT_FOUND });
    }

    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.WALLET.NOT_FOUND });
    }

    // Check if the wallet has sufficient balance
    if (wallet.balance < amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: MESSAGES.WALLET.INSUFFICIENT_BALANCE });
    }

    wallet.balance = roundToTwo(wallet.balance - amount);

    const customOrder = await Order.findById(orderId);
    if (!customOrder) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.WALLET.ORDER_NOT_FOUND });
    }

    // Log the wallet transaction as a debit
    const newTransaction = new Transaction({
      userId: user._id,
      transactionId: await generateTransactionId(),
      amount: amount,
      type: "debit",
      orderId: customOrder.orderId,
      description: `Payment for Order ${customOrder.orderId}`,
    });

    await Promise.all([wallet.save(), newTransaction.save()]);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ message: MESSAGES.WALLET.ORDER_NOT_FOUND });
    }

    order.paymentStatus = "Successful";
    await order.save();

    // Reduce stock
    for (const item of order.items) {
      const product = await Product.findById(item.productId);

      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }
    }

    return res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.WALLET.PAYMENT_SUCCESS,
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    next(error);
  }
};

async function getWallet(req, res, next) {
  const userId = req.session.user._id;
  const user = await User.findById(userId);
  const page = parseInt(req.query.page) || 1;
  const limit = 5;
  const skip = (page - 1) * limit;
  const { search, sort } = req.query;

  try {
    let walletDoc = await Wallet.findOne({ userId });

    if (!walletDoc) {
      walletDoc = new Wallet({ userId });
      await walletDoc.save();
    }

    // Prepare search filter
    const query = { userId: new mongoose.Types.ObjectId(userId) };
    if (search) {
      query.transactionId = { $regex: search.trim(), $options: "i" };
    }
    if (sort === "credit" || sort === "debit") {
      query.type = sort;
    }

    // Sort options
    const sortOption = { date: sort === "oldest" ? 1 : -1 };

    // Fetch total count and paginated data using Transactions collection
    const [transactions, totalTransactions, totalTransactionsUnfiltered] = await Promise.all([
      Transaction.find(query).sort(sortOption).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(query),
      Transaction.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })
    ]);

    const totalPages = Math.max(1, Math.ceil(totalTransactions / limit));

    res.render("user/userWallet", {
      wallet: walletDoc,
      transactions,
      user,
      referralBaseUrl: process.env.CLIENT_URL_FOR_REFFERAL,
      currentPage: page,
      totalPages,
      totalTransactions,
      totalTransactionsUnfiltered,
      limit,
      search: search || "",
      sort: sort || "latest"
    });
  } catch (error) {
    next(error);
  }
}

export {
  getUserProfile,
  updateUserProfile,
  updateEmail,
  updatePhoneNumber,
  getAddresses,
  addAddress,
  editAddress,
  deleteAddress,
  changePassword,
  getWalletBalance,
  deductWalletAmount,
  getWallet
};
