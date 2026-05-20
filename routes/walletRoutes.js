import express from 'express';
const router = express.Router();
import * as profileController from '../controller/profileController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', userAuthenticated, asyncHandler(profileController.getWallet));
router.get('/balance', userAuthenticated, asyncHandler(profileController.getWalletBalance));
router.post('/deduct', userAuthenticated, asyncHandler(profileController.deductWalletAmount));

export default router;
