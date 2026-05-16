const catchAsync = require('../../../shared/helpers/catch-async');
const prisma = require('../../../config/prisma');
const AppError = require('../../../shared/errors/app-error');
const ApiResponse = require('../../../shared/helpers/api-response');
const bcrypt = require('bcryptjs');
const { logAction } = require('../../../shared/helpers/auditLogger');

const VALID_DEPARTMENTS = ['GENERAL', 'DATA_ENTRY', 'SALES', 'SUPPORT'];

// Create admin (Only Main SUPERADMIN can do this)
exports.createAdmin = catchAsync(async (req, res, next) => {
  const { name, email, password, permissions, department, hubName, categoryIds } = req.body;

  if (department && !VALID_DEPARTMENTS.includes(department)) {
     return next(new AppError('Invalid department selected', 400));
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) return next(new AppError('Email already in use', 400));

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: 'ADMIN'
    }
  });

  const admin = await prisma.admin.create({
    data: {
      userId: user.id,
      name,
      email,
      department: department || 'GENERAL',
      hubName: hubName || null,
      categoryIds: categoryIds || [],
      permissions: permissions || []
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'CREATE_ADMIN', 'ADMIN', `Created new admin: ${name} (${email})`, req.ip);

  res.status(201).json(new ApiResponse(201, admin, 'admin created successfully'));
});

// Get all admins
exports.getAllAdmins = catchAsync(async (req, res, next) => {
  const admins = await prisma.admin.findMany({
    include: { user: { select: { isActive: true, role: true, avatar: true } } }
  });

  res.status(200).json(new ApiResponse(200, admins));
});

// Update admin Permissions / Status
exports.updateAdmin = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { permissions, isActive, department, hubName, categoryIds } = req.body;

  if (department && !VALID_DEPARTMENTS.includes(department)) {
     return next(new AppError('Invalid department selected', 400));
  }

  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) return next(new AppError('admin not found', 404));

  const updateData = {};
  if (permissions !== undefined) updateData.permissions = permissions;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (department !== undefined) updateData.department = department;
  if (hubName !== undefined) updateData.hubName = hubName;
  if (categoryIds !== undefined) updateData.categoryIds = categoryIds;

  const updatedAdmin = await prisma.admin.update({
    where: { id },
    data: updateData
  });

  if (isActive !== undefined) {
    await prisma.user.update({
      where: { id: admin.userId },
      data: { isActive }
    });
  }

  // Create Audit Log
  await logAction(req.user.id, 'UPDATE_ADMIN', 'ADMIN', `Updated admin ${id}`, req.ip);

  res.status(200).json(new ApiResponse(200, updatedAdmin, 'admin updated'));
});

// Delete admin
exports.deleteAdmin = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) return next(new AppError('admin not found', 404));

  await prisma.admin.delete({ where: { id } });
  await prisma.user.delete({ where: { id: admin.userId } });

  // Create Audit Log
  await logAction(req.user.id, 'DELETE_ADMIN', 'ADMIN', `Permanently removed admin account of ${admin.name}`, req.ip);

  res.status(200).json(new ApiResponse(200, null, 'admin removed completely'));
});
