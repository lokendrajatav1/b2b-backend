const catchAsync = require('../utils/catchAsync');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const ApiResponse = require('../utils/ApiResponse');
const notificationService = require('../services/notification.service');

// VENDOR: Request a refund
exports.requestRefund = catchAsync(async (req, res, next) => {
  const { transactionId, reason } = req.body;
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId, vendorId: vendor.id }
  });

  if (!transaction) return next(new AppError('Transaction not found or does not belong to you', 404));
  if (transaction.status !== 'COMPLETED') return next(new AppError('Can only refund completed transactions', 400));

  const existingRefund = await prisma.refund.findUnique({
    where: { transactionId }
  });

  if (existingRefund) return next(new AppError('Refund already requested for this transaction', 400));

  const refund = await prisma.refund.create({
    data: {
      vendorId: vendor.id,
      transactionId: transaction.id,
      amount: transaction.amount,
      reason,
      status: 'REQUESTED'
    }
  });

  res.status(201).json(new ApiResponse(201, refund, 'Refund requested successfully. Pending admin approval.'));
});

// VENDOR: Get my refunds
exports.getMyRefunds = catchAsync(async (req, res, next) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  const refunds = await prisma.refund.findMany({
    where: { vendorId: vendor.id },
    include: { transaction: { include: { package: true } } },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json(new ApiResponse(200, refunds, 'Fetched your refund requests'));
});

// SUPERADMIN: Get all refunds
exports.getAllRefunds = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (status) where.status = status;

  const refunds = await prisma.refund.findMany({
    where,
    include: { 
      vendor: { select: { businessName: true, email: true, phone: true } },
      transaction: { select: { razorpayOrderId: true, amount: true, createdAt: true } }
    },
    skip: parseInt(skip),
    take: parseInt(limit),
    orderBy: { createdAt: 'desc' }
  });

  const total = await prisma.refund.count({ where });

  res.status(200).json(new ApiResponse(200, {
    refunds,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  }));
});

// SUPERADMIN: Update refund status
exports.updateRefundStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, adminNote, razorpayRefundId } = req.body;

  const refund = await prisma.refund.findUnique({
    where: { id },
    include: { vendor: { include: { user: true } }, transaction: true }
  });

  if (!refund) return next(new AppError('Refund record not found', 404));

  const updateData = { status, adminNote };
  if (razorpayRefundId) updateData.razorpayRefundId = razorpayRefundId;
  if (status === 'PROCESSED') updateData.processedAt = new Date();

  const updatedRefund = await prisma.refund.update({
    where: { id },
    data: updateData
  });

  // If approved/processed, update transaction status too
  if (status === 'PROCESSED') {
    await prisma.transaction.update({
      where: { id: refund.transactionId },
      data: { status: 'REFUNDED' }
    });

    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: refund.vendor.userId,
        title: 'Refund Processed',
        message: `Your refund of INR ${refund.amount} has been processed successfully.`
      }
    });

    await notificationService.sendEmail({
      email: refund.vendor.email,
      subject: '✔️ Refund Processed Successfully',
      message: `Your refund for Transaction ${refund.transaction.razorpayOrderId} has been processed.`,
      html: `<p>Hello <b>${refund.vendor.businessName}</b>,</p><p>We have successfully processed your refund of INR ${refund.amount}. It may take 5-7 business days to reflect in your account.</p>`
    });
  } else if (status === 'REJECTED') {
    await prisma.notification.create({
      data: {
        userId: refund.vendor.userId,
        title: 'Refund Request Rejected',
        message: `Your refund request was rejected. Reason: ${adminNote || 'No reason provided'}`
      }
    });
  }

  res.status(200).json(new ApiResponse(200, updatedRefund, 'Refund status updated'));
});
