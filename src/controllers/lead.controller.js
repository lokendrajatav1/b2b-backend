const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const AppError = require('../utils/AppError');
const prisma = require('../config/prisma');
const leadService = require('../services/lead.service');

exports.createLead = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, searchKeyword, message } = req.body;

  const lead = await prisma.lead.create({
    data: {
      buyerName,
      phone,
      city,
      categoryId,
      searchKeyword,
      message,
      type: 'INQUIRY',
      status: 'PENDING'
    }
  });

  // Type 3: Inquiry Distribution (DISABLED - Only Admin Dashboard)
  // leadService.distributeInquiryLead(lead.id).catch(err => console.error("Lead distribution failed:", err));

  res.status(201).json(new ApiResponse(201, lead, "Inquiry submitted successfully."));
});

/**
 * Lead Type 1: Search Idle Lead (Triggered by 3 mins inactivity)
 */
exports.createIdleLead = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, searchKeyword, message } = req.body;

  const lead = await prisma.lead.create({
    data: {
      buyerName,
      phone,
      city,
      categoryId,
      searchKeyword,
      message,
      type: 'IDLE',
      status: 'PENDING'
    }
  });

  // Type 1: Idle Distribution (DISABLED - Only Admin Dashboard)
  // leadService.distributeInquiryLead(lead.id).catch(err => console.error("Idle lead distribution failed:", err));

  res.status(201).json(new ApiResponse(201, lead, "Idle lead captured."));
});

/**
 * Lead Type 2: Direct Action (Call / WhatsApp)
 */
exports.createDirectLead = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, vendorId, actionType, message: bodyMessage } = req.body;

  if (!vendorId || !actionType) {
    return next(new AppError('vendorId and actionType are required for direct leads', 400));
  }

  // Verify vendor exists
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return next(new AppError('Vendor not found', 404));

  const lead = await prisma.lead.create({
    data: {
      buyerName: buyerName ? buyerName.split(' ').map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ') : 'Anonymous Buyer',
      phone: phone || 'N/A',
      city: city || vendor.city,
      categoryId: categoryId || vendor.categories?.[0]?.id,
      // We set vendorId to null so the vendor doesn't see it in their panel.
      // Admin will see the target vendor in the message/logs.
      // Assign directly to the vendor being contacted
      vendorId: vendorId, 
      message: bodyMessage || `DIRECT ${actionType}: Interested in your business. Buyer Phone: ${phone || 'N/A'}`,
      type: 'DIRECT',
      status: 'DISTRIBUTED' 
    }
  });

  // Log lifecycle only, no redistribution
  await prisma.leadLifecycle.create({
    data: {
      leadId: lead.id,
      action: `DIRECT_${actionType}`, // e.g., DIRECT_WHATSAPP
      details: `User initiated a direct ${actionType} with the vendor.`
    }
  });

  res.status(201).json(new ApiResponse(201, lead, "Direct action logged."));
});

exports.getVendorLeads = catchAsync(async (req, res, next) => {
  // Vendors can only see their own leads
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
  console.log("[DEBUG-VENDOR-LEADS] Searching for VendorID:", vendor?.id, "for UserID:", req.user.id);
  if (!vendor && req.user.role !== 'SUPERADMIN') {
    return next(new AppError('Vendor profile not found', 404));
  }

  const targetVendorId = req.user.role === 'SUPERADMIN' ? req.params.vendorId : vendor.id;

  const leads = await prisma.lead.findMany({
    where: { vendorId: targetVendorId },
    orderBy: { createdAt: 'desc' },
    include: { lifecycle: true, category: true }
  });
  console.log(`[DEBUG-V-LEADS] Found ${leads.length} leads for VendorID: ${targetVendorId}`);

  res.status(200).json(new ApiResponse(200, leads));
});

/**
 * Protected: Vendor responds to a lead (Close or Redistribute)
 */
exports.updateLeadStatus = catchAsync(async (req, res, next) => {
  const { leadId } = req.params;
  const { status } = req.body; // 'CLOSED' or 'REDISTRIBUTE'

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return next(new AppError('Lead not found', 404));

  if (status === 'CLOSED') {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'CLOSED' }
    });

    await prisma.leadLifecycle.create({
      data: {
        leadId,
        action: 'CLOSED_BY_VENDOR',
        details: 'Vendor successfully closed the lead.'
      }
    });

    return res.status(200).json(new ApiResponse(200, null, 'Lead closed successfully'));
  }

  if (status === 'REDISTRIBUTE') {
    // Make redistribution non-blocking for faster UI response
    leadService.redistributeLead(leadId).catch(err => console.error("Background redistribution failed:", err));
    
    return res.status(200).json(new ApiResponse(200, null, 'Lead has been sent for redistribution'));
  }

  return next(new AppError('Invalid status update', 400));
});

/**
 * Smart Vendor Suggestion Engine ("Match With You" Form)
 * Requirement §19
 */
exports.matchWithYou = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, message } = req.body;

  if (!city || !categoryId) {
    return next(new AppError('City and Category are required for Smart Match', 400));
  }

  // 1. Find top matched vendors in city and category based on ranking
  const matchedVendors = await prisma.vendor.findMany({
    where: {
      city: { equals: city, mode: 'insensitive' },
      categories: { some: { id: categoryId } },
      verified: true,
      user: { isActive: true }
    },
    select: {
      id: true,
      businessName: true,
      city: true,
      totalScore: true,
      products: { select: { name: true }, take: 3 },
      package: { select: { name: true, priority: true } }
    },
    orderBy: [
      { package: { priority: 'desc' } }, // Package weight
      { totalScore: 'desc' } // Performance score
    ],
    take: 5 // Suggest top 5
  });

  // 2. Create the inquiry lead but mark it specially if needed, or distribute it
  const lead = await prisma.lead.create({
    data: {
      buyerName,
      phone,
      city,
      categoryId,
      message,
      type: 'INQUIRY',
      status: 'PENDING',
      searchKeyword: 'SMART_MATCH'
    }
  });

  // Distribute it natively as well (DISABLED - Admin handles assignment)
  // leadService.distributeInquiryLead(lead.id).catch(err => console.error("Match lead distribution failed:", err));

  res.status(200).json(new ApiResponse(200, {
    message: "We've matched you with the best vendors!",
    matchedVendors,
    leadId: lead.id
  }));
});