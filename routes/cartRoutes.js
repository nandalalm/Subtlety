import express from 'express';
const router = express.Router();
import * as cartController from '../controller/cartController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', userAuthenticated, asyncHandler(cartController.getCart));
router.post('/add', userAuthenticated, asyncHandler(cartController.addToCart));
router.delete('/remove', userAuthenticated, asyncHandler(cartController.removeFromCart));
router.put('/update', userAuthenticated, asyncHandler(cartController.updateQuantity));

export default router;
