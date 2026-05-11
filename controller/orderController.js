import orderService from "../services/orderService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import { 
  generateInvoicePdf, 
  generateSalesReportPdf, 
  generateSalesReportExcel 
} from "../utils/reportHelper.js";

class OrderController {
async checkoutPage(req, res, next) {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.UNAUTHORIZED });
    }

    const data = await orderService.getCheckoutData(userId);
    
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      if (data.validationIssues && data.validationIssues.length > 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: data.message,
          errors: data.validationIssues,
          cartState: data.cartState
        });
      }
      return res.status(HTTP_STATUS.OK).json({ success: true });
    }

    res.render("user/checkout", {
      ...data,
      user: req.session.user
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST && error.redirect) {
        if (req.headers.accept && req.headers.accept.includes("application/json")) {
            return res.status(error.statusCode).json({ message: error.message, errors: error.errors, cartState: error.cartState });
        }
        return res.redirect(error.redirect);
    }
    next(error);
  }
}

async applyCoupon(req, res, next) {
  try {
    const { couponCode } = req.body;
    const userId = req.session.user?._id;
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });

    const result = await orderService.applyCoupon(userId, couponCode);
    res.status(HTTP_STATUS.OK).json(result);
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({
        message: error.message,
        errors: error.errors,
        cartState: error.cartState,
        couponState: error.couponState || null
      });
    }
    next(error);
  }
}

async confirmOrder(req, res, next) {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });

    const orderData = {
        ...req.body,
        items: req.body.items,
        totalAmount: req.body.totalAmount,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        couponCode: req.body.couponCode,
        couponDiscount: req.body.couponDiscount
    };

    const savedOrder = await orderService.placeOrder(userId, orderData);
    res.status(HTTP_STATUS.CREATED).json({
        message: MESSAGES.ORDER.PLACED,
        orderId: savedOrder._id
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({ message: error.message, errors: error.errors, cartState: error.cartState, couponState: error.couponState || null });
    }
    next(error);
  }
}

