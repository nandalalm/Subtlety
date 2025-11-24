const router = require('express').Router();
const passport = require('passport');

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


module.exports = router;
