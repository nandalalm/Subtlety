import express from 'express';
const router = express.Router();
import * as controller from '../controller/categoryController.js';
import { isAuthenticated } from '../middleware/authentication.js';

router.get('/categories', isAuthenticated, controller.getCategories);
router.post('/categories/add', isAuthenticated, controller.categoryUpload.single('image'), controller.addCategory);
router.post('/categories/edit/:id', isAuthenticated, controller.categoryUpload.single('image'), controller.editCategory);
router.post('/categories/toggle-status/:id', isAuthenticated, controller.toggleCategoryStatus);

export default router;
