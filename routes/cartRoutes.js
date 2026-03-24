import express from 'express';
const router = express.Router();
import * as cartController from '../controller/cartController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.get('/cart', userAuthenticated, cartController.getCart);
router.post('/cart/add', userAuthenticated, cartController.addToCart);
router.delete('/cart/remove', userAuthenticated, cartController.removeFromCart);
router.put('/cart/update', userAuthenticated, cartController.updateQuantity);

export default router;
