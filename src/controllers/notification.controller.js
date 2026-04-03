const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Get all notifications for the logged-in user
 */
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(new ApiResponse(200, notifications));
});

/**
 * Mark a specific notification as read
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const notification = await prisma.notification.update({
    where: { 
        id,
        userId: req.user.id // Ensure user owns the notification
    },
    data: { isRead: true },
  });

  res.status(200).json(new ApiResponse(200, notification, "Notification marked as read"));
});

/**
 * Mark all user notifications as read
 */
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await prisma.notification.updateMany({
    where: { 
        userId: req.user.id,
        isRead: false 
    },
    data: { isRead: true },
  });

  res.status(200).json(new ApiResponse(200, null, "All notifications marked as read"));
});

/**
 * Delete a specific notification
 */
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  await prisma.notification.delete({
    where: { 
        id,
        userId: req.user.id 
    },
  });

  res.status(200).json(new ApiResponse(200, null, "Notification removed permanently"));
});
