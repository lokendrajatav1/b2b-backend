const express = require('express');
const router = express.Router();
const prisma = require('../../../config/prisma');
const auth = require('../middlewares/auth.middleware');
const catchAsync = require('../../../shared/helpers/catch-async');
const ApiResponse = require('../../../shared/helpers/api-response');

router.get('/', auth, catchAsync(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  res.status(200).json(new ApiResponse(200, notifications));
}));

router.patch('/:id/read', auth, catchAsync(async (req, res) => {
  await prisma.notification.update({
    where: { id: req.params.id, userId: req.user.id },
    data: { isRead: true }
  });
  res.status(200).json(new ApiResponse(200, null, "Marked as read"));
}));

module.exports = router;
