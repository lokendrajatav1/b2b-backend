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

  // Send Welcome Email (Non-blocking for faster registration)
  notificationService.sendEmail({
    email: user.email,
    subject: "✨ Welcome to B2B Community Marketplace!",
    html: `<h3>Hello ${user.name},</h3><p>Your account has been created successfully. Welcome to our community!</p>`
  }).catch(err => console.error("Welcome email failed:", err));

  user.password = undefined;
  
  // Create token for immediate login after registration
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  console.log(`[AUTH-DEBUG] User ${user.email} registered successfully. Token generated.`);
  res.status(201).json(new ApiResponse(201, { user, token }, "User registered successfully"));
});

exports.adminRegister = catchAsync(async (req, res, next) => {
  const { name, email, phone, password, department, hubName } = req.body;

  if (!name || !email || !password) {
    return next(new AppError("Please provide name, email and password", 400));
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return next(new AppError("User already exists with this email", 400));
  }

  const hashed = await bcrypt.hash(password, 10);

  // Create User and Admin in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: name.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' '),
        email,
        phone,
        password: hashed,
        role: "ADMIN"
      }
    });

    const admin = await tx.admin.create({
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        department: department || "GENERAL",
        hubName: hubName || "Main Hub",
        permissions: ["verify_vendors", "manage_leads", "verify_products"] // Default permissions
      }
    });

    return { user, admin };
  });

  result.user.password = undefined;
  res.status(201).json(new ApiResponse(201, result, "Admin account registered successfully"));
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
    include: { vendor: true, admin: true }
  });

  if (!user) {
    console.log(`[AUTH-DEBUG] Login failed: User ${identifier} not found.`);
    return next(new AppError("Incorrect credentials", 401));
  }

  if (!user.password) {
    console.log(`[AUTH-DEBUG] Login failed: User ${identifier} has no password set.`);
    return next(new AppError("Incorrect credentials. Please set a password during registration or contact support.", 401));
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    console.log(`[AUTH-DEBUG] Login failed: Password mismatch for ${identifier}.`);
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
    include: { vendor: true, admin: true }
  });

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  user.password = undefined;
  res.status(200).json(new ApiResponse(200, user));
});

exports.updateProfile = catchAsync(async (req, res, next) => {
  const { name, phone, email, department, hubName, password, avatar } = req.body;
  
  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (email) updateData.email = email;
  if (avatar) updateData.avatar = avatar;
  
  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: req.user.id },
      data: updateData,
      include: { vendor: true, admin: true }
    });

    if (user.role === 'ADMIN') {
      await tx.admin.update({
        where: { userId: user.id },
        data: {
          department: department || undefined,
          hubName: hubName || undefined,
          name: name || undefined,
          email: email || undefined
        }
      });
    }

    return user;
  });

  result.password = undefined;
  res.status(200).json(new ApiResponse(200, result, "Profile updated successfully"));
});

exports.uploadAvatar = catchAsync(async (req, res, next) => {
  console.log(`[DEBUG] uploadAvatar hit for user: ${req.user?.id}`);
  
  const file = req.file;
  if (!file || !file.path) {
    console.error("[DEBUG] No file or path found in request");
    return next(new AppError("Please provide an image for the avatar", 400));
  }

  console.log(`[DEBUG] Attempting to update user ${req.user.id} with path: ${req.file.path}`);

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar: req.file.path },
    include: { vendor: true, admin: true }
  });

  console.log(`[DEBUG] User updated successfully: ${user.email}`);

  res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully"));
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

  // Send LIVE Email OTP (Non-blocking for faster response)
  notificationService.sendEmail({
    email,
    subject: "🔐 Your Verification Code",
    html: `<div style="padding: 20px; border: 1px solid #ddd;">
             <h2>Verification Code</h2>
             <p>Your one-time password (OTP) is:</p>
             <h1 style="color: #3498db; letter-spacing: 5px;">${otp}</h1>
             <p>This code will expire in 10 minutes.</p>
           </div>`
  }).catch(err => console.error("OTP email delivery failed:", err));

  console.log(`\n📧 [EMAIL VERIFICATION] OTP FOR ${email}: ${otp}\n`);

  res.status(200).json(new ApiResponse(200, null, "Email verification code sent to your inbox."));
});

exports.verifyOTPLogin = catchAsync(async (req, res, next) => {
  const { phone, otp } = req.body;
  
  const user = await prisma.user.findFirst({ 
    where: { phone, otp },
    include: { vendor: true, admin: true }
  });

  if (!user || (user.otpExpiry && new Date() > user.otpExpiry)) {
    return next(new AppError("Invalid or expired OTP", 401));
  }

  if (user.role === 'VENDOR') {
    return next(new AppError("Vendors must login using email and password. OTP login is restricted to buyers.", 403));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otp: null, otpExpiry: null }
  });

  const fullToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.status(200).json(new ApiResponse(200, { token: fullToken, user }, "Mobile login successful"));
});