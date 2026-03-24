import express from "express";
const router = express.Router();
import * as controller from "../controller/orderController.js";
import {
  userAuthenticated,
  isAuthenticated,
} from "../middleware/authentication.js";

// --- USER ORDER ROUTES ---
router.get("/user/checkout", userAuthenticated, controller.checkoutPage);
router.post(
  "/user/checkout/confirm-order",
  userAuthenticated,
  controller.confirmOrder
);
router.post(
  "/user/create-razorpay-order",
  userAuthenticated,
  controller.createRazorpayOrder
);
router.post(
  "/user/razorpay-confirm",
  userAuthenticated,
  controller.confirmRazorpayPayment
);
router.post(
  "/user/checkout/apply-coupon",
  userAuthenticated,
  controller.applyCoupon
);
router.get(
  "/user/order-success",
  userAuthenticated,
  controller.getOrderSuccessPage
);
router.get("/user/orders", userAuthenticated, controller.getUserOrders);
router.get("/user/order/:id", userAuthenticated, controller.getUserOrderDetails);
router.get(
  "/user/order/invoice/:id",
  userAuthenticated,
  controller.downloadInvoice
);
router.post(
  "/user/orders/cancel/:id/:productId",
  userAuthenticated,
  controller.cancelProduct
);
router.post(
  "/user/orders/return/:id/:productId",
  userAuthenticated,
  controller.returnProduct
);

// --- ADMIN ORDER ROUTES ---
router.get("/admin/orderList", isAuthenticated, controller.getAdminOrders);
router.post(
  "/admin/order/changeProductStatus",
  isAuthenticated,
  controller.changeProductStatus
);
router.post(
  "/admin/order/changeOrderStatus",
  isAuthenticated,
  controller.changeOrderStatus
);
router.get("/admin/order/:id/view", isAuthenticated, controller.getAdminOrderView);
router.get(
  "/admin/order/:id/details",
  isAuthenticated,
  controller.getAdminOrderDetailsJson
);
router.post(
  "/admin/order/approveReturn",
  isAuthenticated,
  controller.approveReturn
);
router.get("/admin/salesReport", isAuthenticated, controller.getSalesReport);
router.post(
  "/admin/salesReport/generate",
  isAuthenticated,
  controller.generateSalesReport
);
router.post(
  "/admin/salesReport/download/pdf",
  isAuthenticated,
  controller.downloadSalesReportPdf
);
router.post(
  "/admin/salesReport/download/excel",
  isAuthenticated,
  controller.downloadSalesReportExcel
);

export default router;
