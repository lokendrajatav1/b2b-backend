const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const prisma = require('../../../config/prisma');
const catchAsync = require('../../../shared/helpers/catch-async');
const ApiResponse = require('../../../shared/helpers/api-response');
const AppError = require('../../../shared/errors/app-error');

/**
 * Step 1: Generate 2FA Secret and QR Code for Setup
 */
exports.setup2FA = catchAsync(async (req, res, next) => {
  const secret = speakeasy.generateSecret({
    name: `B2B Marketplace (${req.user.email})`
  });

  await prisma.user.update({
    where: { id: req.user.id },
    data: { twoFactorSecret: secret.base32 }
  });

  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  res.status(200).json(new ApiResponse(200, {
    qrCodeUrl,
    secret: secret.base32
  }, "Scan the QR code in your Authenticator app"));
});

/**
 * Step 2: Verify and Enable 2FA
 */
exports.verifyAndEnable2FA = catchAsync(async (req, res, next) => {
  const { token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token
  });

  if (!verified) {
    return next(new AppError("Invalid 2FA token. Setup failed.", 400));
  }

  await prisma.user.update({
    where: { id: req.user.id },
    data: { twoFactorEnabled: true }
  });

  res.status(200).json(new ApiResponse(200, null, "2FA enabled successfully"));
});

/**
 * Step 3: Verify Token during Login
 */
exports.validate2FAToken = catchAsync(async (req, res, next) => {
  const { token, userId } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.twoFactorEnabled) {
    return next(new AppError("2FA not enabled for this user", 400));
  }

  // LOG OTP TO TERMINAL FOR DEVELOPMENT (Requirement: otp show terminal)
  const expectedToken = speakeasy.totp({
    secret: user.twoFactorSecret,
    encoding: 'base32'
  });
  console.log(`\n----------------------------------------------`);
  console.log(`🔐 [MFA HANDSHAKE] SECURITY OTP FOR ${user.email}`);
  console.log(`🔑 CURRENT TOKEN: ${expectedToken}`);
  console.log(`⏳ VALID UNTIL: ${new Date(new Date().getTime() + 30000).toLocaleTimeString()}`);
  console.log(`----------------------------------------------\n`);

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token
  });

  if (!verified) {
    return next(new AppError("Invalid 2FA token", 401));
  }

  // Generate Full JWT here (as login bypasses standard flow if 2FA is on)
  const jwt = require('jsonwebtoken');
  const fullToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });

  res.status(200).json(new ApiResponse(200, { token: fullToken, user }, "2FA verification successful"));
});
