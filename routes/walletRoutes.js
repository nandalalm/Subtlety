import express from 'express';
const router = express.Router();
import * as profileController from '../controller/profileController.js';
import { userAuthenticated } from '../middleware/authentication.js';

// Base: /wallet
router.get('/', userAuthenticated, profileController.getWallet);
router.get('/balance', userAuthenticated, profileController.getWalletBalance);
router.post('/deduct', userAuthenticated, profileController.deductWalletAmount);

export default router;
