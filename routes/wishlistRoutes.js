import express from 'express';
const router = express.Router();
import * as wishlistController from '../controller/wishlistController.js';
import { userAuthenticated } from '../middleware/authentication.js';

// Base: /wishlist
router.get('/', userAuthenticated, wishlistController.getWishlist);
router.post('/add', userAuthenticated, wishlistController.addToWishlist);
router.delete('/remove/:productId', userAuthenticated, wishlistController.deleteFromWishlist);

export default router;
