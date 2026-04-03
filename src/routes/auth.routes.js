const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/auth.controller');
const validate = require('../middleware/validate.middleware');
const { authValidation } = require('../validations/schema');
const auth = require('../middleware/auth.middleware');
const twoFactorController = require('../controllers/twoFactor.controller');

const router = express.Router();

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.get('/me', auth, authController.getMe);

// Mobile & Email OTP Routes
router.post('/request-otp', validate(authValidation.requestOTP), authController.requestOTP);
router.post('/request-email-otp', validate(authValidation.requestEmailOTP), authController.requestEmailOTP);
router.post('/verify-otp', authController.verifyOTPLogin);

// 2FA Routes
router.post('/2fa/verify', twoFactorController.validate2FAToken); // Public during login
router.post('/2fa/setup', auth, twoFactorController.setup2FA); // Requires login
router.post('/2fa/enable', auth, twoFactorController.verifyAndEnable2FA); // Requires login

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    // Generate JWT token on successful social login
    const token = jwt.sign(
      { id: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Redirect to frontend with token (adjust frontend URL as needed)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth-success?token=${token}`);
  }
);

module.exports = router;
