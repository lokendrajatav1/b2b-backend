const AppError = require('../../../shared/errors/app-error');
const catchAsync = require('../../../shared/helpers/catch-async');
const prisma = require('../../../config/prisma');

// Map backend permission names to UI/DB permission names that grant them
const PERMISSION_MAP = {
  'approve_vendor': ['verify_vendors'],
  'view_vendors': ['verify_vendors'],
  'view_users': ['manage_users'],
  'manage_users': ['manage_users'],
  'view_leads': ['manage_leads'],
  'manage_leads': ['manage_leads'],
  'manage_staff': ['manage_staff'],
  'manage_settings': ['manage_categories'],
  'view_transactions': ['verify_vendors', 'manage_users', 'manage_leads'],
  'view_analytics': ['verify_vendors', 'verify_products', 'manage_users', 'manage_leads', 'manage_categories']
};

module.exports = (permissionName) => {
  return catchAsync(async (req, res, next) => {
    const { id, role } = req.user;

    // 1. Core Admins (SUPERADMIN) have all permissions
    if (role === 'SUPERADMIN') return next();

    // 2. Admins have MANAGE_STAFF permission by default to manage their team
    if (role === 'ADMIN' && permissionName === 'MANAGE_STAFF') return next();

    // 2. Fetch Admin record from database
    const admin = await prisma.admin.findUnique({
      where: { userId: id }
    });

    if (!admin || !admin.isActive) {
      return next(new AppError('Your account is either not an admin or is suspended', 403));
    }

    // 3. Check for permission in permissions array (case-insensitive & mapped)
    const requiredPermissionLower = permissionName.toLowerCase();
    const userPermissionsLower = (admin.permissions || []).map(p => p.toLowerCase());

    // Direct case-insensitive match
    let hasPermission = userPermissionsLower.includes(requiredPermissionLower);

    // Mapped match
    if (!hasPermission && PERMISSION_MAP[requiredPermissionLower]) {
      hasPermission = PERMISSION_MAP[requiredPermissionLower].some(mappedPerm =>
        userPermissionsLower.includes(mappedPerm.toLowerCase())
      );
    }

    if (!hasPermission) {
      return next(new AppError(`Access Denied: Missing '${permissionName}' permission`, 403));
    }

    next();
  });
};
