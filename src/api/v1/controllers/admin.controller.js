const catchAsync = require("../../../shared/helpers/catch-async");
const ApiResponse = require("../../../shared/helpers/api-response");
const prisma = require("../../../config/prisma");
const AppError = require("../../../shared/errors/app-error");
const cacheService = require("../../../services/cache.service");
const notificationService = require("../../../modules/notifications/notifications.service");
const { logAction } = require("../../../shared/helpers/auditLogger");
const { decrypt } = require("../../../shared/helpers/encryption");

/**
 * Vendor Approval
 */
exports.approveVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { 
      verified: true,
      status: "VERIFIED"
    },
    include: { user: true },
  });

  // Upgrade user's role to VENDOR
  await prisma.user.update({
    where: { id: vendor.userId },
    data: { role: "VENDOR" },
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: "Business Verified!",
      message:
        "Your business profile has been verified by the Admin. You are now eligible to receive leads.",
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "APPROVE_VENDOR",
    "VENDOR",
    `Approved vendor: ${vendor.businessName}`,
    req.ip,
  );

  // Clear Search Cache & Recalculate Initial Ranking
  const leadService = require("../../../modules/leads/leads.service");
  await leadService.recalculateRankings(vendorId);
  await cacheService.clearCacheByPrefix("search:vendors");

  // Notify vendor
  await notificationService.notifyVendorApproval(vendor, req.user.role);

  res
    .status(200)
    .json(new ApiResponse(200, vendor, "Vendor approved successfully"));
});

exports.unverifyVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { 
      verified: false,
      status: "PENDING"
    },
    include: { user: true },
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: "Verification Revoked",
      message:
        "Your verification status has been revoked by the Admin. Please contact support for more details.",
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "UNVERIFY_VENDOR",
    "VENDOR",
    `Unverified vendor: ${vendor.businessName}`,
    req.ip,
  );

  res
    .status(200)
    .json(new ApiResponse(200, vendor, "Vendor verification revoked"));
});

exports.rejectVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const { reason } = req.body || {};

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      status: "REJECTED",
      verified: false,
    },
    include: { user: true },
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: "Application Rejected",
      message: `Your vendor application was rejected. Reason: ${reason || "Incomplete documentation"}`,
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "REJECT_VENDOR",
    "VENDOR",
    `Rejected vendor: ${vendor.businessName}. Reason: ${reason || "N/A"}`,
    req.ip,
  );

  res.status(200).json(new ApiResponse(200, null, "Vendor application rejected"));
});

/**
 * Get all vendors awaiting verification
 */
exports.getPendingVendors = catchAsync(async (req, res, next) => {
  const {
    search,
    city,
    status,
    timeRange,
    categoryId,
    packageId,
    page = 1,
    limit = 50,
  } = req.query;
  const { id, role } = req.user;
  const skip = (page - 1) * limit;

  const where = {};

  // Hub-based filtering removed for global access
  /*
  if (role === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { userId: id } });
    if (admin && admin.categoryIds?.length > 0) {
      where.categories = { some: { name: { in: admin.categoryIds } } };
    }
  }
  */

  if (timeRange && ["weekly", "monthly", "yearly"].includes(timeRange)) {
    const startDate = new Date();
    if (timeRange === "weekly") startDate.setDate(startDate.getDate() - 7);
    if (timeRange === "monthly") startDate.setMonth(startDate.getMonth() - 1);
    if (timeRange === "yearly")
      startDate.setFullYear(startDate.getFullYear() - 1);
    where.createdAt = { gte: startDate };
  }

  if (status === "VERIFIED") {
    where.status = "VERIFIED";
  } else if (status === "PENDING") {
    where.status = "PENDING";
  } else if (status === "REJECTED") {
    where.status = "REJECTED";
  } else {
    // Default or 'ALL'
    if (status !== "ALL") {
      where.status = "PENDING";
    }
  }

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  if (categoryId) {
    where.categories = { some: { id: categoryId } };
  }

  if (packageId) {
    where.packageId = packageId;
  }

  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [vendors, total] = await prisma.$transaction([
    prisma.vendor.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        categories: {
          select: { id: true, name: true },
        },
        products: {
          take: 5,
          select: { id: true, name: true, price: true, type: true, images: true },
        },
        certifications: true,
        gallery: true,
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
    }),
    prisma.vendor.count({ where }),
  ]);

  // Decrypt sensitive info for admins
  const decryptedVendors = vendors.map((vendor) => ({
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null,
  }));

  res.status(200).json(
    new ApiResponse(200, {
      vendors: decryptedVendors,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
    }),
  );
});

