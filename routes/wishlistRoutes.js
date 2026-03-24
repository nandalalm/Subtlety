import express from 'express';
const router = express.Router();
import * as wishlistController from '../controller/wishlistController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.get('/wishlist', userAuthenticated, wishlistController.getWishlist);
router.post('/add-to-wishlist', userAuthenticated, wishlistController.addToWishlist);
router.delete('/wishlist/remove/:productId', userAuthenticated, wishlistController.deleteFromWishlist);

export default router;
