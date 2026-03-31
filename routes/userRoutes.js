import express from 'express';
const router = express.Router();
import * as controller from '../controller/userController.js';

router.get('/home', controller.getHome);
router.get('/single-product/:id', controller.getSingleProduct);
router.get('/related-products/load-more', controller.loadMoreRelatedProducts);
router.get('/section-product/replacement', controller.getSectionReplacement);
router.get('/shop', controller.getShopPage);
router.get('/shop/load-more', controller.loadMoreProducts);

export default router;
