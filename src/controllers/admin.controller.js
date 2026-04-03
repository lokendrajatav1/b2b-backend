const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const cacheService = require('../services/cache.service');
const { logAction } = require('../utils/auditLogger');
const { decrypt } = require('../utils/encryption');

/**
 * Vendor Approval
 */
exports.approveVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { verified: true },
    include: { user: true }
  });

  // Upgrade user's role to VENDOR
  await prisma.user.update({
    where: { id: vendor.userId },
    data: { role: 'VENDOR' }
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: 'Business Verified!',
      message: 'Your business profile has been verified by the Admin. You are now eligible to receive leads.'
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'APPROVE_VENDOR', 'VENDOR', `Approved vendor: ${vendor.businessName}`, req.ip);

  // Clear Search Cache & Recalculate Initial Ranking
  const leadService = require('../services/lead.service');
  await leadService.recalculateRankings(vendorId);
  await cacheService.clearCacheByPrefix('search:vendors');

  res.status(200).json(new ApiResponse(200, vendor, "Vendor approved successfully"));
});

exports.unverifyVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { verified: false },
    include: { user: true }
  });

  // Create In-App Notification
  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: 'Verification Revoked',
      message: 'Your verification status has been revoked by the Admin. Please contact support for more details.'
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'UNVERIFY_VENDOR', 'VENDOR', `Unverified vendor: ${vendor.businessName}`, req.ip);

  res.status(200).json(new ApiResponse(200, vendor, "Vendor verification revoked"));
});

exports.rejectVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const { reason } = req.body || {};

  // First delete related records that would block deletion
  await prisma.product.deleteMany({ where: { vendorId } });
  await prisma.galleryImage.deleteMany({ where: { vendorId } });
  await prisma.certification.deleteMany({ where: { vendorId } });
  await prisma.ranking.deleteMany({ where: { vendorId } });
  await prisma.review.deleteMany({ where: { vendorId } });
  await prisma.transaction.deleteMany({ where: { vendorId } });
  await prisma.refund.deleteMany({ where: { vendorId } });
  
  // Note: Leads could be re-assigned or kept as historical data. 
  // If we delete the vendor, we nullify the vendorId on related leads.
  await prisma.lead.updateMany({
    where: { vendorId },
    data: { vendorId: null }
  });
  
  const vendor = await prisma.vendor.delete({
    where: { id: vendorId }
  });

  await prisma.notification.create({
    data: {
      userId: vendor.userId,
      title: 'Application Rejected',
      message: `Your vendor application was rejected. Reason: ${reason || 'Incomplete documentation'}`
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'REJECT_VENDOR', 'VENDOR', `Rejected vendor: ${vendor.businessName}. Reason: ${reason || 'N/A'}`, req.ip);

  res.status(200).json(new ApiResponse(200, null, "Vendor application rejected"));
});

/**
 * Get all vendors awaiting verification
 */
