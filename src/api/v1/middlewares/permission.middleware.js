const AppError = require('../../../shared/errors/app-error');
const catchAsync = require('../../../shared/helpers/catch-async');
const prisma = require('../../../config/prisma');

module.exports = (permissionName) => {
  return catchAsync(async (req, res, next) => {
    const { id, role } = req.user;

    // 1. Core Admins have all permissions
    if (role === 'SUPERADMIN') return next();

    // 2. Fetch Admin record from database
    const admin = await prisma.admin.findUnique({
      where: { userId: id }
    });

    if (!admin || !admin.isActive) {
      return next(new AppError('Your account is either not an admin or is suspended', 403));
    }

    // 3. Check for permission in permissions array
    const hasPermission = admin.permissions.includes(permissionName);

    if (!hasPermission) {
      return next(new AppError(`Access Denied: Missing '${permissionName}' permission`, 403));
    }

    next();
  });
};
