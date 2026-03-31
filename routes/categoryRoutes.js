import express from 'express';
const router = express.Router();
import * as controller from '../controller/categoryController.js';
import { isAuthenticated } from '../middleware/authentication.js';

router.get('/', isAuthenticated, controller.getCategories);
router.get('/add', isAuthenticated, controller.getAddCategoryPage);
router.get('/edit/:id', isAuthenticated, controller.getEditCategoryPage);
router.post('/add', isAuthenticated, controller.categoryUpload.single('image'), controller.addCategory);
router.post('/edit/:id', isAuthenticated, controller.categoryUpload.single('image'), controller.editCategory);
router.post('/toggle-status/:id', isAuthenticated, controller.toggleCategoryStatus);

export default router;
