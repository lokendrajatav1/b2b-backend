const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const prisma = require('../config/prisma');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const ApiResponse = require('../utils/ApiResponse');
const leadService = require('../services/lead.service');

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
    amount: pkg.price * 100, // amount in the smallest currency unit (paise)
    currency: 'INR',
    receipt: `receipt_${Date.now()}`,
  };

  const order = await razorpay.orders.create(options);

  // Create pending transaction in DB
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

  // Fetch the package to get pricing and name
  const transactionForPackage = await prisma.transaction.findUnique({
    where: { razorpayOrderId },
    include: { vendor: true, package: true }
  });

  let invoiceUrl = null;
  if (transactionForPackage && transactionForPackage.vendor && transactionForPackage.package) {
    try {
      invoiceUrl = await require('../services/invoice.service').generateInvoice(
        transactionForPackage,
        transactionForPackage.vendor,
        transactionForPackage.package
      );
    } catch (e) {
      console.error('Failed to generate invoice:', e);
    }
  }

  // Calculate Expiry (Default 30 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  // Update transaction and vendor plan
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

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: transaction.vendor.userId,
      title: 'Subscription Activated!',
      message: 'Your payment was successful and your subscription has been activated.'
    }
  });

  // Send Email & WhatsApp Notification
  const notificationService = require('../services/notification.service');
  await notificationService.notifySubscriptionEvent(transaction.vendor, 'UPGRADE', {
    packageName: transaction.package?.name || 'Premium',
    expiry: expiryDate.toLocaleDateString()
  });

  // INSTANT RANKING UPDATE on upgrade
  await leadService.recalculateRankings(transaction.vendorId);

  res.status(200).json(new ApiResponse(200, { invoiceUrl }, 'Payment verified and subscription activated'));
});
