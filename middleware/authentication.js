function isAuthenticated(req, res, next) {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  } else {
    next();
  }
}

function userAuthenticated(req, res, next) {
  if (!req.session.user) {
    res.redirect("/user/login"); // Redirect to login if not logged in
  } else {
    next(); // User is logged in, proceed to the next middleware
  }
}

module.exports = {
  isAuthenticated,
  userAuthenticated,
};
