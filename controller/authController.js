import authService from "../services/authService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import passport from "passport";
import dtoMapper from "../utils/dtoMapper.js";

class AuthController {
getSafeReturnTo(returnTo) {
  const normalized = String(returnTo || "").trim();
  if (!normalized.startsWith("/")) return null;
  if (normalized.startsWith("//")) return null;

  const isShopPage = normalized === "/user/shop" || normalized.startsWith("/user/shop?");
  const isSingleProductPage = normalized.startsWith("/user/single-product/");

  return isShopPage || isSingleProductPage ? normalized : null;
}

googleLogin(req, res, next) {
  const safeReturnTo = this.getSafeReturnTo(req.query.returnTo || req.session.returnTo);
  if (safeReturnTo) {
    req.session.returnTo = safeReturnTo;
  }

  req.session.save((saveError) => {
    if (saveError) return next(saveError);
    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
      state: safeReturnTo || ""
    })(req, res, next);
  });
}

googleCallback(req, res, next) {
  passport.authenticate("google", async (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      if (info && info.message === MESSAGES.AUTH.GOOGLE_BLOCKED_INFO) {
        req.session.errorMessage = MESSAGES.AUTH.USER_BLOCKED;
        return res.redirect("/auth/login");
      }
      return res.redirect("/");
    }
    if (user.isBlocked) {
      req.session.errorMessage = MESSAGES.AUTH.USER_BLOCKED;
      return res.redirect("/auth/login");
    }
    req.logIn(user, (loginError) => {
      if (loginError) return next(loginError);
      req.session.user = dtoMapper.toUserDto(user);
      const redirectTo =
        this.getSafeReturnTo(req.query.state) ||
        this.getSafeReturnTo(req.session.returnTo) ||
        "/user/home";
      delete req.session.returnTo;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.redirect(redirectTo);
      });
    });
  })(req, res, next);
}

getLogin(req, res) {
  if (req.session.user) {
    return res.redirect("/user/home");
  }

  const safeReturnTo = this.getSafeReturnTo(req.query.returnTo);
  if (safeReturnTo) {
    req.session.returnTo = safeReturnTo;
  }

  const googleLoginUrl = req.session.returnTo
    ? `/auth/google?returnTo=${encodeURIComponent(req.session.returnTo)}`
    : "/auth/google";

  req.session.passwordResetUser = null;
  const errorMessage = req.session.errorMessage || null;
  req.session.errorMessage = null;
  res.render("user/login", { 
    errorMessage, 
    googleLoginUrl,
    demoEmail: process.env.DEMO_USER_EMAIL || 'demoUser@gmail.com',
    demoPassword: process.env.DEMO_USER_PASSWORD || ''
  });
}

async getSignup(req, res) {
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

async addUser(req, res, next) {
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

async verifyOtp(req, res, next) {
  const { email, otp, referral } = req.body;
  try {
    const tempUser = req.session.tempUser;
    if (!tempUser || tempUser.email !== email) {
      return next({ statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION });
    }

    const newUser = await authService.verifyOtp(tempUser, otp);
    
    req.session.tempUser = null;
    req.session.user = newUser;
    
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_VERIFIED, redirect: "/user/home" });
  } catch (error) {
    next(error);
  }
}

async resendOtp(req, res, next) {
  const { email } = req.body;
  try {
    const tempUser = req.session.tempUser;
    if (!tempUser || tempUser.email !== email) {
      return next({ statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION });
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

async loginUser(req, res, next) {
  const { email, password } = req.body;
  try {
    const user = await authService.login(email, password);
    req.session.user = user;
    const redirectTo = this.getSafeReturnTo(req.session.returnTo) || "/user/home";
    delete req.session.returnTo;
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: MESSAGES.AUTH.LOGIN_SUCCESS,
      redirect: redirectTo
    });
  } catch (error) {
    next(error);
  }
}

async logout(req, res) {
  if (req.session.user) {
    delete req.session.user;
  }
  delete req.session.returnTo;
  res.redirect("/auth/login");
}

async getForgotPassword(req, res) {
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

async sendOtpForPasswordReset(req, res, next) {
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

async verifyOtpForPasswordReset(req, res, next) {
  const { email, otp } = req.body;
  try {
    const resetUser = req.session.passwordResetUser;
    if (!resetUser || resetUser.email !== email) {
      return next({ statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }

    await authService.verifyOtpForPasswordReset(resetUser, otp);
    req.session.passwordResetUser.isOtpVerified = true;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.OTP_VERIFIED_SUCCESS });
  } catch (error) {
    next(error);
  }
}

async resetPassword(req, res, next) {
  const { email, newPassword } = req.body;
  try {
    const resetUser = req.session.passwordResetUser;
    if (!resetUser || resetUser.email !== email) {
      return next({ statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }
    if (!resetUser.isOtpVerified) {
      return next({ statusCode: HTTP_STATUS.CONFLICT, message: MESSAGES.AUTH.INVALID_OTP });
    }
    await authService.resetPassword(email, newPassword);
    req.session.passwordResetUser = null;
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.AUTH.PASSWORD_CHANGED });
  } catch (error) {
    next(error);
  }
}

async resendPasswordResetOtp(req, res, next) {
  const { email } = req.body;
  try {
    const resetUser = req.session.passwordResetUser;
    if (!resetUser || resetUser.email !== email) {
      return next({ statusCode: HTTP_STATUS.GONE, message: MESSAGES.AUTH.USER_NOT_IN_SESSION_RESET });
    }

    const { otp, otpTimestamp } = await authService.resendOtp(resetUser); 
    
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

getAdminLogin(req, res) {
  if (req.session.admin) {
    return res.redirect("/admin/dashboard");
  }
  res.render("admin/login");
}

async loginadmin(req, res, next) {
  const { email, password } = req.body;
  try {
    const admin = await authService.adminLogin(email, password);
    req.session.admin = admin;
    res.redirect("/admin/dashboard");
  } catch (error) {
    next(error);
  }
}

async adminLogout(req, res) {
  if (req.session.admin) {
    delete req.session.admin;
  }
  res.redirect("/admin/login");
}
}

const authController = new AuthController();

const getSafeReturnTo = authController.getSafeReturnTo.bind(authController);
const googleLogin = authController.googleLogin.bind(authController);
const googleCallback = authController.googleCallback.bind(authController);
const getLogin = authController.getLogin.bind(authController);
const getSignup = authController.getSignup.bind(authController);
const addUser = authController.addUser.bind(authController);
const verifyOtp = authController.verifyOtp.bind(authController);
const resendOtp = authController.resendOtp.bind(authController);
const loginUser = authController.loginUser.bind(authController);
const logout = authController.logout.bind(authController);
const getForgotPassword = authController.getForgotPassword.bind(authController);
const sendOtpForPasswordReset = authController.sendOtpForPasswordReset.bind(authController);
const verifyOtpForPasswordReset = authController.verifyOtpForPasswordReset.bind(authController);
const resetPassword = authController.resetPassword.bind(authController);
const resendPasswordResetOtp = authController.resendPasswordResetOtp.bind(authController);
const getAdminLogin = authController.getAdminLogin.bind(authController);
const loginadmin = authController.loginadmin.bind(authController);
const adminLogout = authController.adminLogout.bind(authController);

export {
  getSafeReturnTo,
  googleLogin,
  googleCallback,
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
