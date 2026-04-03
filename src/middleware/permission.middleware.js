const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const prisma = require("../config/prisma");

module.exports = (permissionName) => {
  return catchAsync(async (req, res, next) => {
    const { id, role } = req.user;

    // 1. Core Admins have all permissions
    if (role === 'ADMIN') return next();

    // 2. Reject if not SubAdmin
    if (role !== 'SUBADMIN') {
      return next(new AppError('You do not have permission to access this module', 403));
    }

    // 3. Fetch SubAdmin record from database
    const subAdmin = await prisma.subAdmin.findUnique({
       where: { userId: id }
    });

    if (!subAdmin || !subAdmin.isActive) {
       return next(new AppError('Your account is either not a sub-admin or is suspended', 403));
    }

    // 4. Check for permission in permissions array
    const hasPermission = subAdmin.permissions.includes(permissionName);

    if (!hasPermission) {
       return next(new AppError(`Access Denied: You do not have the '${permissionName.replace('_', ' ')}' permission required to access this resource`, 403));
    }

    next();
  });
};
