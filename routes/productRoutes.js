import express from 'express';
const router = express.Router();
import * as controller from '../controller/productController.js';
import { isAuthenticated } from '../middleware/authentication.js';

router.get('/products', isAuthenticated, controller.getProducts);
router.get('/products/add', isAuthenticated, controller.getAddProduct);
router.get('/products/edit/:id', isAuthenticated, controller.getEditProduct);
router.post('/products/add', isAuthenticated, controller.productUpload.any(), controller.addProduct);
router.post('/products/edit/:id', isAuthenticated, controller.productUpload.any(), controller.editProduct);
router.post('/products/toggle-list/:id', isAuthenticated, controller.toggleProductStatus);

export default router;
