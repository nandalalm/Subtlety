import express from 'express';
const router = express.Router();
import * as profileController from '../controller/profileController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.get('/profile', userAuthenticated, profileController.getUserProfile);
router.post('/profile/update', userAuthenticated, profileController.updateUserProfile);
router.post('/profile/update-email', userAuthenticated, profileController.updateEmail);
router.post('/profile/update-phone', userAuthenticated, profileController.updatePhoneNumber);
router.get('/address', userAuthenticated, profileController.getAddresses);
router.post('/address/add', userAuthenticated, profileController.addAddress);
router.put('/address/edit/:id', userAuthenticated, profileController.editAddress);
router.delete('/address/delete/:id', userAuthenticated, profileController.deleteAddress);
router.post('/profile/change-password', userAuthenticated, profileController.changePassword);
router.get('/get-wallet-balance', userAuthenticated, profileController.getWalletBalance);
router.post('/deduct-wallet-amount', userAuthenticated, profileController.deductWalletAmount);
router.get('/wallet', userAuthenticated, profileController.getWallet);

export default router;
