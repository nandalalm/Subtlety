import authService from "../services/authService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";

function getLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  req.session.passwordResetUser = null;
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
  const tempUser = req.session.tempUser || null;
  res.render("user/signup", {
    pendingSignup: tempUser ? {
      firstname: tempUser.firstname,
      lastname: tempUser.lastname,
      email: tempUser.email,
      otpTimestamp: tempUser.otpTimestamp,
    } : null
  });
}

async function addUser(req, res, next) {
  try {
    const { referral } = req.body;
    const tempUser = await authService.signup(req.body, referral);
    
    req.session.tempUser = tempUser;
    if (referral) {
      req.session.referralUserId = referral;
    }

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.OTP_SENT,
      otpTimestamp: tempUser.otpTimestamp
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  const { email, otp, referral } = req.body;
  try {
    const tempUser = req.session.tempUser;
    // Basic session validation here, business logic in service
    if (!tempUser || tempUser.email !== email) {
      return res.status(HTTP_STATUS.GONE).json({ message: MESSAGES.AUTH.USER_NOT_IN_SESSION });
    }

    const newUser = await authService.verifyOtp(tempUser, otp);
    
    req.session.tempUser = null;
    req.session.user = newUser;
    
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_VERIFIED, redirect: "/user/home" });
  } catch (error) {
    next(error);
  }
}

async function resendOtp(req, res, next) {
  const { email } = req.body;
  try {
    const tempUser = req.session.tempUser;
    if (!tempUser || tempUser.email !== email) {
      return res.status(HTTP_STATUS.GONE).json({ message: MESSAGES.AUTH.USER_NOT_IN_SESSION });
    }

    const { otp, otpTimestamp } = await authService.resendOtp(tempUser);
    
    req.session.tempUser.otp = otp;
    req.session.tempUser.otpTimestamp = otpTimestamp;

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.NEW_OTP_SENT,
      otpTimestamp
    });
  } catch (error) {
    next(error);
  }
}

async function loginUser(req, res, next) {
  const { email, password } = req.body;
  try {
    const user = await authService.login(email, password);
    req.session.user = user;
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.AUTH.LOGIN_SUCCESS,
      redirect: "/user/home"
    });
  } catch (error) {
    if ([HTTP_STATUS.BAD_REQUEST, HTTP_STATUS.UNAUTHORIZED, HTTP_STATUS.FORBIDDEN, HTTP_STATUS.NOT_FOUND].includes(error.statusCode)) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async function logout(req, res) {
  if (req.session.user) {
    delete req.session.user;
  }
  res.redirect("/auth/login");
}

async function getForgotPassword(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }
  const resetUser = req.session.passwordResetUser || null;
  res.render("user/forgot-password", {
    pendingReset: resetUser ? {
      email: resetUser.email,
      otpTimestamp: resetUser.otpTimestamp,
      isOtpVerified: Boolean(resetUser.isOtpVerified),
    } : null
  });
}

async function sendOtpForPasswordReset(req, res, next) {
  const { email } = req.body;
  try {
    const resetData = await authService.sendOtpForPasswordReset(email);
    req.session.passwordResetUser = { ...resetData, isOtpVerified: false };
    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.PASSWORD_RESET_OTP_SENT,
      otpTimestamp: resetData.otpTimestamp
    });
  } catch (error) {
    next(error);
  }
}

async function verifyOtpForPasswordReset(req, res, next) {
  const { email, otp } = req.body;
  try {
    const resetUser = req.session.passwordResetUser;
    if (!resetUser || resetUser.email !== email) {
      return res.status(HTTP_STATUS.GONE).json({ message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }

    await authService.verifyOtpForPasswordReset(resetUser, otp);
    req.session.passwordResetUser.isOtpVerified = true;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_VERIFIED_SUCCESS });
  } catch (error) {
    next(error);
  }
}

async function resetPassword(req, res, next) {
  const { email, newPassword } = req.body;
  try {
    const resetUser = req.session.passwordResetUser;
    if (!resetUser || resetUser.email !== email) {
      return res.status(HTTP_STATUS.GONE).json({ message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }
    if (!resetUser.isOtpVerified) {
      return res.status(HTTP_STATUS.CONFLICT).json({ message: MESSAGES.AUTH.INVALID_OTP });
    }
    await authService.resetPassword(email, newPassword);
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
      return res.status(HTTP_STATUS.GONE).json({ message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }

    const { otp, otpTimestamp } = await authService.resendOtp(resetUser); // Using resendOtp for common logic
    
    req.session.passwordResetUser.otp = otp;
    req.session.passwordResetUser.otpTimestamp = otpTimestamp;
    req.session.passwordResetUser.isOtpVerified = false;

    res.status(HTTP_STATUS.OK).json({
      message: MESSAGES.AUTH.NEW_OTP_SENT,
      otpTimestamp
    });
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
    const admin = await authService.adminLogin(email, password);
    req.session.admin = admin;
    res.redirect("/admin/dashboard");
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).send(error.message);
    }
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
  adminLogout
};
