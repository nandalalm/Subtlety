import express from 'express';
const router = express.Router();
import * as profileController from '../controller/profileController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/', userAuthenticated, asyncHandler(profileController.getUserProfile));
router.post('/update', userAuthenticated, asyncHandler(profileController.updateUserProfile));
router.post('/update-email', userAuthenticated, asyncHandler(profileController.updateEmail));
router.post('/update-phone', userAuthenticated, asyncHandler(profileController.updatePhoneNumber));
router.post('/change-password', userAuthenticated, asyncHandler(profileController.changePassword));

router.get('/address', userAuthenticated, asyncHandler(profileController.getAddresses));
router.get('/address/add', userAuthenticated, asyncHandler(profileController.getAddAddressPage));
router.get('/address/edit/:id', userAuthenticated, asyncHandler(profileController.getEditAddressPage));
router.post('/address/add', userAuthenticated, asyncHandler(profileController.addAddress));
router.put('/address/edit/:id', userAuthenticated, asyncHandler(profileController.editAddress));
router.delete('/address/delete/:id', userAuthenticated, asyncHandler(profileController.deleteAddress));

export default router;
