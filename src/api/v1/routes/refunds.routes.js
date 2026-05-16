const express = require('express');
const router = express.Router();
const refundController = require('../controllers/refund.controller');
const auth = require('../middlewares/auth.middleware');
const permission = require('../middlewares/permission.middleware');

router.use(auth);

// Vendor endpoints
router.post('/request', refundController.requestRefund);
router.get('/me', refundController.getMyRefunds);

// Superadmin endpoints
router.get('/admin/all', permission('VIEW_TRANSACTIONS'), refundController.getAllRefunds);
router.get('/', permission('VIEW_TRANSACTIONS'), refundController.getAllRefunds);
router.patch('/admin/:id', permission('MANAGE_TRANSACTIONS'), refundController.updateRefundStatus);
router.patch('/:id/status', permission('MANAGE_TRANSACTIONS'), refundController.updateRefundStatus);

module.exports = router;
