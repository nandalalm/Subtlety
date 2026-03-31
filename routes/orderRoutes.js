import express from "express";
const router = express.Router();
import * as controller from "../controller/orderController.js";
import { userAuthenticated } from "../middleware/authentication.js";

router.get('/checkout', userAuthenticated, controller.checkoutPage);
router.post('/checkout/confirm', userAuthenticated, controller.confirmOrder);
router.post('/checkout/apply-coupon', userAuthenticated, controller.applyCoupon);
router.post('/razorpay/create', userAuthenticated, controller.createRazorpayOrder);
router.post('/razorpay/confirm', userAuthenticated, controller.confirmRazorpayPayment);
router.get('/success', userAuthenticated, controller.getOrderSuccessPage);
router.get('/', userAuthenticated, controller.getUserOrders);
router.get('/:id', userAuthenticated, controller.getUserOrderDetails);
router.get('/:id/invoice', userAuthenticated, controller.downloadInvoice);
router.post('/:id/cancel/:productId', userAuthenticated, controller.cancelProduct);
router.post('/:id/return/:productId', userAuthenticated, controller.returnProduct);

export default router;