exports.getPendingVendors = catchAsync(async (req, res, next) => {
  const { search, city, status } = req.query;
  
  const where = {};
  
  if (status === 'VERIFIED') {
    where.verified = true;
  } else if (status === 'PENDING') {
    where.verified = false;
  } else {
    // Default or 'ALL'
    where.verified = false; // Keep default same as before for safety, or allow all
    if (status === 'ALL') delete where.verified;
  }
  
  if (city && city !== 'All Cities') {
    where.city = { contains: city, mode: 'insensitive' };
  }
  
  if (search) {
    where.OR = [
      { businessName: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
      { user: { email: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: { 
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          role: true
        }
      },
      categories: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Decrypt sensitive info for admins
  const decryptedVendors = vendors.map(vendor => ({
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null
  }));

  res.status(200).json(new ApiResponse(200, decryptedVendors));
});

/**
 * User & Vendor Management
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { role, isActive, search, page = 1, limit = 1000 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (role) where.role = role;
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  const users = await prisma.user.findMany({
    where,
    include: { 
      vendor: { include: { products: true, keywords: true, categories: true } },
      subAdmin: true
    },

    skip: parseInt(skip),
    take: parseInt(limit),
    orderBy: { createdAt: 'desc' }
  });

  const total = await prisma.user.count({ where });

  // Decrypt sensitive information if the user is a vendor
  const decryptedUsers = users.map(user => {
    if (user.vendor) {
      user.vendor.gstNumber = user.vendor.gstNumber ? decrypt(user.vendor.gstNumber) : null;
      user.vendor.aadhaarNumber = user.vendor.aadhaarNumber ? decrypt(user.vendor.aadhaarNumber) : null;
    }
    return user;
  });

  res.status(200).json(new ApiResponse(200, { users: decryptedUsers, total, page, totalPages: Math.ceil(total / limit) }));
});

exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { role, isActive } = req.body;

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role, isActive }
  });

  // Create Audit Log
  await logAction(req.user.id, 'UPDATE_USER_STATUS', 'USER', `Updated user ${userId} settings: Role=${role}, Active=${isActive}`, req.ip);

  res.status(200).json(new ApiResponse(200, user, "User updated successfully"));
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { vendor: true, subAdmin: true }
  });

  if (!user) return next(new AppError('User not found', 404));

  // 1. Delete user-level relations that block deletion (NOT role-specific)
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.review.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { userId } });

  // 2. Handle Vendor-specific data deletion
  if (user.role === 'VENDOR' && user.vendor) {
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
      data: { vendorId: null }
    });
    await prisma.vendor.delete({ where: { id: vendorId } });
  }

  // 3. Handle Sub-Admin specific data deletion
  if (user.role === 'SUBADMIN' && user.subAdmin) {
    await prisma.subAdmin.delete({ where: { userId: user.id } });
  }

  // 4. Delete the User record itself
  await prisma.user.delete({ where: { id: userId } });

  // Create Audit Log for THIS deletion action (using req.user.id who is the admin performing the delete)
  await logAction(req.user.id, 'DELETE_USER', 'USER', `Permanently deleted user: ${user.name || user.email} (${user.role})`, req.ip);

  res.status(200).json(new ApiResponse(200, null, "Member account and associated data removed successfully"));
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
      verificationDocument: true
    }
  });

  if (!vendor) return next(new AppError('Vendor not found', 404));

  // Decrypt sensitive data for Admin view
  const secureData = {
    ...vendor,
    gstNumber: vendor.gstNumber ? decrypt(vendor.gstNumber) : null,
    aadhaarNumber: vendor.aadhaarNumber ? decrypt(vendor.aadhaarNumber) : null
  };

  res.status(200).json(new ApiResponse(200, secureData, "Secure details retrieved"));
});

exports.reassignLead = catchAsync(async (req, res, next) => {
  const { leadId } = req.params;
  const { vendorId } = req.body;

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { vendorId, status: 'DISTRIBUTED' },
    include: { vendor: { include: { categories: true } } }
  });

  await prisma.leadLifecycle.create({
    data: {
      leadId,
      action: 'REASSIGNED_BY_ADMIN',
      details: `Admin manually reassigned lead to vendor ${lead.vendor.businessName}`
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'REASSIGN_LEAD', 'LEAD', `Reassigned lead ${leadId} to vendor ${lead.vendor.businessName}`, req.ip);

  res.status(200).json(new ApiResponse(200, lead, "Lead reassigned successfully"));
});

exports.manualBoostVendor = catchAsync(async (req, res, next) => {
  const { vendorId } = req.params;
  const { boostScore } = req.body; // e.g., 5.0 to add to total score

  const vendor = await prisma.vendor.update({
    where: { id: vendorId },
    data: { manualBoost: parseFloat(boostScore) }
  });

  const leadService = require('../services/lead.service');
  await leadService.recalculateRankings(vendorId);

  // Clear search cache so boost takes effect immediately
  const cacheService = require('../services/cache.service');
  await cacheService.clearCacheByPrefix('search:vendors');

  // Create Audit Log
  await logAction(req.user.id, 'BOOST_VENDOR', 'VENDOR', `Applied +${boostScore} manual boost to vendor ${vendor.businessName}`, req.ip);

  res.status(200).json(new ApiResponse(200, vendor, "Vendor boost applied and rankings recalculated"));
});

/**
 * Package & Pricing Management
 */
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const packages = await prisma.package.findMany();
  res.status(200).json(new ApiResponse(200, packages));
});

exports.createPackage = catchAsync(async (req, res, next) => {
  const { name, price, monthlyLeads, priority } = req.body;

  const pkg = await prisma.package.create({
    data: {
      name,
      price: parseFloat(price),
      monthlyLeads: parseInt(monthlyLeads),
      priority: parseInt(priority)
    }
  });

  res.status(201).json(new ApiResponse(201, pkg, "Subscription package initialized"));
});

exports.updatePackage = catchAsync(async (req, res, next) => {
  const { packageId } = req.params;
  const { name, price, monthlyLeads, priority } = req.body;

  const pkg = await prisma.package.update({
    where: { id: packageId },
    data: {
      name,
      price: price !== undefined ? parseFloat(price) : undefined,
      monthlyLeads: monthlyLeads !== undefined ? parseInt(monthlyLeads) : undefined,
      priority: priority !== undefined ? parseInt(priority) : undefined
    }
  });

  res.status(200).json(new ApiResponse(200, pkg, "Package tier updated"));
});

exports.deletePackage = catchAsync(async (req, res, next) => {
  const { packageId } = req.params;

  await prisma.package.delete({
    where: { id: packageId }
  });

  res.status(200).json(new ApiResponse(200, null, "Package tier decommissioned"));
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
      orderBy: { createdAt: 'desc' }
    }),
    prisma.transaction.count()
  ]);

  res.status(200).json(new ApiResponse(200, { transactions, total, page, totalPages: Math.ceil(total / limit) }));
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
    data: { isActive: !suspend }
  });

  // Create Audit Log
  await logAction(req.user.id, suspend ? 'SUSPEND_VENDOR' : 'UNSUSPEND_VENDOR', 'VENDOR', `${suspend ? 'Suspended' : 'Unsuspended'} vendor accounts linked to user ${vendor.userId}`, req.ip);

  res.status(200).json(new ApiResponse(200, null, suspend ? "Vendor suspended" : "Vendor unsuspended"));
});

