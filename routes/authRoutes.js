import express from 'express';
const router = express.Router();
import * as controller from '../controller/authController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.get('/google', controller.googleLogin);
router.get('/google/callback', controller.googleCallback);

router.get('/login', controller.getLogin);
router.post('/login', controller.loginUser);
router.get('/signup', controller.getSignup);
router.post('/register', controller.addUser);
router.post('/verify-otp', controller.verifyOtp);
router.post('/resend-otp', controller.resendOtp);
router.post('/logout', userAuthenticated, controller.logout);

router.get('/forgot-password', controller.getForgotPassword);
router.post('/forgot-password/send-otp', controller.sendOtpForPasswordReset);
router.post('/forgot-password/verify-otp', controller.verifyOtpForPasswordReset);
router.post('/forgot-password/reset', controller.resetPassword);
router.post('/forgot-password/resend-otp', controller.resendPasswordResetOtp);

export default router;
