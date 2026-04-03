const express = require('express');
const paymentController = require('../controllers/payment.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');

const router = express.Router();

router.use(auth);
router.use(restrictTo('VENDOR'));

router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPayment);

module.exports = router;