/**
 * User & Vendor Management
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { role, isActive, search, page = 1, limit = 1000 } = req.query;
  const { id, role: userRole } = req.user;
  const skip = (page - 1) * limit;

  const where = {};

  // Hub-based filtering removed for global access
  /*
  if (userRole === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { userId: id } });
    if (admin && admin.categoryIds?.length > 0) {
      where.vendor = { categories: { some: { name: { in: admin.categoryIds } } } };
    }
  }
  */
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === "true";
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: {
      vendor: { include: { products: true, keywords: true, categories: true } },
      admin: true,
    },

    skip: parseInt(skip),
    take: parseInt(limit),
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.user.count({ where });

  // Decrypt sensitive information if the user is a vendor
  const decryptedUsers = users.map((user) => {
    if (user.vendor) {
      user.vendor.gstNumber = user.vendor.gstNumber
        ? decrypt(user.vendor.gstNumber)
        : null;
      user.vendor.aadhaarNumber = user.vendor.aadhaarNumber
        ? decrypt(user.vendor.aadhaarNumber)
        : null;
    }
    return user;
  });

  // Calculate global counts for dashboard cards
  const [vendorsCount, adminsCount, newMembersCount] = await Promise.all([
    prisma.user.count({ where: { role: "VENDOR" } }),
    prisma.user.count({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } } }),
    prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      users: decryptedUsers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      counts: {
        vendors: vendorsCount,
        admins: adminsCount,
        newMembers: newMembersCount,
      },
    }),
  );
});

exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { role, isActive } = req.body;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role, isActive },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "UPDATE_USER_STATUS",
    "USER",
    `Updated user ${userId} settings: Role=${role}, Active=${isActive}`,
    req.ip,
  );

  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { vendor: true, admin: true },
  });

  if (!user) return next(new AppError("User not found", 404));

  // 1. Delete user-level relations that block deletion (NOT role-specific)
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { userId } });

  // 2. Handle Vendor-specific data deletion
  if (user.role === "VENDOR" && user.vendor) {
    const vendorId = user.vendor.id;
    await prisma.product.deleteMany({ where: { vendorId } });
    await prisma.galleryImage.deleteMany({ where: { vendorId } });
    await prisma.certification.deleteMany({ where: { vendorId } });
    await prisma.ranking.deleteMany({ where: { vendorId } });
    await prisma.review.deleteMany({ where: { vendorId } });
    await prisma.transaction.deleteMany({ where: { vendorId } });
    await prisma.refund.deleteMany({ where: { vendorId } });
    await prisma.lead.updateMany({
      where: { vendorId },
      data: { vendorId: null },
    });
    await prisma.vendor.delete({ where: { id: vendorId } });
  }

  // 3. Handle admin specific data deletion
  if (user.role === "ADMIN" && user.admin) {
    await prisma.admin.delete({ where: { userId: user.id } });
  }

  // 4. Delete the User record itself
  await prisma.user.delete({ where: { id: userId } });

  // Create Audit Log for THIS deletion action (using req.user.id who is the admin performing the delete)
  await logAction(
    req.user.id,
    "DELETE_USER",
    "USER",
    `Permanently deleted user: ${user.name || user.email} (${user.role})`,
    req.ip,
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "Member account and associated data removed successfully",
      ),
    );
});

/**
 * Lead & Ranking Controls
 */
exports.getVendorSecureDetails = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      gstNumber: true,
      aadhaarNumber: true,
      verificationDocument: true,
    },
  });

  if (!vendor) return next(new AppError("Vendor not found", 404));

  // Decrypt sensitive data for Admin view
  const secureData = {
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null,
  };

  res
    .status(200)
    .json(new ApiResponse(200, secureData, "Secure details retrieved"));
});

