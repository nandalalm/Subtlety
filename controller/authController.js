import User from "../model/user.js";
import Admin from "../model/admin.js";
import Wallet from "../model/wallet.js";
import Transaction from "../model/transaction.js";
import bcrypt from "bcryptjs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from 'url';
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import { sendOtpEmail, getOtpEmailTemplate, getPasswordResetEmailTemplate } from "../utils/otpHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to generate unique Transaction ID
async function generateTransactionId() {
  return `TRA-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

// Helper to round to 2 decimal places
const roundToTwo = (num) => {
  return +(Math.round(num + "e+2") + "e-2");
};

// User Auth Functions
function getLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  const errorMessage = req.session.errorMessage || null;
  req.session.errorMessage = null;
  res.render("user/login", { 
    errorMessage, 
    demoEmail: process.env.DEMO_USER_EMAIL || 'demoUser@gmail.com',
    demoPassword: process.env.DEMO_USER_PASSWORD || ''
  });
}

async function getSignup(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  res.render("user/signup");
}

async function addUser(req, res, next) {
  const { firstname, lastname, email, password, referral } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.USER_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    // Store user data temporarily in the session
    req.session.tempUser = {
      firstname,
      lastname,
      email,
      password: hashedPassword,
      otp,
      otpTimestamp,
    };

    // Store referral user ID if any in the session
    if (referral) {
      req.session.referralUserId = referral;
    }

    await sendOtpEmail(email, otp, MESSAGES.AUTH.OTP_EMAIL_SUBJECT, getOtpEmailTemplate);

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_SENT });
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  const { email, otp, referral } = req.body;

  try {
    const tempUser = req.session.tempUser;

    if (
      !tempUser ||
      tempUser.email !== email ||
      String(tempUser.otp) !== String(otp)
    ) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.INVALID_OTP);
    }

    const otpValidityDuration = 60 * 1000;
    if (Date.now() - tempUser.otpTimestamp > otpValidityDuration) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.OTP_EXPIRED);
    }

    const newUser = new User({
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    await newUser.save();

    req.session.tempUser = null;

    if (referral) {
      const referralUser = await User.findById(referral);

      // Check if the referral user exists and hasn't already been credited
      if (referralUser && !referralUser.referralCreditsClaimed) {

        let wallet = await Wallet.findOne({ userId: referralUser });
        if (!wallet) {
          wallet = new Wallet({ userId: referralUser._id, balance: 0 });
        }

        const amount = 600;
        wallet.balance = roundToTwo(wallet.balance + amount);

        const newTransaction = new Transaction({
          userId: referralUser._id,
          transactionId: await generateTransactionId(),
          amount: amount,
          type: "credit",
          description: MESSAGES.AUTH.REFERRAL_REWARD_DESC,
        });

        await Promise.all([wallet.save(), newTransaction.save()]);

        referralUser.referralCreditsClaimed = true;
        await referralUser.save();
      }
    }

    req.session.user = newUser;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_VERIFIED, redirect: "/user/home" });
  } catch (error) {
    next(error);
  }
}

async function resendOtp(req, res, next) {
  const { email } = req.body;

  try {
    // Check if user data is in the session
    const tempUser = req.session.tempUser;

    if (!tempUser || tempUser.email !== email) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(MESSAGES.AUTH.USER_NOT_IN_SESSION);
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    tempUser.otp = otp;
    tempUser.otpTimestamp = otpTimestamp;

    await sendOtpEmail(email, otp, MESSAGES.AUTH.OTP_EMAIL_SUBJECT, getOtpEmailTemplate);

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.NEW_OTP_SENT });
  } catch (error) {
    next(error);
  }
}

async function loginUser(req, res, next) {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.session.errorMessage = MESSAGES.AUTH.INVALID_CREDENTIALS;
      return res.redirect("/user/login");
    }

    if (!user.password) {
      req.session.errorMessage = MESSAGES.AUTH.GOOGLE_AUTH_REQUIRED;
      return res.redirect("/user/login");
    }

    if (!password || !user.password || !(await bcrypt.compare(password, user.password))) {
      req.session.errorMessage = MESSAGES.AUTH.INVALID_CREDENTIALS;
      return res.redirect("/user/login");
    }

    if (user.isBlocked) {
      req.session.errorMessage = MESSAGES.AUTH.USER_BLOCKED;
      return res.redirect("/user/login");
    }

    req.session.user = user;
    return res.redirect("/user/home");
  } catch (error) {
    next(error);
  }
}

async function logout(req, res) {
  if (req.session.user) {
    delete req.session.user;
  }
  res.redirect("/user/login");
}

async function getForgotPassword(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  res.render("user/forgot-password");
}

async function sendOtpForPasswordReset(req, res, next) {
  const { email } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.EMAIL_NOT_REGISTERED);
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    req.session.passwordResetUser = { email, otp, otpTimestamp };

    await sendOtpEmail(email, otp, MESSAGES.AUTH.PASSWORD_RESET_EMAIL_SUBJECT, getPasswordResetEmailTemplate);

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.PASSWORD_RESET_OTP_SENT,
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOtpForPasswordReset(req, res, next) {
  const { email, otp } = req.body;

  try {
    const resetUser = req.session.passwordResetUser;

    if (
      !resetUser ||
      resetUser.email !== email ||
      String(resetUser.otp) !== String(otp)
    ) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.INVALID_OTP);
    }

    const otpValidityDuration = 60 * 1000;
    if (Date.now() - resetUser.otpTimestamp > otpValidityDuration) {
      return res.status(HTTP_STATUS.BAD_REQUEST).send(MESSAGES.AUTH.OTP_EXPIRED);
    }

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.OTP_VERIFIED_SUCCESS,
    });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  const { email, newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password
    await User.updateOne({ email }, { password: hashedPassword });

    // Clear the password reset session data
    req.session.passwordResetUser = null;

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.PASSWORD_CHANGED });
  } catch (error) {
    next(error);
  }
}

async function resendPasswordResetOtp(req, res, next) {
  const { email } = req.body;

  try {
    const resetUser = req.session.passwordResetUser;

    if (!resetUser || resetUser.email !== email) {
      return res
        .status(HTTP_STATUS.BAD_REQUEST)
        .send(MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET);
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const otpTimestamp = Date.now();

    // Update the OTP and timestamp in the session
    resetUser.otp = otp;
    resetUser.otpTimestamp = otpTimestamp;

    await sendOtpEmail(email, otp, MESSAGES.AUTH.PASSWORD_RESET_EMAIL_SUBJECT, getPasswordResetEmailTemplate);

    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.NEW_OTP_SENT });
  } catch (error) {
    next(error);
  }
}

// Admin Auth Functions
function getAdminLogin(req, res) {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login");
}

async function loginadmin(req, res, next) {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });

    if (admin && (await bcrypt.compare(password, admin.password))) {
      req.session.admin = admin;
      res.redirect("/admin/dashboard");
    } else {
      res.status(HTTP_STATUS.UNAUTHORIZED).send(MESSAGES.AUTH.INVALID_CREDENTIALS);
    }
  } catch (error) {
    next(error);
  }
}

async function adminLogout(req, res) {
  if (req.session.admin) {
    delete req.session.admin;
  }
  res.redirect("/admin/login");
}

export {
  getLogin,
  getSignup,
  addUser,
  verifyOtp,
  resendOtp,
  loginUser,
  logout,
  getForgotPassword,
  sendOtpForPasswordReset,
  verifyOtpForPasswordReset,
  resetPassword,
  resendPasswordResetOtp,
  getAdminLogin,
  loginadmin,
  adminLogout,
  generateTransactionId,
  sendOtpEmail
};
