const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const ApiResponse = require("../utils/ApiResponse");

exports.register = catchAsync(async (req, res, next) => {
  const { name, email, phone, password, role, otp } = req.body;

  if (!name || !email || !password) {
    return next(new AppError("Please provide name, email and password", 400));
  }

  // OTP Verification for Registration
  if (otp) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.otp !== otp || (user.otpExpiry && new Date() > user.otpExpiry)) {
      return next(new AppError("Invalid or expired email verification code", 401));
    }
    // Clear OTP after verification if we proceed
    // We'll update the user (or create) later
  } else {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.password) {
      return next(new AppError("User already exists with this email", 400));
    }
  }

  const hashed = await bcrypt.hash(password, 10);

  // If there was a placeholder user from OTP request, update it.
  // Otherwise create new.
  let user;
  const existingUser = await prisma.user.findUnique({ where: { email } });
  
  if (existingUser) {
    user = await prisma.user.update({
        where: { email },
        data: {
            name,
            phone,
            password: hashed,
            role: role || "VENDOR",
            otp: null, // Clear otp
            otpExpiry: null
        }
    });
  } else {
    user = await prisma.user.create({
      data: {
        name: name.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' '),
        email,
        phone,
        password: hashed,
        role: role || "BUYER"
      }
    });
  }

  // Remove password from response
  user.password = undefined;

  res.status(201).json(new ApiResponse(201, user, "User registered successfully"));
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, phone, password } = req.body;
  const identifier = email || phone;

  if (!identifier || !password) {
    return next(new AppError("Please provide email/phone and password", 400));
  }

  // Find user by email OR phone
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { phone: identifier }
      ]
    },
    include: { vendor: true, subAdmin: true }
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return next(new AppError("Incorrect credentials", 401));
  }

  // Check for 2FA
  if (user.twoFactorEnabled) {
    return res.status(200).json(new ApiResponse(200, { 
      mfaRequired: true, 
      userId: user.id 
    }, "2FA Required. Please verify token."));
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  res.status(200).json(new ApiResponse(200, { token, user }, "Login successful"));
});

exports.getMe = catchAsync(async (req, res, next) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { vendor: true, subAdmin: true }
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  user.password = undefined;
  res.status(200).json(new ApiResponse(200, user));
});

exports.requestOTP = catchAsync(async (req, res, next) => {
  const { phone } = req.body;
  if (!phone) return next(new AppError("Mobile number is required", 400));

  let user = await prisma.user.findUnique({ where: { phone } });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        name: phone, // Store phone as name initially instead of Node_ placeholder
        email: `guest_${phone.slice(-4)}_${Date.now()}@placeholder.com`,
        role: 'BUYER'
      }
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpExpiry: new Date(Date.now() + 10 * 60 * 1000) }
  });

  console.log(`\n----------------------------------------------`);
  console.log(`📱 [MOBILE LOGIN] OTP FOR ${phone}: ${otp}`);
  console.log(`----------------------------------------------\n`);

  res.status(200).json(new ApiResponse(200, null, "OTP transmitted to terminal hub."));
});

exports.requestEmailOTP = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError("Email address is required", 400));

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Check if we already have a record for this email (could be a registered user or a placeholder)
  let user = await prisma.user.findUnique({ where: { email } });
  
  if (user && user.password) {
    // If user exists and is fully registered, maybe they are trying to reset password or re-register
    // For registration flow, if they exist, they shouldn't be registering again.
    // However, for simplicity, let's just update the OTP for verification.
  }

  // We can't easily save to User table if the user doesn't exist yet and we don't want to create a ghost user.
  // But to follow the existing pattern, let's just log it to terminal.
  // In a real app, we'd store this in a 'PendingVerifications' table.
  // Since I don't want to change the schema for a simple UI request, I'll use the console log strategy.
  
  console.log(`\n----------------------------------------------`);
  console.log(`📧 [EMAIL VERIFICATION] OTP FOR ${email}`);
  console.log(`🎫 CODE: ${otp}`);
  console.log(`----------------------------------------------\n`);

  // To make it functional without schema changes, let's actually store it if possible.
  // We can create a temporary user with ONLY email if it doesn't exist.
  if (!user) {
    await prisma.user.create({
        data: {
            email,
            name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1).toLowerCase(),
            otp,
            otpExpiry,
            role: 'VENDOR'
        }
    });
  } else {
    await prisma.user.update({
        where: { email },
        data: { otp, otpExpiry }
    });
  }

  res.status(200).json(new ApiResponse(200, null, "Email verification code sent to terminal hub."));
});

exports.verifyOTPLogin = catchAsync(async (req, res, next) => {
  const { phone, otp } = req.body;
  const user = await prisma.user.findFirst({ 
    where: { phone, otp },
    include: { vendor: true, subAdmin: true }
  });

  if (!user || (user.otpExpiry && new Date() > user.otpExpiry)) {
    return next(new AppError("Invalid or expired OTP", 401));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otp: null, otpExpiry: null }
  });

  const fullToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(200).json(new ApiResponse(200, { token: fullToken, user }, "Mobile login successful"));
});