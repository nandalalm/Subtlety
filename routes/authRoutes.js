import express from 'express';
const router = express.Router();
import * as controller from '../controller/authController.js';
import { userAuthenticated } from '../middleware/authentication.js';
import asyncHandler from '../middleware/asyncHandler.js';

router.get('/google', asyncHandler(controller.googleLogin));
router.get('/google/callback', asyncHandler(controller.googleCallback));

router.get('/login', asyncHandler(controller.getLogin));
router.post('/login', asyncHandler(controller.loginUser));
router.get('/signup', asyncHandler(controller.getSignup));
router.post('/register', asyncHandler(controller.addUser));
router.post('/verify-otp', asyncHandler(controller.verifyOtp));
router.post('/resend-otp', asyncHandler(controller.resendOtp));
router.post('/logout', userAuthenticated, asyncHandler(controller.logout));

router.get('/forgot-password', asyncHandler(controller.getForgotPassword));
router.post('/forgot-password/send-otp', asyncHandler(controller.sendOtpForPasswordReset));
router.post('/forgot-password/verify-otp', asyncHandler(controller.verifyOtpForPasswordReset));
router.post('/forgot-password/reset', asyncHandler(controller.resetPassword));
router.post('/forgot-password/resend-otp', asyncHandler(controller.resendPasswordResetOtp));

export default router;
