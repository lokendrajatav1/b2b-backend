const express = require('express');
const notificationController = require('../controllers/notification.controller');
const auth = require('../middleware/auth.middleware');

const router = express.Router();

router.use(auth); // All notification routes require login

router.get('/', notificationController.getMyNotifications);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