exports.reassignLead = catchAsync(async (req, res, next) => {
  const { leadId } = req.params;
  const { vendorId } = req.body;
  console.log(
    "[DEBUG-REASSIGN] Reassigning Lead:",
    leadId,
    "to Vendor:",
    vendorId,
  );

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { vendorId, status: "DISTRIBUTED" },
    include: { vendor: { include: { categories: true, user: true } } },
  });

  await prisma.leadLifecycle.create({
    data: {
      leadId,
      action: "DISTRIBUTED", // Using DISTRIBUTED so the rotation logic picks it up
      details: `Admin manually reassigned lead to vendor ${lead.vendor.businessName} (${lead.vendor.id})`,
    },
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: lead.vendor.userId,
      title: "New Priority Lead! 🚀",
      message: `Admin has assigned a new lead from ${lead.buyerName} to you.`,
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "REASSIGN_LEAD",
    "LEAD",
    `Reassigned lead ${leadId} to vendor ${lead.vendor.businessName}`,
    req.ip,
  );

  // Notify vendor
  await notificationService.notifyLeadAssignment(
    lead.vendor,
    lead,
    req.user.role,
  );

  res
    .status(200)
    .json(new ApiResponse(200, lead, "Lead reassigned successfully"));
});

exports.manualBoostVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const { boostScore } = req.body; // e.g., 5.0 to add to total score

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { manualBoost: parseFloat(boostScore) },
  });

  const leadService = require("../../../modules/leads/leads.service");
  await leadService.recalculateRankings(vendorId);

  // Clear search cache so boost takes effect immediately
  const cacheService = require("../../../services/cache.service");
  await cacheService.clearCacheByPrefix("search:vendors");

  // Create Audit Log
  await logAction(
    req.user.id,
    "BOOST_VENDOR",
    "VENDOR",
    `Applied +${boostScore} manual boost to vendor ${vendor.businessName}`,
    req.ip,
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        vendor,
        "Vendor boost applied and rankings recalculated",
      ),
    );
});

/**
 * Package & Pricing Management
 */
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const packages = await prisma.package.findMany();
  res.status(200).json(new ApiResponse(200, packages));
});

exports.createPackage = catchAsync(async (req, res, next) => {
  const { name, price, monthlyLeads, priority, description, features } =
    req.body;

  if (!name || price === undefined)
    return next(new AppError("Name and price are required", 400));

  const pkg = await prisma.package.create({
    data: {
      name,
      price: parseFloat(price),
      monthlyLeads: parseInt(monthlyLeads) || 0,
      priority: parseInt(priority) || 1,
      description: description || null,
      features: Array.isArray(features) ? features : [],
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, pkg, "Subscription package initialized"));
});

exports.updatePackage = catchAsync(async (req, res, next) => {
  const { packageId } = req.params;
  const { name, price, monthlyLeads, priority, description, features } =
    req.body;

  const pkg = await prisma.package.update({
    where: { id: packageId },
    data: {
      name,
      price: price !== undefined ? parseFloat(price) : undefined,
      monthlyLeads:
        monthlyLeads !== undefined ? parseInt(monthlyLeads) : undefined,
      priority: priority !== undefined ? parseInt(priority) : undefined,
      description: description !== undefined ? description : undefined,
      features:
        features !== undefined
          ? Array.isArray(features)
            ? features
            : []
          : undefined,
    },
  });

  res.status(200).json(new ApiResponse(200, pkg, "Package tier updated"));
});

exports.deletePackage = catchAsync(async (req, res, next) => {
  const { packageId } = req.params;

  await prisma.package.delete({
    where: { id: packageId },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, "Package tier decommissioned"));
});

/**
 * Transaction History
 */
exports.getAllTransactions = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      include: { vendor: { include: { categories: true } } },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.count(),
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, {
        transactions,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      }),
    );
});

/**
 * Account Suspension
 */
exports.suspendVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const { suspend } = req.body; // boolean

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });

  await prisma.user.update({
    where: { id: vendor.userId },
    data: { isActive: !suspend },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    suspend ? "SUSPEND_VENDOR" : "UNSUSPEND_VENDOR",
    "VENDOR",
    `${suspend ? "Suspended" : "Unsuspended"} vendor accounts linked to user ${vendor.userId}`,
    req.ip,
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        suspend ? "Vendor suspended" : "Vendor unsuspended",
      ),
    );
});

/**
 * Comprehensive Analytics
 */
