const express = require('express');
const router = express.Router();
const prisma = require('../../../config/prisma');
const auth = require('../middlewares/auth.middleware');
const catchAsync = require('../../../shared/helpers/catch-async');
const ApiResponse = require('../../../shared/helpers/api-response');
const paymentsController = require('../controllers/payments.controller');

router.get('/history', auth, catchAsync(async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' }
  });
  res.status(200).json(new ApiResponse(200, payments));
}));

router.post('/create-order', auth, paymentsController.createOrder);
router.post('/verify', auth, paymentsController.verifyPayment);
router.post('/free-activate', auth, paymentsController.freeActivate);

module.exports = router;

