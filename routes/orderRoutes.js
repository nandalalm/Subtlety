import express from "express";
const router = express.Router();
import * as controller from "../controller/orderController.js";
import { userAuthenticated } from "../middleware/authentication.js";
import asyncHandler from "../middleware/asyncHandler.js";

router.get('/checkout', userAuthenticated, asyncHandler(controller.checkoutPage));
router.post('/checkout/confirm', userAuthenticated, asyncHandler(controller.confirmOrder));
router.post('/checkout/apply-coupon', userAuthenticated, asyncHandler(controller.applyCoupon));
router.post('/razorpay/create', userAuthenticated, asyncHandler(controller.createRazorpayOrder));
router.post('/razorpay/confirm', userAuthenticated, asyncHandler(controller.confirmRazorpayPayment));
router.get('/success', userAuthenticated, asyncHandler(controller.getOrderSuccessPage));
router.get('/', userAuthenticated, asyncHandler(controller.getUserOrders));
router.get('/:id', userAuthenticated, asyncHandler(controller.getUserOrderDetails));
router.get('/:id/invoice', userAuthenticated, asyncHandler(controller.downloadInvoice));
router.post('/:id/cancel/:productId', userAuthenticated, asyncHandler(controller.cancelProduct));
router.post('/:id/return/:productId', userAuthenticated, asyncHandler(controller.returnProduct));

export default router;