exports.getAnalytics = catchAsync(async (req, res, next) => {
  const { timeRange } = req.query;
  const { id, role } = req.user;

  let contextWhere = {};
  let adminInfo = null;

  if (role === "ADMIN") {
    adminInfo = await prisma.admin.findUnique({ where: { userId: id } });
    if (adminInfo && adminInfo.categoryIds?.length > 0) {
      contextWhere = {
        categories: { some: { name: { in: adminInfo.categoryIds } } },
      };
    }
  }

  let dateFilter = {};
  const { startDate, endDate } = req.query;

  if (timeRange === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    dateFilter = { createdAt: { gte: startOfDay, lte: endOfDay } };
  } else if (timeRange === "yesterday") {
    const startOfYesterday = new Date();
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    startOfYesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date();
    endOfYesterday.setDate(endOfYesterday.getDate() - 1);
    endOfYesterday.setHours(23, 59, 59, 999);
    dateFilter = { createdAt: { gte: startOfYesterday, lte: endOfYesterday } };
  } else if (timeRange === "custom" && startDate && endDate) {
    dateFilter = {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      },
    };
  } else if (timeRange && ["weekly", "monthly", "yearly"].includes(timeRange)) {
    const start = new Date();
    if (timeRange === "weekly") start.setDate(start.getDate() - 7);
    if (timeRange === "monthly") start.setMonth(start.getMonth() - 1);
    if (timeRange === "yearly") start.setFullYear(start.getFullYear() - 1);
    dateFilter = { createdAt: { gte: start } };
  }

  const [
    totalLeads,
    totalVendors,
    totalUsers,
    totalRevenue,
    activeSubscribers,
    pendingVendors,
    pendingOfferings,
    totalProducts,
    recentLeads,
    leadsByStatus,
    vendorKeywords,
    leadLocations,
    recentTransactions,
    rejectedVendors,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? { category: { name: { in: adminInfo.categoryIds } } }
          : {}),
      },
    }),
    prisma.vendor.count({
      where: {
        status: "VERIFIED",
        ...dateFilter,
        ...contextWhere,
      },
    }),
    prisma.user.count({
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? {
              vendor: {
                categories: { some: { name: { in: adminInfo.categoryIds } } },
              },
            }
          : {}),
      },
    }),
    prisma.transaction.aggregate({
      where: {
        status: "COMPLETED",
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? {
              vendor: {
                categories: { some: { name: { in: adminInfo.categoryIds } } },
              },
            }
          : {}),
      },
      _sum: { amount: true },
    }),
    prisma.vendor.count({
      where: {
        packageId: { not: null },
        ...dateFilter,
        ...contextWhere,
      },
    }),
    prisma.vendor.count({
      where: {
        status: "PENDING",
        ...dateFilter,
        ...contextWhere,
      },
    }),
    prisma.product.count({
      where: {
        status: "PENDING",
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? {
              vendor: {
                categories: { some: { name: { in: adminInfo.categoryIds } } },
              },
            }
          : {}),
      },
    }),
    prisma.product.count({
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? {
              vendor: {
                categories: { some: { name: { in: adminInfo.categoryIds } } },
              },
            }
          : {}),
      },
    }),
    prisma.lead.findMany({
      take: 10,
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? { category: { name: { in: adminInfo.categoryIds } } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { vendor: { select: { businessName: true } } },
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? { category: { name: { in: adminInfo.categoryIds } } }
          : {}),
      },
      _count: { id: true },
    }),
    // 3. Top Keywords (Insights snippet)
    prisma.keyword.findMany({
      include: { _count: { select: { vendors: true } } },
      orderBy: { vendors: { _count: "desc" } },
      take: 5,
    }),
    // 4. City Rankings (Location snippet)
    prisma.lead.groupBy({
      by: ["city"],
      where: {
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? { category: { name: { in: adminInfo.categoryIds } } }
          : {}),
      },
      _count: { id: true },
      orderBy: { _count: { city: "desc" } },
      take: 5,
    }),
    // 5. Revenue Trends
    prisma.transaction.findMany({
      where: {
        status: "COMPLETED",
        ...dateFilter,
        ...(role === "ADMIN" && adminInfo?.categoryIds?.length > 0
          ? {
              vendor: {
                categories: { some: { name: { in: adminInfo.categoryIds } } },
              },
            }
          : {}),
      },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.vendor.count({
      where: {
        status: "REJECTED",
        ...dateFilter,
        ...contextWhere,
      },
    }),
  ]);

  // Process monthly revenue trends
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const revenueTrends = [];

  // Initialize with last 6 months
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueTrends.push({
      name: monthNames[d.getMonth()],
      revenue: 0,
      timestamp: d.getTime(),
    });
  }

  // Aggregate transaction data into months
  const transactions = recentTransactions;
  transactions.forEach((tx) => {
    const txDate = new Date(tx.createdAt);
    const txMonth = monthNames[txDate.getMonth()];
    const trendPoint = revenueTrends.find((tp) => tp.name === txMonth);
    if (trendPoint) {
      trendPoint.revenue += tx.amount || 0;
    }
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        summary: {
          totalLeads,
          totalVendors: totalVendors + pendingVendors + rejectedVendors,
          totalUsers,
          totalProducts,
          totalRevenue: totalRevenue._sum.amount || 0,
          activeSubscribers,
          pendingVendors,
          verifiedVendors: totalVendors,
          rejectedVendors,
          pendingOfferings,
          leadsByStatus,
        },
        recentLeads,
        trends: {
          topKeywords: vendorKeywords.map((k) => ({
            name: k.name,
            count: k._count.vendors,
          })),
          topLocations: leadLocations.map((l) => ({
            name: l.city,
            count: l._count.id,
          })),
          revenueTrends: revenueTrends.map(({ name, revenue }) => ({
            name,
            revenue,
          })),
        },
        hubInfo:
          role === "ADMIN"
            ? {
                name:
                  adminInfo?.hubName || adminInfo?.department || "Regional Hub",
                categories: adminInfo?.categoryIds || [],
              }
            : null,
      },
      "Full platform analytics dataset retrieved",
    ),
  );
});

