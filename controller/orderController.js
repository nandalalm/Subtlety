import orderService from "../services/orderService.js";
import HTTP_STATUS from "../Constants/httpStatus.js";
import MESSAGES from "../Constants/messages.js";
import { 
  generateInvoicePdf, 
  generateSalesReportPdf, 
  generateSalesReportExcel 
} from "../utils/reportHelper.js";

async function checkoutPage(req, res, next) {
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

async function applyCoupon(req, res, next) {
  let checkoutData = null;
  try {
    const { couponCode } = req.body;
    const userId = req.session.user?._id;
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });

    // Get current checkout data to have the correct base total
    checkoutData = await orderService.getCheckoutData(userId);
    if (checkoutData.validationIssues && checkoutData.validationIssues.length > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: checkoutData.message,
        errors: checkoutData.validationIssues,
        cartState: checkoutData.cartState
      });
    }
    const netTotalBeforeCoupon = checkoutData.totalAmount;

    // Validate the coupon against the net total (after offer discounts and delivery)
    const result = await orderService.validateCoupon(userId, couponCode, netTotalBeforeCoupon);
    
    // Calculate final total
    const couponDiscount = Math.floor(result.discount);
    const finalTotal = Math.floor(netTotalBeforeCoupon - couponDiscount);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      subtotal: checkoutData.subtotal,
      offerDiscount: checkoutData.offerDiscount,
      couponDiscount: couponDiscount,
      deliveryCharge: checkoutData.deliveryCharge,
      totalAmount: finalTotal,
      couponState: result.couponState
        ? {
            ...result.couponState,
            totals: {
              subtotal: checkoutData.subtotal,
              offerDiscount: checkoutData.offerDiscount,
              couponDiscount,
              deliveryCharge: checkoutData.deliveryCharge,
              totalAmount: finalTotal
            }
          }
        : null
    });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.BAD_REQUEST) {
      return res.status(error.statusCode).json({
        message: error.message,
        errors: error.errors,
        cartState: error.cartState,
        couponState: error.couponState && checkoutData
          ? {
              ...error.couponState,
              totals: {
                subtotal: checkoutData.subtotal,
                offerDiscount: checkoutData.offerDiscount,
                couponDiscount: error.couponState.discount || 0,
                deliveryCharge: checkoutData.deliveryCharge,
                totalAmount: Math.floor((checkoutData.totalAmount || 0) - (error.couponState.discount || 0))
              }
            }
          : error.couponState || null
      });
    }
    next(error);
  }
}

async function confirmOrder(req, res, next) {
  try {
    const userId = req.session.user?._id;
    if (!userId) return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: MESSAGES.ORDER.USER_NOT_AUTHENTICATED });

    const orderData = {
        ...req.body,
        items: req.body.items,
        totalAmount: req.body.totalAmount,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        couponCode: req.body.couponCode
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

async function createRazorpayOrder(req, res, next) {
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

async function confirmRazorpayPayment(req, res, next) {
  try {
    const { orderId } = req.body;
    await orderService.confirmRazorpayPayment(orderId);
    res.status(HTTP_STATUS.OK).json({ message: MESSAGES.ORDER.PAYMENT_CONFIRMED });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: error.message });
    next(error);
  }
}

async function getOrderSuccessPage(req, res, next) {
  try {
    const { orderId } = req.query;
    const order = await orderService.getOrderDetail(req.session.user._id, orderId);
    res.render("user/orderSuccess", { order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(HTTP_STATUS.NOT_FOUND).send(error.message);
    next(error);
  }
}

async function getUserOrders(req, res, next) {
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

async function getUserOrderDetails(req, res, next) {
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

async function downloadInvoice(req, res, next) {
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

async function cancelProduct(req, res, next) {
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

async function returnProduct(req, res, next) {
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

// --- ADMIN SIDE FUNCTIONS ---

async function getAdminOrders(req, res, next) {
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

async function changeProductStatus(req, res, next) {
  try {
    const { orderId, productId, status } = req.body;
    await orderService.changeItemStatus(orderId, productId, status);
    res.json({ success: true });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async function changeOrderStatus(req, res, next) {
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

async function getAdminOrderDetails(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(null, orderId, true);
    res.json({ order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ message: error.message });
    next(error);
  }
}

async function getAdminOrderView(req, res, next) {
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

async function getAdminOrderDetailsJson(req, res, next) {
  try {
    const orderId = req.params.id;
    const order = await orderService.getOrderDetail(null, orderId, true);
    res.json({ success: true, order });
  } catch (error) {
    if (error.statusCode === HTTP_STATUS.NOT_FOUND) return res.status(error.statusCode).json({ success: false, message: error.message });
    next(error);
  }
}

async function approveReturn(req, res, next) {
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

async function getSalesReport(req, res, next) {
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
      return res.render("partials/Admin/salesTable", viewData);
    }

    res.render("admin/salesReport", viewData);
  } catch (error) {
    next(error);
  }
}

async function generateSalesReport(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null }); // Get all for JSON
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

async function downloadSalesReportPdf(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null });
    generateSalesReportPdf(res, data.orders);
  } catch (error) {
    next(error);
  }
}

async function downloadSalesReportExcel(req, res, next) {
  try {
    const data = await orderService.getSalesReportData({ ...req.body, page: null });
    await generateSalesReportExcel(res, data.orders);
  } catch (error) {
    next(error);
  }
}

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
  downloadSalesReportExcel,
};
