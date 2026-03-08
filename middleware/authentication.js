const User = require('../model/user');

function isAuthenticated(req, res, next) {
  if (!req.session.admin) {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect("/admin/login");
  }
  next();
}

async function userAuthenticated(req, res, next) {
  if (!req.session.user) {
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect("/user/login");
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user || user.isBlocked) {
      req.session.user = null; // Clear user session
      if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.status(401).json({ error: 'Account blocked or not found' });
      }
      return res.redirect("/user/login");
    }
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = {
  isAuthenticated,
  userAuthenticated,
};
