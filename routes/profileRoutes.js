import express from 'express';
const router = express.Router();
import * as profileController from '../controller/profileController.js';
import { userAuthenticated } from '../middleware/authentication.js';

// Base: /profile
router.get('/', userAuthenticated, profileController.getUserProfile);
router.post('/update', userAuthenticated, profileController.updateUserProfile);
router.post('/update-email', userAuthenticated, profileController.updateEmail);
router.post('/update-phone', userAuthenticated, profileController.updatePhoneNumber);
router.post('/change-password', userAuthenticated, profileController.changePassword);

// Address sub-routes (under /profile/address)
router.get('/address', userAuthenticated, profileController.getAddresses);
router.get('/address/add', userAuthenticated, profileController.getAddAddressPage);
router.get('/address/edit/:id', userAuthenticated, profileController.getEditAddressPage);
router.post('/address/add', userAuthenticated, profileController.addAddress);
router.put('/address/edit/:id', userAuthenticated, profileController.editAddress);
router.delete('/address/delete/:id', userAuthenticated, profileController.deleteAddress);

export default router;
