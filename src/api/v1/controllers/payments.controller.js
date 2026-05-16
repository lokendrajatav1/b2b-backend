const crypto = require('crypto');
const razorpay = require('../../../services/razorpay');
const prisma = require('../../../config/prisma');
const catchAsync = require('../../../shared/helpers/catch-async');
const AppError = require('../../../shared/errors/app-error');
const ApiResponse = require('../../../shared/helpers/api-response');
const leadService = require('../../../modules/leads/leads.service');

exports.createOrder = catchAsync(async (req, res, next) => {
  const { packageId } = req.body;
  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id }
  });

  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  const pkg = await prisma.package.findUnique({
    where: { id: packageId }
  });

  if (!pkg) return next(new AppError('Subscription package not found', 404));

  const options = {
    amount: pkg.price * 100,
    currency: 'INR',
    receipt: `receipt_${Date.now()}`,
  };

  const order = await razorpay.orders.create(options);

  await prisma.transaction.create({
    data: {
      vendorId: vendor.id,
      packageId: packageId,
      amount: pkg.price,
      currency: 'INR',
      status: 'PENDING',
      razorpayOrderId: order.id
    }
  });

  res.status(201).json(new ApiResponse(201, order, 'Order created successfully'));
});

exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  const sign = razorpayOrderId + "|" + razorpayPaymentId;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpaySignature !== expectedSign) {
    return next(new AppError('Invalid payment signature', 400));
  }

  const transactionForPackage = await prisma.transaction.findUnique({
    where: { razorpayOrderId },
    include: { vendor: true, package: true }
  });

  let invoiceUrl = null;
  if (transactionForPackage && transactionForPackage.vendor && transactionForPackage.package) {
    try {
      invoiceUrl = await require('../../../modules/payments/invoice.service').generateInvoice(
        transactionForPackage,
        transactionForPackage.vendor,
        transactionForPackage.package
      );
    } catch (e) {
      console.error('Failed to generate invoice:', e);
    }
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  const transaction = await prisma.transaction.update({
    where: { razorpayOrderId },
    data: {
      status: 'COMPLETED',
      razorpayPaymentId,
      razorpaySignature,
      expiryAt: expiryDate,
      subscriptionDays: 30,
      invoiceUrl
    },
    include: { vendor: true, package: true }
  });

  await prisma.vendor.update({
    where: { id: transaction.vendorId },
    data: { 
      packageId: transaction.packageId,
      planExpiry: expiryDate
    }
  });

  await prisma.notification.create({
    data: {
      userId: transaction.vendor.userId,
      title: 'Subscription Activated!',
      message: 'Your payment was successful and your subscription has been activated.'
    }
  });

  const notificationService = require('../../../modules/notifications/notifications.service');
  await notificationService.notifySubscriptionEvent(transaction.vendor, 'UPGRADE', {
    packageName: transaction.package?.name || 'Premium',
    expiry: expiryDate.toLocaleDateString()
  });

  await leadService.recalculateRankings(transaction.vendorId);

  res.status(200).json(new ApiResponse(200, { invoiceUrl }, 'Payment verified and subscription activated'));
});

/**
 * FREE ACTIVATE — Assign subscription without payment (demo/test mode)
 */
exports.freeActivate = catchAsync(async (req, res, next) => {
  const { packageId } = req.body;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: req.user.id },
    include: { user: true }
  });
  if (!vendor) return next(new AppError('Vendor profile not found', 404));

  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) return next(new AppError('Package not found', 404));

  // 30-day expiry from now
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  // Update vendor subscription
  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { packageId: pkg.id, planExpiry: expiryDate }
  });

  // Log a FREE transaction record
  await prisma.transaction.create({
    data: {
      vendorId: vendor.id,
      packageId: pkg.id,
      amount: 0,
      currency: 'INR',
      status: 'COMPLETED',
      subscriptionDays: 30,
      expiryAt: expiryDate,
      razorpayOrderId: `free_${Date.now()}`
    }
  });

  // In-app notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: `${pkg.name} Plan Activated!`,
      message: `Your ${pkg.name} subscription is now active. Expiry: ${expiryDate.toLocaleDateString('en-IN')}.`
    }
  });

  // Recalculate ranking
  await leadService.recalculateRankings(vendor.id);

  res.status(200).json(new ApiResponse(200, {
    package: pkg.name,
    expiry: expiryDate
  }, 'Subscription activated successfully'));
});