/**
 * Comprehensive Analytics
 */
exports.getAnalytics = catchAsync(async (req, res, next) => {
  const [
    totalLeads,
    totalVendors,
    totalUsers,
    totalRevenue,
    activeSubscribers,
    pendingVendors,
    pendingOfferings,
    recentLeads,
    leadsByStatus,
    vendorKeywords,
    leadLocations
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.vendor.count({ where: { verified: true } }),
    prisma.user.count(),
    prisma.transaction.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true }
    }),
    prisma.vendor.count({ where: { packageId: { not: null } } }),
    prisma.vendor.count({ where: { verified: false } }),
    prisma.product.count({ where: { status: 'PENDING' } }),
    prisma.lead.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { businessName: true } } }
    }),
    prisma.lead.groupBy({
      by: ['status'],
      _count: { id: true }
    }),
    // 3. Top Keywords (Insights snippet)
    prisma.keyword.findMany({
      include: { _count: { select: { vendors: true } } },
      orderBy: { vendors: { _count: 'desc' } },
      take: 5
    }),
    // 4. City Rankings (Location snippet)
    prisma.lead.groupBy({
      by: ['city'],
      _count: { id: true },
      orderBy: { _count: { city: 'desc' } },
      take: 5
    })
  ]);

  res.status(200).json(new ApiResponse(200, {
    summary: {
      totalLeads,
      totalVendors,
      totalUsers,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeSubscribers,
      pendingVendors,
      pendingOfferings,
      leadsByStatus
    },
    recentLeads,
    trends: {
      topKeywords: vendorKeywords.map(k => ({ name: k.name, count: k._count.vendors })),
      topLocations: leadLocations.map(l => ({ name: l.city, count: l._count.id }))
    }
  }, "Full platform analytics dataset retrieved"));
});

/**
 * Keyword & Category Analytics
 */
exports.getKeywordAnalytics = catchAsync(async (req, res, next) => {
  // 1. Top Keywords from Vendors (Profiles)
  const vendorKeywords = await prisma.keyword.findMany({
    include: { _count: { select: { vendors: true } } },
    orderBy: { vendors: { _count: 'desc' } },
    take: 10
  });

  // 2. Keyword-wise Leads (Demand Analysis)
  const leadKeywords = await prisma.lead.groupBy({
    by: ['searchKeyword'],
    where: { searchKeyword: { not: null } },
    _count: { id: true },
    orderBy: { _count: { searchKeyword: 'desc' } },
    take: 10
  });

  res.status(200).json(new ApiResponse(200, { vendorKeywords, leadKeywords }));
});

/**
 * Performance & Conversion Analytics
 */
