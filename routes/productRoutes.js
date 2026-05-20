import express from 'express';
const router = express.Router();
import * as controller from '../controller/productController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import { productUpload } from '../middleware/upload.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', isAuthenticated, asyncHandler(controller.getProducts));
router.get('/add', isAuthenticated, asyncHandler(controller.getAddProduct));
router.get('/edit/:id', isAuthenticated, asyncHandler(controller.getEditProduct));
router.get('/:id/view', isAuthenticated, asyncHandler(controller.getProductView));
router.post('/add', isAuthenticated, productUpload.any(), asyncHandler(controller.addProduct));
router.post('/edit/:id', isAuthenticated, productUpload.any(), asyncHandler(controller.editProduct));
router.post('/toggle-list/:id', isAuthenticated, asyncHandler(controller.toggleProductStatus));

export default router;
