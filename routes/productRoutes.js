import express from 'express';
const router = express.Router();
import * as controller from '../controller/productController.js';
import { isAuthenticated } from '../middleware/authentication.js';

// Base: /admin/products
router.get('/', isAuthenticated, controller.getProducts);
router.get('/add', isAuthenticated, controller.getAddProduct);
router.get('/edit/:id', isAuthenticated, controller.getEditProduct);
router.post('/add', isAuthenticated, controller.productUpload.any(), controller.addProduct);
router.post('/edit/:id', isAuthenticated, controller.productUpload.any(), controller.editProduct);
router.post('/toggle-list/:id', isAuthenticated, controller.toggleProductStatus);

export default router;
