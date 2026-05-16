const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../../../config/prisma");
const catchAsync = require("../../../shared/helpers/catch-async");
const AppError = require("../../../shared/errors/app-error");
const ApiResponse = require("../../../shared/helpers/api-response");
const notificationService = require("../../../modules/notifications/notifications.service");

const generateTokens = async (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );

  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt
    }
  });

  return { accessToken, refreshToken };
};

const sendTokenResponse = async (user, statusCode, res, message) => {
  const { accessToken, refreshToken } = await generateTokens(user);

  const cookieOptions = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' // Using lax to allow cookies in local dev environments properly
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  // Remove sensitive fields
  if (user.password) user.password = undefined;
  if (user.otp) user.otp = undefined;

  res.status(statusCode).json(new ApiResponse(statusCode, { 
    token: accessToken, 
    user 
  }, message));
};

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

  await sendTokenResponse(user, 201, res, "User registered successfully");
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
        permissions: ["verify_vendors", "manage_leads", "verify_products"]
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
    return next(new AppError("Incorrect credentials", 401));
  }

  if (!user.password) {
    return next(new AppError("Incorrect credentials. Please set a password.", 401));
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    return next(new AppError("Incorrect credentials", 401));
  }

  if (user.twoFactorEnabled) {
    return res.status(200).json(new ApiResponse(200, { 
      mfaRequired: true, 
      userId: user.id 
    }, "2FA Required. Please verify token."));
  }

  await sendTokenResponse(user, 200, res, "Login successful");
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
  const file = req.file;
  if (!file || !file.path) {
    return next(new AppError("Please provide an image for the avatar", 400));
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatar: req.file.path },
    include: { vendor: true, admin: true }
  });

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
        name: "Guest User",
        email: null,
        role: 'BUYER'
      }
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await prisma.user.update({
    where: { id: user.id },
    data: { otp, otpExpiry: new Date(Date.now() + 10 * 60 * 1000) }
  });

  console.log(`📱 [OTP REQUEST] FOR: ${phone} | CODE: ${otp}`);

  res.status(200).json(new ApiResponse(200, null, "OTP transmitted successfully."));
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

  notificationService.sendEmail({
    email,
    subject: "🔐 Your Verification Code",
    html: `<h3>Verification Code</h3><p>Your code is: <b>${otp}</b></p>`
  }).catch(err => console.error("OTP email delivery failed:", err));

  res.status(200).json(new ApiResponse(200, null, "Verification code sent to your inbox."));
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
    return next(new AppError("Vendors must login using email and password.", 403));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { otp: null, otpExpiry: null }
  });

  await sendTokenResponse(user, 200, res, "Mobile login successful");
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return res.status(200).json(new ApiResponse(200, null, "If an account with that email exists, a reset link has been sent."));
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      token: hashedToken,
      type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000)
    }
  });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
  
  notificationService.sendEmail({
    email: user.email,
    subject: "🔐 Password Reset Request",
    html: `<div style="padding: 20px;">
             <h2>Password Reset</h2>
             <p>Click the link below to reset your password:</p>
             <a href="${resetUrl}" style="background: #164e33; color: white; padding: 10px 20px; text-decoration: none;">Reset Password</a>
             <p>This link expires in 1 hour.</p>
           </div>`
  }).catch(err => console.error("Reset email delivery failed:", err));

  res.status(200).json(new ApiResponse(200, null, "If an account with that email exists, a reset link has been sent."));
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const verificationToken = await prisma.verificationToken.findFirst({
    where: {
      token: hashedToken,
      type: 'PASSWORD_RESET',
      expiresAt: { gt: new Date() }
    }
  });

  if (!verificationToken) {
    return next(new AppError("Token is invalid or has expired", 400));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: verificationToken.userId },
    data: { password: hashedPassword }
  });

  await prisma.verificationToken.deleteMany({
    where: { userId: verificationToken.userId, type: 'PASSWORD_RESET' }
  });

  res.status(200).json(new ApiResponse(200, null, "Password reset successful."));
});

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return next(new AppError("Refresh token not found in cookies", 401));
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true }
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    if (storedToken) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    }
    // Clear cookie on failure
    res.clearCookie('refreshToken');
    return next(new AppError("Invalid or expired refresh token. Please login again.", 401));
  }

  // Generate new tokens and rotate
  const user = storedToken.user;
  const accessToken = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m' }
  );

  const newRefreshToken = crypto.randomBytes(40).toString('hex');
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { id: storedToken.id } }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt: newExpiresAt
      }
    })
  ]);

  // Set new cookie
  res.cookie('refreshToken', newRefreshToken, {
    expires: newExpiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });

  res.status(200).json(new ApiResponse(200, {
    token: accessToken
  }, "Token refreshed successfully"));
});

exports.logout = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken }
    });
  }

  res.clearCookie('refreshToken');
  res.status(200).json(new ApiResponse(200, null, "Logged out successfully"));
});
