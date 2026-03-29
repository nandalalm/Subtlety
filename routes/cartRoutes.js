import express from 'express';
const router = express.Router();
import * as cartController from '../controller/cartController.js';
import { userAuthenticated } from '../middleware/authentication.js';

// Base: /cart
router.get('/', userAuthenticated, cartController.getCart);
router.post('/add', userAuthenticated, cartController.addToCart);
router.delete('/remove', userAuthenticated, cartController.removeFromCart);
router.put('/update', userAuthenticated, cartController.updateQuantity);

export default router;
