const express = require('express');
const router = express.Router();
const refundController = require('../controllers/refund.controller');
const auth = require('../middleware/auth.middleware');
const restrictTo = require('../middleware/role.middleware');

// Keep public / simple ones here if any ..

router.use(auth); // Require login

// Vendor routes
router.post('/request', restrictTo('VENDOR'), refundController.requestRefund);
router.get('/my-refunds', restrictTo('VENDOR'), refundController.getMyRefunds);

// Admin routes
router.get('/admin/all', restrictTo('ADMIN'), refundController.getAllRefunds);
router.patch('/admin/:id', restrictTo('ADMIN'), refundController.updateRefundStatus);

module.exports = router;