/**
 * Keyword & Category Analytics
 */
exports.getKeywordAnalytics = catchAsync(async (req, res, next) => {
  // 1. Top Keywords from Vendors (Profiles)
  const vendorKeywords = await prisma.keyword.findMany({
    include: { _count: { select: { vendors: true } } },
    orderBy: { vendors: { _count: "desc" } },
    take: 10,
  });

  // 2. Keyword-wise Leads (Demand Analysis)
  const leadKeywords = await prisma.lead.groupBy({
    by: ["searchKeyword"],
    where: { searchKeyword: { not: null } },
    _count: { id: true },
    orderBy: { _count: { searchKeyword: "desc" } },
    take: 10,
  });

  res.status(200).json(new ApiResponse(200, { vendorKeywords, leadKeywords }));
});

/**
 * Performance & Conversion Analytics
 */
exports.getPerformanceAnalytics = catchAsync(async (req, res, next) => {
  const [totalLeads, closedLeads, categoryPerformance, planComparison] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: "CLOSED" } }),
      prisma.category.findMany({
        include: {
          _count: { select: { leads: true, vendors: true } },
        },
        take: 10,
      }),
      prisma.package.findMany({
        include: {
          _count: { select: { vendors: true } },
          vendors: {
            select: { _count: { select: { leads: true } } },
          },
        },
      }),
    ]);

  // Calculate closure rate
  const closureRate = totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0;

  // Process plan Leads distribution
  const planData = planComparison.map((p) => {
    const totalLeadsForPlan = p.vendors.reduce(
      (acc, v) => acc + v._count.leads,
      0,
    );
    return {
      name: p.name,
      vendorCount: p._count.vendors,
      totalLeads: totalLeadsForPlan,
      avgLeadsPerVendor:
        p._count.vendors > 0 ? totalLeadsForPlan / p._count.vendors : 0,
    };
  });

  res.status(200).json(
    new ApiResponse(200, {
      conversion: {
        totalLeads,
        closedLeads,
        closureRate: closureRate.toFixed(2) + "%",
      },
      categoryPerformance,
      planComparison: planData,
    }),
  );
});

