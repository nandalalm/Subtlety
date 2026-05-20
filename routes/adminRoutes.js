import express from 'express';
const router = express.Router();
import * as controller from '../controller/adminController.js';
import * as authController from '../controller/authController.js';
import { isAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/login', asyncHandler(authController.getAdminLogin));
router.post('/login', asyncHandler(authController.loginadmin));
router.post('/logout', isAuthenticated, asyncHandler(authController.adminLogout));

router.get('/dashboard', isAuthenticated, asyncHandler(controller.getHome));
router.get('/users', isAuthenticated, asyncHandler(controller.getUsers));
router.post('/users/toggle-status/:id', isAuthenticated, asyncHandler(controller.toggleUserStatus));

export default router;
