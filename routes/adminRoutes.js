import express from 'express';
const router = express.Router();
import * as controller from '../controller/adminController.js';
import { isAuthenticated } from '../middleware/authentication.js';

router.get('/dashboard', isAuthenticated, controller.getHome);
router.get('/users', isAuthenticated, controller.getUsers);
router.post('/users/toggle-status/:id', isAuthenticated, controller.toggleUserStatus);

export default router;