/**
 * Location Analytics
 */
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const [users, verifiedVendors, pendingVendors, rejectedVendors, leads, revenue] =
    await Promise.all([
      prisma.user.count(),
      prisma.vendor.count({ where: { status: "VERIFIED" } }),
      prisma.vendor.count({ where: { status: "PENDING" } }),
      prisma.vendor.count({ where: { status: "REJECTED" } }),
      prisma.lead.count(),
      prisma.transaction.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
    ]);

  res.status(200).json(
    new ApiResponse(200, {
      users,
      vendors: verifiedVendors,
      totalVendors: verifiedVendors + pendingVendors + rejectedVendors,
      pendingVendors,
      rejectedVendors,
      leads,
      revenue: revenue._sum.amount || 0,
    }),
  );
});

exports.getVendorApprovals = catchAsync(async (req, res, next) => {
  const vendors = await prisma.vendor.findMany({
    where: { status: "PENDING" },
    include: {
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json(new ApiResponse(200, vendors));
});

exports.getLocationAnalytics = catchAsync(async (req, res, next) => {
  const vendorLocations = await prisma.vendor.groupBy({
    by: ["city"],
    _count: { id: true },
    orderBy: { _count: { city: "desc" } },
  });

  const leadLocations = await prisma.lead.groupBy({
    by: ["city"],
    _count: { id: true },
    orderBy: { _count: { city: "desc" } },
  });

  res
    .status(200)
    .json(new ApiResponse(200, { vendorLocations, leadLocations }));
});

/**
 * Lead Monitoring (List View)
 */
exports.getAllLeads = catchAsync(async (req, res, next) => {
  const { status, city, categoryId, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (status) where.status = status;
  if (city) where.city = { contains: city, mode: "insensitive" };
  if (categoryId) where.categoryId = categoryId;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { vendor: { include: { categories: true } }, category: true },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.count({ where }),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      leads,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    }),
  );
});

const seoService = require("../../../modules/marketplace/seo.service");

/**
 * Google Merchant Product Feed
 */
exports.getGoogleMerchantFeed = catchAsync(async (req, res, next) => {
  const feed = await seoService.generateMerchantFeed();
  res
    .status(200)
    .json(
      new ApiResponse(200, feed, "Google Merchant feed generated successfully"),
    );
});

exports.getSettings = catchAsync(async (req, res, next) => {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "global" },
  });

  // Return defaults if not found
  if (!settings) {
    return res.status(200).json(
      new ApiResponse(200, {
        rankingWeightProfile: 0.4,
        rankingWeightPerformance: 0.6,
        marketplaceId: "B2B-INDIA-ROOT-01",
        hubName: "Mumbai Central",
        alertVendorOnboarding: true,
        alertPaymentExceptions: true,
        alertInquirySpikes: false,
      }),
    );
  }

  res.status(200).json(new ApiResponse(200, settings));
});

exports.updateSettings = catchAsync(async (req, res, next) => {
  const {
    rankingWeightProfile,
    rankingWeightPerformance,
    marketplaceId,
    hubName,
    alertVendorOnboarding,
    alertPaymentExceptions,
    alertInquirySpikes,
  } = req.body;

  const updateData = {
    rankingWeightProfile:
      rankingWeightProfile !== undefined
        ? parseFloat(rankingWeightProfile)
        : undefined,
    rankingWeightPerformance:
      rankingWeightPerformance !== undefined
        ? parseFloat(rankingWeightPerformance)
        : undefined,
    marketplaceId,
    hubName,
    alertVendorOnboarding:
      alertVendorOnboarding !== undefined
        ? Boolean(alertVendorOnboarding)
        : undefined,
    alertPaymentExceptions:
      alertPaymentExceptions !== undefined
        ? Boolean(alertPaymentExceptions)
        : undefined,
    alertInquirySpikes:
      alertInquirySpikes !== undefined
        ? Boolean(alertInquirySpikes)
        : undefined,
  };

  const createData = {
    id: "global",
    rankingWeightProfile:
      rankingWeightProfile !== undefined
        ? parseFloat(rankingWeightProfile)
        : 0.4,
    rankingWeightPerformance:
      rankingWeightPerformance !== undefined
        ? parseFloat(rankingWeightPerformance)
        : 0.6,
    marketplaceId: marketplaceId || "B2B-INDIA-ROOT-01",
    hubName: hubName || "Mumbai Central",
    alertVendorOnboarding:
      alertVendorOnboarding !== undefined
        ? Boolean(alertVendorOnboarding)
        : true,
    alertPaymentExceptions:
      alertPaymentExceptions !== undefined
        ? Boolean(alertPaymentExceptions)
        : true,
    alertInquirySpikes:
      alertInquirySpikes !== undefined ? Boolean(alertInquirySpikes) : false,
  };

  const settings = await prisma.systemSettings.upsert({
    where: { id: "global" },
    update: updateData,
    create: createData,
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, settings, "Platform settings updated successfully"),
    );
});

