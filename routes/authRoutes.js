import express from 'express';
const router = express.Router();
import passport from 'passport';
import * as controller from '../controller/authController.js';
import { userAuthenticated } from '../middleware/authentication.js';

router.get('/google', (req, res, next) => {
    const safeReturnTo = controller.getSafeReturnTo(req.query.returnTo || req.session.returnTo);
    if (safeReturnTo) {
        req.session.returnTo = safeReturnTo;
    }
    
    req.session.save((saveError) => {
        if (saveError) return next(saveError);
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            prompt: 'select_account',
            state: safeReturnTo || ''
        })(req, res, next);
    });
});

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            if (info && info.message === 'User is blocked') {
                req.session.errorMessage = "Your account has been blocked. Please contact support.";
                return res.redirect('/auth/login');
            }
            return res.redirect('/');
        }
        if (user.isBlocked) {
            req.session.errorMessage = "Your account has been blocked. Please contact support.";
            return res.redirect('/auth/login');
        }
        req.logIn(user, (err) => {
            if (err) return next(err);
            req.session.user = user;
            const redirectTo =
                controller.getSafeReturnTo(req.query.state) ||
                controller.getSafeReturnTo(req.session.returnTo) ||
                '/user/home';
            delete req.session.returnTo;
            req.session.save((saveError) => {
                if (saveError) return next(saveError);
                return res.redirect(redirectTo);
            });
        });
    })(req, res, next);
});

// User Auth
router.get('/login', controller.getLogin);
router.post('/login', controller.loginUser);
router.get('/signup', controller.getSignup);
router.post('/register', controller.addUser);
router.post('/verify-otp', controller.verifyOtp);
router.post('/resend-otp', controller.resendOtp);
router.post('/logout', userAuthenticated, controller.logout);

// Forgot Password
router.get('/forgot-password', controller.getForgotPassword);
router.post('/forgot-password/send-otp', controller.sendOtpForPasswordReset);
router.post('/forgot-password/verify-otp', controller.verifyOtpForPasswordReset);
router.post('/forgot-password/reset', controller.resetPassword);
router.post('/forgot-password/resend-otp', controller.resendPasswordResetOtp);

export default router;
