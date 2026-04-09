const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/AppError");
const ApiResponse = require("../utils/ApiResponse");
const notificationService = require("../services/notification.service");

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
  } else {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser && existingUser.password) {
      return next(new AppError("User already exists with this email", 400));
    }
  }

  const hashed = await bcrypt.hash(password, 10);

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
            otp: null,
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

  // Send Welcome Email
  notificationService.sendEmail({
    email: user.email,
    subject: "✨ Welcome to B2B Community Marketplace!",
    html: `<h3>Hello ${user.name},</h3><p>Your account has been created successfully. Welcome to our community!</p>`
  }).catch(err => console.error("Welcome email failed:", err));

  user.password = undefined;
  res.status(201).json(new ApiResponse(201, user, "User registered successfully"));
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, phone, password } = req.body;
  const identifier = email || phone;

  if (!identifier || !password) {
    return next(new AppError("Please provide email/phone and password", 400));
  }

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
        name: phone,
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

  console.log(`\n📱 [MOBILE LOGIN] OTP FOR ${phone}: ${otp}\n`);

  res.status(200).json(new ApiResponse(200, null, "OTP transmitted to terminal hub."));
});

exports.requestEmailOTP = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError("Email address is required", 400));

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  let user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    await prisma.user.create({
        data: {
            email,
            name: email.split('@')[0],
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

  // Send LIVE Email OTP
  await notificationService.sendEmail({
    email,
    subject: "🔐 Your Verification Code",
    html: `<div style="padding: 20px; border: 1px solid #ddd;">
             <h2>Verification Code</h2>
             <p>Your one-time password (OTP) is:</p>
             <h1 style="color: #3498db; letter-spacing: 5px;">${otp}</h1>
             <p>This code will expire in 10 minutes.</p>
           </div>`
  });

  console.log(`\n📧 [EMAIL VERIFICATION] OTP FOR ${email}: ${otp}\n`);

  res.status(200).json(new ApiResponse(200, null, "Email verification code sent to your inbox."));
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