/**
 * Get all pending offerings for admin review
 */
exports.getPendingOfferings = catchAsync(async (req, res, next) => {
  const {
    status,
    search,
    type,
    timeRange,
    startDate,
    endDate,
    page = 1,
    limit = 20,
  } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (status && status !== "ALL") where.status = status;
  if (type && type !== "ALL") where.type = type;

  // Date Filtering Logic
  if (timeRange && timeRange !== "ALL") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    if (timeRange === "today") {
      where.createdAt = { gte: start, lte: end };
    } else if (timeRange === "yesterday") {
      const yesterday = new Date(start);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayEnd = new Date(end);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      where.createdAt = { gte: yesterday, lte: yesterdayEnd };
    } else if (timeRange === "weekly") {
      const weekAgo = new Date(start);
      weekAgo.setDate(weekAgo.getDate() - 7);
      where.createdAt = { gte: weekAgo, lte: end };
    } else if (timeRange === "monthly") {
      const monthAgo = new Date(start);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      where.createdAt = { gte: monthAgo, lte: end };
    } else if (timeRange === "custom" && startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }
  }

  // Hub-based filtering for admins
  const { id, role: userRole } = req.user;
  const scopeWhere = {};
  
  if (userRole === "ADMIN") {
    const admin = await prisma.admin.findUnique({ where: { userId: id } });
    if (admin && admin.categoryIds?.length > 0) {
      scopeWhere.vendor = {
        categories: { some: { name: { in: admin.categoryIds } } },
      };
      where.vendor = scopeWhere.vendor;
    }
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { vendor: { businessName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [offerings, filteredTotal, statsGroupBy] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            city: true,
            userId: true,
            logoUrl: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.count({ where }),
    prisma.product.groupBy({
      by: ["status"],
      where: scopeWhere,
      _count: { id: true },
    }),
  ]);

  // Format stats
  const stats = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  statsGroupBy.forEach((item) => {
    const count = item._count.id;
    stats.total += count;
    if (item.status === "PENDING") stats.pending = count;
    if (item.status === "APPROVED") stats.approved = count;
    if (item.status === "REJECTED") stats.rejected = count;
  });

  res.status(200).json(
    new ApiResponse(200, {
      offerings,
      total: filteredTotal,
      stats,
      page: parseInt(page),
      totalPages: Math.ceil(filteredTotal / limit),
    }),
  );
});

exports.approveOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const offering = await prisma.product.update({
    where: { id: offeringId },
    data: { status: "APPROVED" },
    include: {
      vendor: {
        select: {
          userId: true,
          businessName: true,
          email: true,
          logoUrl: true,
          user: true,
        },
      },
    },
  });

  // Notify vendor
  await prisma.notification.create({
    data: {
      userId: offering.vendor.userId,
      title: "Offering Approved â",
      message: `Your ${offering.type.toLowerCase()} "${offering.name}" has been approved and is now visible to buyers on the marketplace.`,
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "APPROVE_PRODUCT",
    "OFFERING",
    `Approved offering: ${offering.name} from vendor ${offering.vendor.businessName}`,
    req.ip,
  );

  // Invalidate search cache
  await cacheService.clearCacheByPrefix("search:vendors");

  // Notify vendor via Email
  await notificationService.notifyProductApproval(
    offering.vendor,
    offering,
    req.user.role,
  );

  res.status(200).json(new ApiResponse(200, offering, "Offering approved"));
});

exports.rejectOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const { reason } = req.body;
  const offering = await prisma.product.update({
    where: { id: offeringId },
    data: { status: "REJECTED" },
    include: { vendor: { select: { userId: true, businessName: true } } },
  });

  // Notify vendor
  await prisma.notification.create({
    data: {
      userId: offering.vendor.userId,
      title: "Offering Rejected ❌",
      message: `Your ${offering.type.toLowerCase()} "${offering.name}" was not approved. ${reason ? "Reason: " + reason : "Please review your listing and resubmit."}`,
    },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "REJECT_PRODUCT",
    "OFFERING",
    `Rejected offering: ${offering.name}. Reason: ${reason || "N/A"}`,
    req.ip,
  );

  res.status(200).json(new ApiResponse(200, offering, "Offering rejected"));
});

