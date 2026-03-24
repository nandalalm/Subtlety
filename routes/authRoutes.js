import express from 'express';
const router = express.Router();
import passport from 'passport';
import * as controller from '../controller/authController.js';
import { isAuthenticated, userAuthenticated } from '../middleware/authentication.js';

// Google Auth
router.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account' 
}));

router.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            if (info && info.message === 'User is blocked') {
                req.session.errorMessage = "Your account has been blocked. Please contact support.";
                return res.redirect('/user/login');
            }
            return res.redirect('/');
        }

        if (user.isBlocked) {
            req.session.errorMessage = "Your account has been blocked. Please contact support.";
            return res.redirect('/user/login'); 
        }

        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            req.session.user = user;
            return res.redirect('/user/home'); 
        });
    })(req, res, next);
});

// User Auth
router.get('/user/login', controller.getLogin);
router.post('/user/login', controller.loginUser);
router.get('/user/signup', controller.getSignup);
router.post('/user/register', controller.addUser);
router.post('/user/verify-otp', controller.verifyOtp);
router.post('/user/resend-otp', controller.resendOtp);
router.post('/user/logout', userAuthenticated, controller.logout);

// Forgot Password
router.get('/user/forgot-password', controller.getForgotPassword);
router.post('/user/send-otp-password-reset', controller.sendOtpForPasswordReset);
router.post('/user/verify-otp-password-reset', controller.verifyOtpForPasswordReset);
router.post('/user/reset-password', controller.resetPassword);
router.post('/user/resend-otp-password-reset', controller.resendPasswordResetOtp);

// Admin Auth
router.get('/admin/login', controller.getAdminLogin);
router.post('/admin/login', controller.loginadmin);
router.post('/admin/logout', isAuthenticated, controller.adminLogout);

export default router;
