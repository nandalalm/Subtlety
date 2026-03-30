import express from 'express';
const router = express.Router();
import * as offerController from '../controller/offerController.js';
import { isAuthenticated } from '../middleware/authentication.js';

// Base: /admin/offers

// Offer Management
router.get('/', isAuthenticated, offerController.getOffers);
router.get('/add', isAuthenticated, offerController.getAddOfferPage);
router.get('/edit/:id', isAuthenticated, offerController.getEditOfferPage);
router.get('/search-targets', isAuthenticated, offerController.searchOfferTargets);
router.get('/:id/view', isAuthenticated, offerController.getOfferView);
router.post('/add', isAuthenticated, offerController.addOffer);
router.post('/edit/:id', isAuthenticated, offerController.editOffer);
router.post('/toggle-status/:id', isAuthenticated, offerController.toggleOfferStatus);

// Coupon Management (under /admin/offers/coupons)
router.get('/coupons', isAuthenticated, offerController.getCoupons);
router.get('/coupons/add', isAuthenticated, offerController.getAddCouponPage);
router.get('/coupons/edit/:id', isAuthenticated, offerController.getEditCouponPage);
router.get('/coupons/:id/view', isAuthenticated, offerController.getCouponView);
router.post('/coupons/add', isAuthenticated, offerController.addCoupon);
router.put('/coupons/:id', isAuthenticated, offerController.editCoupon);
router.post('/coupons/toggle-status/:id', isAuthenticated, offerController.toggleCouponStatus);

export default router;
