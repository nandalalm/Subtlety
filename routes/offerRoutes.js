import express from 'express';
const router = express.Router();
import * as offerController from '../controller/offerController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', isAuthenticated, asyncHandler(offerController.getOffers));
router.get('/add', isAuthenticated, asyncHandler(offerController.getAddOfferPage));
router.get('/edit/:id', isAuthenticated, asyncHandler(offerController.getEditOfferPage));
router.get('/search-targets', isAuthenticated, asyncHandler(offerController.searchOfferTargets));
router.get('/:id/view', isAuthenticated, asyncHandler(offerController.getOfferView));
router.post('/add', isAuthenticated, asyncHandler(offerController.addOffer));
router.post('/edit/:id', isAuthenticated, asyncHandler(offerController.editOffer));
router.post('/toggle-status/:id', isAuthenticated, asyncHandler(offerController.toggleOfferStatus));

router.get('/coupons', isAuthenticated, asyncHandler(offerController.getCoupons));
router.get('/coupons/add', isAuthenticated, asyncHandler(offerController.getAddCouponPage));
router.get('/coupons/edit/:id', isAuthenticated, asyncHandler(offerController.getEditCouponPage));
router.get('/coupons/:id/view', isAuthenticated, asyncHandler(offerController.getCouponView));
router.post('/coupons/add', isAuthenticated, asyncHandler(offerController.addCoupon));
router.put('/coupons/:id', isAuthenticated, asyncHandler(offerController.editCoupon));
router.post('/coupons/toggle-status/:id', isAuthenticated, asyncHandler(offerController.toggleCouponStatus));

export default router;
