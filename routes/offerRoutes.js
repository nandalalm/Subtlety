import express from 'express';
const router = express.Router();
import * as offerController from '../controller/offerController.js';
import { isAuthenticated } from '../middleware/authentication.js';

// Base: /admin/offers

// Offer Management
router.get('/', isAuthenticated, offerController.getOffers);
router.post('/add', isAuthenticated, offerController.addOffer);
router.post('/edit/:id', isAuthenticated, offerController.editOffer);
router.post('/toggle-status/:id', isAuthenticated, offerController.toggleOfferStatus);

// Coupon Management (under /admin/offers/coupons)
router.get('/coupons', isAuthenticated, offerController.getCoupons);
router.post('/coupons/add', isAuthenticated, offerController.addCoupon);
router.put('/coupons/:id', isAuthenticated, offerController.editCoupon);
router.post('/coupons/toggle-status/:id', isAuthenticated, offerController.toggleCouponStatus);

export default router;
