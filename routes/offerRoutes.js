import express from 'express';
const router = express.Router();
import * as offerController from '../controller/offerController.js';
import { isAuthenticated } from '../middleware/authentication.js';

// Offer Management
router.get('/offer', isAuthenticated, offerController.getOffers);
router.post('/offers/add', isAuthenticated, offerController.addOffer);
router.post('/offers/edit/:id', isAuthenticated, offerController.editOffer);
router.post('/offers/toggle-status/:id', isAuthenticated, offerController.toggleOfferStatus);

// Coupon Management
router.get('/coupons', isAuthenticated, offerController.getCoupons);
router.post('/coupons/add', isAuthenticated, offerController.addCoupon);
router.put('/coupons/:id', isAuthenticated, offerController.editCoupon);
router.post('/coupons/toggle-status/:id', isAuthenticated, offerController.toggleCouponStatus);

export default router;
