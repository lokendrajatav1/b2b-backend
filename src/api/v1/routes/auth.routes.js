const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authValidation = require('../validators/auth.validation');
const validate = require('../middlewares/validate.middleware');
const auth = require('../middlewares/auth.middleware');

router.post('/register', validate(authValidation.register), authController.register);
router.post('/login', validate(authValidation.login), authController.login);
router.post('/request-otp', validate(authValidation.requestOTP), authController.requestOTP);
router.post('/request-email-otp', validate(authValidation.requestEmailOTP), authController.requestEmailOTP);
router.post('/verify-otp-login', authController.verifyOTPLogin);

router.post('/forgot-password', validate(authValidation.forgotPassword), authController.forgotPassword);
router.post('/reset-password/:token', validate(authValidation.resetPassword), authController.resetPassword);

router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

router.get('/me', auth, authController.getMe);
router.patch('/profile', auth, authController.updateProfile);

module.exports = router;