exports.getPerformanceAnalytics = catchAsync(async (req, res, next) => {
  const [
    totalLeads,
    closedLeads,
    categoryPerformance,
    planComparison
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: 'CLOSED' } }),
    prisma.category.findMany({
      include: {
        _count: { select: { leads: true, vendors: true } },
      },
      take: 10
    }),
    prisma.package.findMany({
      include: {
        _count: { select: { vendors: true } },
        vendors: {
          select: { _count: { select: { leads: true } } }
        }
      }
    })
  ]);

  // Calculate closure rate
  const closureRate = totalLeads > 0 ? (closedLeads / totalLeads) * 100 : 0;

  // Process plan Leads distribution
  const planData = planComparison.map(p => {
    const totalLeadsForPlan = p.vendors.reduce((acc, v) => acc + v._count.leads, 0);
    return {
      name: p.name,
      vendorCount: p._count.vendors,
      totalLeads: totalLeadsForPlan,
      avgLeadsPerVendor: p._count.vendors > 0 ? totalLeadsForPlan / p._count.vendors : 0
    };
  });

  res.status(200).json(new ApiResponse(200, {
    conversion: {
      totalLeads,
      closedLeads,
      closureRate: closureRate.toFixed(2) + '%'
    },
    categoryPerformance,
    planComparison: planData
  }));
});


/**
 * Location Analytics
 */
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const [users, vendors, leads, revenue] = await Promise.all([
    prisma.user.count(),
    prisma.vendor.count({ where: { verified: true } }),
    prisma.lead.count(),
    prisma.transaction.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amount: true }
    })
  ]);

  res.status(200).json(new ApiResponse(200, {
    users,
    vendors,
    leads,
    revenue: revenue._sum.amount || 0
  }));
});

exports.getVendorApprovals = catchAsync(async (req, res, next) => {
  const vendors = await prisma.vendor.findMany({
    where: { verified: false },
    include: {
      user: { select: { name: true, email: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  res.status(200).json(new ApiResponse(200, vendors));
});

exports.getLocationAnalytics = catchAsync(async (req, res, next) => {
  const vendorLocations = await prisma.vendor.groupBy({
    by: ['city'],
    _count: { id: true },
    orderBy: { _count: { city: 'desc' } }
  });

  const leadLocations = await prisma.lead.groupBy({
    by: ['city'],
    _count: { id: true },
    orderBy: { _count: { city: 'desc' } }
  });

  res.status(200).json(new ApiResponse(200, { vendorLocations, leadLocations }));
});

/**
 * Lead Monitoring (List View)
 */
exports.getAllLeads = catchAsync(async (req, res, next) => {
  const { status, city, categoryId, page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (status) where.status = status;
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (categoryId) where.categoryId = categoryId;

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { vendor: { include: { categories: true } }, category: true },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.lead.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, { 
    leads, 
    total, 
    page: parseInt(page), 
    totalPages: Math.ceil(total / limit) 
  }));
});

const seoService = require('../services/seo.service');

/**
 * Google Merchant Product Feed
 */
exports.getGoogleMerchantFeed = catchAsync(async (req, res, next) => {
  const feed = await seoService.generateMerchantFeed();
  res.status(200).json(new ApiResponse(200, feed, "Google Merchant feed generated successfully"));
});



exports.getSettings = catchAsync(async (req, res, next) => {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 'global' }
  });
  
  // Return defaults if not found
  if (!settings) {
    return res.status(200).json(new ApiResponse(200, {
      rankingWeightProfile: 0.4,
      rankingWeightPerformance: 0.6
    }));
  }
  
  res.status(200).json(new ApiResponse(200, settings));
});

exports.updateSettings = catchAsync(async (req, res, next) => {
  const { rankingWeightProfile, rankingWeightPerformance } = req.body;

  const settings = await prisma.systemSettings.upsert({
    where: { id: 'global' },
    update: {
      rankingWeightProfile: parseFloat(rankingWeightProfile),
      rankingWeightPerformance: parseFloat(rankingWeightPerformance)
    },
    create: {
      id: 'global',
      rankingWeightProfile: parseFloat(rankingWeightProfile) || 0.4,
      rankingWeightPerformance: parseFloat(rankingWeightPerformance) || 0.6
    }
  });

  res.status(200).json(new ApiResponse(200, settings, "Platform settings updated successfully"));
});

/**
 * Get all pending offerings for admin review
 */
exports.getPendingOfferings = catchAsync(async (req, res, next) => {
  const { status, search, type, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (type) where.type = type;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { vendor: { businessName: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const [offerings, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            city: true,
            userId: true,
            user: { select: { name: true, email: true } }
          }
        }
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.product.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, {
    offerings,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  }));
});

exports.approveOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const offering = await prisma.product.update({
    where: { id: offeringId },
    data: { status: 'APPROVED' },
    include: { vendor: { select: { userId: true, businessName: true } } }
  });

  // Notify vendor
  await prisma.notification.create({
    data: {
      userId: offering.vendor.userId,
      title: 'Offering Approved â',
      message: `Your ${offering.type.toLowerCase()} "${offering.name}" has been approved and is now visible to buyers on the marketplace.`
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'APPROVE_PRODUCT', 'OFFERING', `Approved offering: ${offering.name} from vendor ${offering.vendor.businessName}`, req.ip);

  // Invalidate search cache
  await cacheService.clearCacheByPrefix('search:vendors');

  res.status(200).json(new ApiResponse(200, offering, "Offering approved"));
});

exports.rejectOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const { reason } = req.body;
  const offering = await prisma.product.update({
    where: { id: offeringId },
    data: { status: 'REJECTED' },
    include: { vendor: { select: { userId: true, businessName: true } } }
  });

  // Notify vendor
  await prisma.notification.create({
    data: {
      userId: offering.vendor.userId,
      title: 'Offering Rejected ❌',
      message: `Your ${offering.type.toLowerCase()} "${offering.name}" was not approved. ${reason ? 'Reason: ' + reason : 'Please review your listing and resubmit.'}`
    }
  });

  // Create Audit Log
  await logAction(req.user.id, 'REJECT_PRODUCT', 'OFFERING', `Rejected offering: ${offering.name}. Reason: ${reason || 'N/A'}`, req.ip);

  res.status(200).json(new ApiResponse(200, offering, "Offering rejected"));
});

