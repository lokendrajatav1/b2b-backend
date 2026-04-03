const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const ApiResponse = require('../utils/ApiResponse');
const bcrypt = require('bcryptjs');
const { logAction } = require('../utils/auditLogger');

const VALID_DEPARTMENTS = ['GENERAL', 'DATA_ENTRY', 'SALES', 'SUPPORT'];

// Create Sub-Admin (Only Main ADMIN can do this)
exports.createSubAdmin = catchAsync(async (req, res, next) => {
  const { name, email, password, permissions, department } = req.body;

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
      role: 'SUBADMIN'
    }
  });

  const subAdmin = await prisma.subAdmin.create({
    data: {
      userId: user.id,
      name,
      email,
      department: department || 'GENERAL',
      permissions: permissions || []
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'CREATE_SUBADMIN', 'SUBADMIN', `Created new sub-admin: ${name} (${email})`, req.ip);

  res.status(201).json(new ApiResponse(201, subAdmin, 'Sub-admin created successfully'));
});

// Get all Sub-Admins
exports.getAllSubAdmins = catchAsync(async (req, res, next) => {
  const subAdmins = await prisma.subAdmin.findMany({
    include: { user: { select: { isActive: true, role: true } } }
  });

  res.status(200).json(new ApiResponse(200, subAdmins));
});

// Update Sub-Admin Permissions / Status
exports.updateSubAdmin = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { permissions, isActive, department } = req.body;

  if (department && !VALID_DEPARTMENTS.includes(department)) {
     return next(new AppError('Invalid department selected', 400));
  }

  const subAdmin = await prisma.subAdmin.findUnique({ where: { id } });
  if (!subAdmin) return next(new AppError('Sub-admin not found', 404));

  const updateData = {};
  if (permissions !== undefined) updateData.permissions = permissions;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (department !== undefined) updateData.department = department;

  const updatedSubAdmin = await prisma.subAdmin.update({
    where: { id },
    data: updateData
  });

  if (isActive !== undefined) {
    await prisma.user.update({
      where: { id: subAdmin.userId },
      data: { isActive }
    });
  }

  // Create Audit Log
  await logAction(req.user.id, 'UPDATE_SUBADMIN', 'SUBADMIN', `Updated sub-admin ${id}: permissions=${permissions !== undefined}, isActive=${isActive}, department=${department}`, req.ip);

  res.status(200).json(new ApiResponse(200, updatedSubAdmin, 'Sub-admin updated'));
});

// Delete Sub-Admin
exports.deleteSubAdmin = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const subAdmin = await prisma.subAdmin.findUnique({ where: { id } });
  if (!subAdmin) return next(new AppError('Sub-admin not found', 404));

  await prisma.subAdmin.delete({ where: { id } });
  await prisma.user.delete({ where: { id: subAdmin.userId } });

  // Create Audit Log
  await logAction(req.user.id, 'DELETE_SUBADMIN', 'SUBADMIN', `Permanently removed sub-admin account of ${subAdmin.name} (${subAdmin.email})`, req.ip);

  res.status(200).json(new ApiResponse(200, null, 'Sub-admin removed completely'));
});
