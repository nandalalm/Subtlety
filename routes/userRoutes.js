import express from 'express';
const router = express.Router();
import * as controller from '../controller/userController.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/home', asyncHandler(controller.getHome));
router.get('/single-product/:id', asyncHandler(controller.getSingleProduct));
router.get('/product-availability/:id', asyncHandler(controller.getProductAvailability));
router.get('/related-products/load-more', asyncHandler(controller.loadMoreRelatedProducts));
router.get('/section-product/replacement', asyncHandler(controller.getSectionReplacement));
router.get('/shop', asyncHandler(controller.getShopPage));
router.get('/shop/load-more', asyncHandler(controller.loadMoreProducts));

export default router;
