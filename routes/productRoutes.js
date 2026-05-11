import express from 'express';
const router = express.Router();
import * as controller from '../controller/productController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import { productUpload } from '../middleware/upload.js';

router.get('/', isAuthenticated, controller.getProducts);
router.get('/add', isAuthenticated, controller.getAddProduct);
router.get('/edit/:id', isAuthenticated, controller.getEditProduct);
router.get('/:id/view', isAuthenticated, controller.getProductView);
router.post('/add', isAuthenticated, productUpload.any(), controller.addProduct);
router.post('/edit/:id', isAuthenticated, productUpload.any(), controller.editProduct);
router.post('/toggle-list/:id', isAuthenticated, controller.toggleProductStatus);

export default router;
