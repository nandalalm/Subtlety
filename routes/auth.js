const router = require('express').Router();
const passport = require('passport');
const User = require('../model/user'); 

// Auth Routes for Google Signup
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account' 
}));

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', async (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            // Check if there is an info message about the user being blocked
            if (info && info.message === 'User is blocked') {
                req.session.errorMessage = "Your account has been blocked. Please contact support.";
                return res.redirect('/user/login'); // Redirect to login page
            }
            return res.redirect('/'); // Redirect to home on other failures
        }

        // User is authenticated, check if they are blocked
        if (user.isBlocked) {
            req.session.errorMessage = "Your account has been blocked. Please contact support.";
            return res.redirect('/user/login'); // Redirect to login if blocked
        }

        // Log in the user
        req.logIn(user, (err) => {
            if (err) {
                return next(err);
            }
            req.session.user = user;
            return res.redirect('/user/home'); // Redirect to home after login
        });
    })(req, res, next);
});


module.exports = router;
