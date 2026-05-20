import express from 'express';
const router = express.Router();
import * as wishlistController from '../controller/wishlistController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', userAuthenticated, asyncHandler(wishlistController.getWishlist));
router.post('/add', userAuthenticated, asyncHandler(wishlistController.addToWishlist));
router.delete('/remove/:productId', userAuthenticated, asyncHandler(wishlistController.deleteFromWishlist));

export default router;
