import adminService from "../services/adminService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";

class AdminController {
async getHome(req, res, next) {
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

async getUsers(req, res, next) {
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

async toggleUserStatus(req, res, next) {
  try {
    const userId = req.params.id;
    const sessionUserId = req.session.user?._id;
    
    const { isBlocked, loggedOut } = await adminService.toggleUserStatus(userId, sessionUserId);
    
    if (loggedOut) {
      delete req.session.user;
    }

    return res.status(HTTP_STATUS.OK).json({ success: true, isBlocked, user: { isBlocked } });
  } catch (error) {
    next(error);
  }
}
}

const adminController = new AdminController();

const getHome = adminController.getHome.bind(adminController);
const getUsers = adminController.getUsers.bind(adminController);
const toggleUserStatus = adminController.toggleUserStatus.bind(adminController);

export {
  getHome,
  getUsers,
  toggleUserStatus
};
