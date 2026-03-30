import bcrypt from "bcryptjs";
import crypto from "crypto";
import userRepository from "../repositories/userRepository.js";
import adminRepository from "../repositories/adminRepository.js";
import Admin from "../model/admin.js"; // Needed for static findOne if repo not sufficient
import walletRepository from "../repositories/walletRepository.js";
import transactionRepository from "../repositories/transactionRepository.js";
import { sendOtpEmail, getOtpEmailTemplate, getPasswordResetEmailTemplate } from "../utils/otpHelper.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

const OTP_VALIDITY_DURATION = 60 * 1000;

const authService = {
  signup: async (userData, referral) => {
    const { firstname, lastname, email, password } = userData;
    const existingUser = await userRepository.findOne({ email });
    if (existingUser) {
      throw { statusCode: HTTP_STATUS.CONFLICT, message: MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    await sendOtpEmail(email, otp, MESSAGES.AUTH.OTP_EMAIL_SUBJECT, getOtpEmailTemplate);

    return {
      firstname,
      lastname,
      email,
      password: hashedPassword,
      otp,
      otpTimestamp,
      referral
    };
  },

  verifyOtp: async (tempUser, inputOtp) => {
    if (!tempUser) {
      throw { statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION };
    }
    if (Date.now() - tempUser.otpTimestamp > OTP_VALIDITY_DURATION) {
      throw { statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.OTP_EXPIRED };
    }
    if (String(tempUser.otp) !== String(inputOtp)) {
      throw { statusCode: HTTP_STATUS.CONFLICT, message: MESSAGES.AUTH.INVALID_OTP };
    }

    const newUser = await userRepository.save({
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    if (tempUser.referral) {
      await handleReferral(tempUser.referral, newUser._id);
    }

    return newUser;
  },

  resendOtp: async (tempUser) => {
    if (!tempUser) {
      throw { statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION };
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    await sendOtpEmail(tempUser.email, otp, MESSAGES.AUTH.OTP_EMAIL_SUBJECT, getOtpEmailTemplate);

    return { otp, otpTimestamp };
  },

  sendOtpForPasswordReset: async (email) => {
    const existingUser = await userRepository.findOne({ email });
    if (!existingUser) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.AUTH.EMAIL_NOT_REGISTERED };
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    await sendOtpEmail(email, otp, MESSAGES.AUTH.PASSWORD_RESET_EMAIL_SUBJECT, getPasswordResetEmailTemplate);

    return { email, otp, otpTimestamp };
  },

  verifyOtpForPasswordReset: async (resetUser, inputOtp) => {
    if (!resetUser) {
      throw { statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET };
    }
    if (Date.now() - resetUser.otpTimestamp > OTP_VALIDITY_DURATION) {
      throw { statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.OTP_EXPIRED };
    }
    if (String(resetUser.otp) !== String(inputOtp)) {
      throw { statusCode: HTTP_STATUS.CONFLICT, message: MESSAGES.AUTH.INVALID_OTP };
    }

    return true;
  },

  resetPassword: async (email, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return await userRepository.updateOne({ email }, { password: hashedPassword });
  },

  adminLogin: async (email, password) => {
    const admin = await Admin.findOne({ email });
    if (admin && (await bcrypt.compare(password, admin.password))) {
      return admin;
    }
    throw { statusCode: 401, message: MESSAGES.AUTH.INVALID_CREDENTIALS };
  },

  login: async (email, password) => {
    const user = await userRepository.findOne({ email });
    if (!user) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: MESSAGES.AUTH.EMAIL_NOT_REGISTERED_LOGIN };
    }
    if (user.isBlocked) {
      throw { statusCode: HTTP_STATUS.FORBIDDEN, message: MESSAGES.AUTH.USER_BLOCKED };
    }
    if (!user.password) {
      throw { statusCode: HTTP_STATUS.BAD_REQUEST, message: MESSAGES.AUTH.GOOGLE_AUTH_REQUIRED };
    }
    if (!(await bcrypt.compare(password, user.password))) {
      throw { statusCode: HTTP_STATUS.UNAUTHORIZED, message: MESSAGES.AUTH.PASSWORD_INCORRECT };
    }
    return user;
  }
};

async function handleReferral(referrerId, newUserId) {
  const referrer = await userRepository.findById(referrerId);
  if (referrer && !referrer.referralCreditsClaimed) {
    let wallet = await walletRepository.findOne({ userId: referrerId });
    if (!wallet) {
      wallet = await walletRepository.save({ userId: referrerId, balance: 0 });
    }

    const amount = 600;
    const newBalance = +(Math.round((wallet.balance + amount) + "e+2") + "e-2");
    
    await walletRepository.updateByQuery({ userId: referrerId }, { balance: newBalance });

    await transactionRepository.save({
      userId: referrerId,
      transactionId: `TRA-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
      amount: amount,
      type: "credit",
      description: MESSAGES.AUTH.REFERRAL_REWARD_DESC,
    });

    await userRepository.updateById(referrerId, { referralCreditsClaimed: true });
  }
}

export default authService;
