import express from 'express';
const router = express.Router();
import * as controller from '../controller/categoryController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import { categoryUpload } from '../middleware/upload.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', isAuthenticated, asyncHandler(controller.getCategories));
router.get('/add', isAuthenticated, asyncHandler(controller.getAddCategoryPage));
router.get('/edit/:id', isAuthenticated, asyncHandler(controller.getEditCategoryPage));
router.post('/add', isAuthenticated, categoryUpload.single('image'), asyncHandler(controller.addCategory));
router.post('/edit/:id', isAuthenticated, categoryUpload.single('image'), asyncHandler(controller.editCategory));
router.post('/toggle-status/:id', isAuthenticated, asyncHandler(controller.toggleCategoryStatus));

export default router;