async createRazorpayOrder(req, res, next) {
  try {
    const { orderId } = req.body;
    const razorpayOrder = await orderService.createRazorpayOrder(orderId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async confirmRazorpayPayment(req, res, next) {
  try {
    const { orderId } = req.body;
    await orderService.confirmRazorpayPayment(orderId);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.ORDER.PAYMENT_CONFIRMED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: error.message });
    next(error);
  }
}

async getOrderSuccessPage(req, res, next) {
  try {
    const { orderId } = req.query;
    const order = await orderService.getOrderDetail(req.session.user._id, orderId);
    res.render("user/orderSuccess", { order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async getUserOrders(req, res, next) {
  try {
    const userId = req.session.user._id;
    const data = await orderService.getUserOrders(userId, req.query);
    const viewData = {
      ...data,
      user: req.session.user,
      currentPage: parseInt(req.query.page) || 1,
      search: req.query.search || "",
      sort: req.query.sort || "latest",
      paymentStatus: req.query.paymentStatus || "",
      isAdmin: false
    };

    if (req.query.ajax) {
      return res.render("partials/Common/orderTable", viewData);
    }

    res.render("user/orders", viewData);
  } catch (error) {
    next(error);
  }
}

async getUserOrderDetails(req, res, next) {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(userId, orderId);
    res.render("user/orderDetails", { order, user: req.session.user });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async downloadInvoice(req, res, next) {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(userId, orderId);
    generateInvoicePdf(res, order);
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async cancelProduct(req, res, next) {
  try {
    const userId = req.session.user._id;
    const { id: orderId, productId } = req.params;
    await orderService.cancelOrderItem(userId, orderId, productId);
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.ORDER.CANCELLED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async returnProduct(req, res, next) {
  try {
    const userId = req.session.user._id;
    const { id: orderId, productId } = req.params;
    const { reason } = req.body;
    await orderService.submitReturnRequest(userId, orderId, productId, reason);
    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.ORDER.RETURN_SUBMITTED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async getAdminOrders(req, res, next) {
  try {
    const data = await orderService.getAdminOrders(req.query);
    const viewData = {
      ...data,
      currentPage: parseInt(req.query.page) || 1,
      search: req.query.search || "",
      sort: req.query.sort || "default",
      paymentStatus: req.query.paymentStatus || "",
      admin: req.session.admin,
      isAdmin: true
    };

    if (req.query.ajax) {
      return res.render("partials/Common/orderTable", viewData);
    }

    res.render("admin/orderList", viewData);
  } catch (error) {
    next(error);
  }
}

async changeProductStatus(req, res, next) {
  try {
    const { orderId, productId, status } = req.body;
    await orderService.changeItemStatus(orderId, productId, status);
    res.json({ success: true });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async changeOrderStatus(req, res, next) {
  try {
    const { orderId, newStatus } = req.body;
    await orderService.changeOrderStatus(orderId, newStatus);
    res.json({ success: true });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST || error.statusCode === HTTP_STATUS.NOT_FOUND) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async getAdminOrderDetails(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(null, orderId, true);
    res.json({ order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ message: error.message });
    next(error);
  }
}

async getAdminOrderView(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(null, orderId, true);
    
    const page = req.query.page || 1;
    const sort = req.query.sort || 'default';
    const search = req.query.search || '';
    const paymentStatus = req.query.paymentStatus || '';
    const backQuery = `page=${page}&sort=${sort}&search=${encodeURIComponent(search)}&paymentStatus=${paymentStatus}`;

    res.render("admin/orderView", { order, backQuery });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).render("404", { message: error.message });
    next(error);
  }
}

async getAdminOrderDetailsJson(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(null, orderId, true);
    res.json({ success: true, order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async approveReturn(req, res, next) {
  try {
    const { orderId, productId, action, rejectReason } = req.body;
    await orderService.handleReturn(orderId, productId, action, rejectReason);
    res.json({
      success: true,
      message: action === "approve" ? MESSAGES.ORDER.RETURN_APPROVED : MESSAGES.ORDER.RETURN_REJECTED,
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND || error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    next(error);
  }
}

async getSalesReport(req, res, next) {
  try {
    const data = await orderService.getSalesReportData(req.query);
    const viewData = {
      ...data,
      currentPage: parseInt(req.query.page) || 1,
      reportType: req.query.reportType || "all",
      startDate: req.query.startDate || "",
      endDate: req.query.endDate || "",
      sort: req.query.sort || "latest",
      admin: req.session.admin,
    };

    if (req.query.ajax) {
      return res.render("partials/Admin/salesReportContent", viewData);
    }

    res.render("admin/salesReport", viewData);
  } catch (error) {
    next(error);
  }
}

async generateSalesReport(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null }); 
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

async downloadSalesReportPdf(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null });
    generateSalesReportPdf(res, data.orders);
  } catch (error) {
    next(error);
  }
}

async downloadSalesReportExcel(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null });
    await generateSalesReportExcel(res, data.orders);
  } catch (error) {
    next(error);
  }
}
}

const orderController = new OrderController();

const checkoutPage = orderController.checkoutPage.bind(orderController);
const applyCoupon = orderController.applyCoupon.bind(orderController);
const confirmOrder = orderController.confirmOrder.bind(orderController);
const createRazorpayOrder = orderController.createRazorpayOrder.bind(orderController);
const confirmRazorpayPayment = orderController.confirmRazorpayPayment.bind(orderController);
const getOrderSuccessPage = orderController.getOrderSuccessPage.bind(orderController);
const getUserOrders = orderController.getUserOrders.bind(orderController);
const getUserOrderDetails = orderController.getUserOrderDetails.bind(orderController);
const downloadInvoice = orderController.downloadInvoice.bind(orderController);
const cancelProduct = orderController.cancelProduct.bind(orderController);
const returnProduct = orderController.returnProduct.bind(orderController);
const getAdminOrders = orderController.getAdminOrders.bind(orderController);
const changeProductStatus = orderController.changeProductStatus.bind(orderController);
const changeOrderStatus = orderController.changeOrderStatus.bind(orderController);
const getAdminOrderDetails = orderController.getAdminOrderDetails.bind(orderController);
const getAdminOrderView = orderController.getAdminOrderView.bind(orderController);
const getAdminOrderDetailsJson = orderController.getAdminOrderDetailsJson.bind(orderController);
const approveReturn = orderController.approveReturn.bind(orderController);
const getSalesReport = orderController.getSalesReport.bind(orderController);
const generateSalesReport = orderController.generateSalesReport.bind(orderController);
const downloadSalesReportPdf = orderController.downloadSalesReportPdf.bind(orderController);
const downloadSalesReportExcel = orderController.downloadSalesReportExcel.bind(orderController);

export {
  checkoutPage,
  applyCoupon,
  confirmOrder,
  createRazorpayOrder,
  confirmRazorpayPayment,
  getOrderSuccessPage,
  getUserOrders,
  getUserOrderDetails,
  downloadInvoice,
  cancelProduct,
  returnProduct,
  getAdminOrders,
  changeProductStatus,
  changeOrderStatus,
  getAdminOrderDetails,
  getAdminOrderView,
  getAdminOrderDetailsJson,
  approveReturn,
  getSalesReport,
  generateSalesReport,
  downloadSalesReportPdf,
  downloadSalesReportExcel
};
