import User from "../model/user.js";
import MESSAGES from "../Constants/messages.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

function isAuthenticated(req, res, next) {
  if (!req.session.admin) {
    return next({
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: MESSAGES.MIDDLEWARE.UNAUTHORIZED,
      logout: true,
      redirect: "/admin/login"
    });
  }
  next();
}

async function userAuthenticated(req, res, next) {
  if (!req.session.user) {
    return next({
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: MESSAGES.MIDDLEWARE.UNAUTHORIZED,
      logout: true,
      redirect: "/auth/login"
    });
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user || user.isBlocked) {
      req.session.user = null; 
      return next({
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: MESSAGES.MIDDLEWARE.ACCOUNT_BLOCKED_OR_NOT_FOUND,
        logout: true,
        redirect: "/auth/login"
      });
    }
    next();
  } catch (err) {
    err.message = err.message || MESSAGES.MIDDLEWARE.INTERNAL_SERVER_ERROR;
    err.statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    next(err);
  }
}

export {
  isAuthenticated,
  userAuthenticated,
};
