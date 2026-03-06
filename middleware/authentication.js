function isAuthenticated(req, res, next) {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  } else {
    next();
  }
}

function userAuthenticated(req, res, next) {
  if (!req.session.user) {
    res.redirect("/user/login");
  } else {
    next();
  }
}

module.exports = {
  isAuthenticated,
  userAuthenticated,
};
