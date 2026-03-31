import adminService from "../services/adminService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

async function getHome(req, res, next) {
  try {
    const data = await adminService.getDashboardData();
    res.render("admin/dashboard", {
      ...data,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function getUsers(req, res, next) {
  try {
    const data = await adminService.getUsers(req.query);
    const viewData = {
      ...data,
      currentPage: parseInt(req.query.page) || 1,
      search: req.query.search || "",
      sort: req.query.sort || "",
      limit: parseInt(req.query.limit) || 10,
    };

    if (req.query.ajax) {
      return res.render("partials/Admin/usersTable", viewData);
    }

    res.render("admin/usersList", {
      ...viewData,
      admin: req.session.admin
    });
  } catch (error) {
    next(error);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const userId = req.params.id;
    const sessionUserId = req.session.user?._id;
    
    const { isBlocked, loggedOut } = await adminService.toggleUserStatus(userId, sessionUserId);
    
    if (loggedOut) {
      delete req.session.user;
    }

    return res.status(HTTP_STATUS.OK).json({ success: true, isBlocked, user: { isBlocked } });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

export {
  getHome,
  getUsers,
  toggleUserStatus,
};