/**
 * Admin Edit Offering (modify details before approve/reject)
 */
exports.editOffering = catchAsync(async (req, res, next) => {
  const { offeringId } = req.params;
  const { name, description, price, category, imageUrl, moq, availability, specifications, type, status } = req.body;

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
          user: { select: { name: true, email: true } }
        }
      }
    }
  });

  // Notify vendor if status changed
  if (status === 'APPROVED') {
    await prisma.notification.create({
      data: {
        userId: offering.vendor.userId,
        title: 'Offering Approved â',
        message: `Your ${offering.type.toLowerCase()} "${offering.name}" has been approved and is now visible to buyers on the marketplace.`
      }
    });
  } else if (status === 'REJECTED') {
    await prisma.notification.create({
      data: {
        userId: offering.vendor.userId,
        title: 'Offering Rejected â',
        message: `Your ${offering.type.toLowerCase()} "${offering.name}" was not approved. Please review your listing and resubmit.`
      }
    });
  }

  res.status(200).json(new ApiResponse(200, offering, "Offering updated successfully"));
});

/**
 * Category Management
 */
exports.createCategory = catchAsync(async (req, res, next) => {
  const { name, description, icon } = req.body;
  
  const category = await prisma.category.create({
    data: { name, description, icon }
  });
  
  // Create Audit Log
  await logAction(req.user.id, 'CREATE_CATEGORY', 'CATEGORY', `Created new category: ${name}`, req.ip);

  res.status(201).json(new ApiResponse(201, category, "Category created successfully"));
});

exports.adminGetAllCategories = catchAsync(async (req, res, next) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' }
  });
  res.status(200).json(new ApiResponse(200, categories));
});

exports.deleteCategory = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return next(new AppError('Category not found', 404));

  await prisma.category.delete({ where: { id } });
  
  // Create Audit Log
  await logAction(req.user.id, 'DELETE_CATEGORY', 'CATEGORY', `Permanently deleted category: ${category.name}`, req.ip);

  res.status(200).json(new ApiResponse(200, null, "Category deleted successfully"));
});

/**
 * Global Admin Broadcast
 */
exports.broadcastNotification = catchAsync(async (req, res, next) => {
  const { title, message, type, target } = req.body;

  let where = {};
  if (target === 'ALL_VENDORS') where.role = 'VENDOR';
  else if (target === 'ALL_BUYERS') where.role = 'BUYER';
  else if (target === 'SUBADMIN') where.role = 'SUBADMIN';

  const users = await prisma.user.findMany({ 
    where: {
      ...where,
      isActive: true
    } 
  });

  // Create notifications in bulk
  const notifications = users.map(user => ({
    userId: user.id,
    title: `📢 ${title}`,
    message,
  }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({
      data: notifications
    });
  }

  // Create Audit Log
  await logAction(req.user.id, 'BROADCAST_NOTIFICATION', 'USER', `Sent broadcast: ${title} to ${target}`, req.ip);

  res.status(200).json(new ApiResponse(200, null, "Broadcast signal transmitted successfully"));
});

/**
 * Activity Logs / History (Main Admin only)
 */
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
        user: { select: { name: true, email: true, role: true } }
      },
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.auditLog.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, {
    logs,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit)
  }));
});