/**
 * Admin Edit Offering (modify details before approve/reject)
 */
exports.editOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const {
    name,
    description,
    price,
    category,
    imageUrl,
    moq,
    availability,
    specifications,
    type,
    status,
  } = req.body;

  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = parseFloat(price) || 0;
  if (category !== undefined) updateData.category = category;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (moq !== undefined) updateData.moq = parseInt(moq) || 1;
  if (availability !== undefined) updateData.availability = !!availability;
  if (specifications !== undefined) updateData.specifications = specifications;
  if (type !== undefined) updateData.type = type;
  if (status !== undefined) updateData.status = status;

  const offering = await prisma.product.update({
    where: { id: offeringId },
    data: updateData,
    include: {
      vendor: {
        select: {
          id: true,
          businessName: true,
          city: true,
          userId: true,
          logoUrl: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  // Notify vendor if status changed
  if (status === "APPROVED") {
    await prisma.notification.create({
      data: {
        userId: offering.vendor.userId,
        title: "Offering Approved â",
        message: `Your ${offering.type.toLowerCase()} "${offering.name}" has been approved and is now visible to buyers on the marketplace.`,
      },
    });
  } else if (status === "REJECTED") {
    await prisma.notification.create({
      data: {
        userId: offering.vendor.userId,
        title: "Offering Rejected â",
        message: `Your ${offering.type.toLowerCase()} "${offering.name}" was not approved. Please review your listing and resubmit.`,
      },
    });
  }

  // Notify vendor if status changed to approved
  if (status === "APPROVED") {
    await notificationService.notifyProductApproval(
      offering.vendor,
      offering,
      req.user.role,
    );
  }

  res
    .status(200)
    .json(new ApiResponse(200, offering, "Offering updated successfully"));
});

/**
 * Category Management
 */
exports.createCategory = catchAsync(async (req, res, next) => {
  const { name, description, icon } = req.body;

  const category = await prisma.category.create({
    data: { name, description, icon },
  });

  // Create Audit Log
  await logAction(
    req.user.id,
    "CREATE_CATEGORY",
    "CATEGORY",
    `Created new category: ${name}`,
    req.ip,
  );

  res
    .status(201)
    .json(new ApiResponse(201, category, "Category created successfully"));
});

exports.adminGetAllCategories = catchAsync(async (req, res, next) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });
  res.status(200).json(new ApiResponse(200, categories));
});

exports.deleteCategory = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return next(new AppError("Category not found", 404));

  await prisma.category.delete({ where: { id } });

  // Create Audit Log
  await logAction(
    req.user.id,
    "DELETE_CATEGORY",
    "CATEGORY",
    `Permanently deleted category: ${category.name}`,
    req.ip,
  );

  res
    .status(200)
    .json(new ApiResponse(200, null, "Category deleted successfully"));
});

/**
 * Global Admin Broadcast
 */
exports.broadcastNotification = catchAsync(async (req, res, next) => {
  const { title, message, type, target } = req.body;

  let where = {};
  if (target === "ALL_VENDORS") where.role = "VENDOR";
  else if (target === "ALL_BUYERS") where.role = "BUYER";
  else if (target === "ADMIN") where.role = "ADMIN";

  const users = await prisma.user.findMany({
    where: {
      ...where,
      isActive: true,
    },
  });

  // Create notifications in bulk
  const notifications = users.map((user) => ({
    userId: user.id,
    title: `📢 ${title}`,
    message,
  }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({
      data: notifications,
    });
  }

  // Create Audit Log
  await logAction(
    req.user.id,
    "BROADCAST_NOTIFICATION",
    "USER",
    `Sent broadcast: ${title} to ${target}`,
    req.ip,
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, null, "Broadcast signal transmitted successfully"),
    );
});

// getActivityLogs
exports.getActivityLogs = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, module, action } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (module) where.module = module;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      logs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    }),
  );
});
