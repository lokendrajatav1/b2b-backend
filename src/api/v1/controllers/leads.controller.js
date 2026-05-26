const prisma = require("../../../config/prisma");
const catchAsync = require("../../../shared/helpers/catch-async");
const AppError = require("../../../shared/errors/app-error");
const ApiResponse = require("../../../shared/helpers/api-response");
const leadService = require("../../../modules/leads/leads.service");
const { addLeadToQueue } = require("../../../queues");

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

  addLeadToQueue(lead.id).catch(err => console.error("Lead queueing failed:", err));

  res.status(201).json(new ApiResponse(201, lead, "Inquiry submitted successfully."));
});

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

  addLeadToQueue(lead.id).catch(err => console.error("Idle lead queueing failed:", err));

  res.status(201).json(new ApiResponse(201, lead, "Idle lead captured."));
});

exports.createDirectLead = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, vendorId, actionType, message: bodyMessage } = req.body;

  if (!vendorId || !actionType) {
    return next(new AppError('vendorId and actionType are required for direct leads', 400));
  }

  const vendor = await prisma.vendor.findUnique({ 
    where: { id: vendorId },
    include: { categories: true }
  });
  if (!vendor) return next(new AppError('Vendor not found', 404));

  const resolvedCategoryId = categoryId || vendor.categories?.[0]?.id;
  if (!resolvedCategoryId) {
    return next(new AppError('Vendor has no category to associate with the lead', 400));
  }

  const lead = await prisma.lead.create({
    data: {
      buyerName: buyerName ? buyerName.split(' ').map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ') : 'Anonymous Buyer',
      phone: phone || 'N/A',
      city: city || vendor.city,
      categoryId: resolvedCategoryId,
      vendorId: vendorId, 
      message: bodyMessage || `DIRECT ${actionType}: Interested in your business. Buyer Phone: ${phone || 'N/A'}`,
      type: 'DIRECT',
      status: 'DISTRIBUTED' 
    }
  });

  await prisma.leadLifecycle.create({
    data: {
      leadId: lead.id,
      action: `DIRECT_${actionType}`,
      details: `User initiated a direct ${actionType} with the vendor.`
    }
  });

  res.status(201).json(new ApiResponse(201, lead, "Direct action logged."));
});

exports.getVendorLeads = catchAsync(async (req, res, next) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
  if (!vendor && req.user.role !== 'SUPERADMIN') {
    return next(new AppError('Vendor profile not found', 404));
  }

  const targetVendorId = req.user.role === 'SUPERADMIN' ? req.params.vendorId : vendor.id;

  const leads = await prisma.lead.findMany({
    where: { vendorId: targetVendorId },
    orderBy: { createdAt: 'desc' },
    include: { lifecycle: true, category: true }
  });

  res.status(200).json(new ApiResponse(200, leads));
});

exports.updateLeadStatus = catchAsync(async (req, res, next) => {
  const { leadId } = req.params;
  const { status } = req.body;

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
    leadService.redistributeLead(leadId).catch(err => console.error("Background redistribution failed:", err));
    return res.status(200).json(new ApiResponse(200, null, 'Lead has been sent for redistribution'));
  }

  return next(new AppError('Invalid status update', 400));
});

exports.matchWithYou = catchAsync(async (req, res, next) => {
  const { buyerName, phone, city, categoryId, message } = req.body;

  if (!city || !categoryId) {
    return next(new AppError('City and Category are required for Smart Match', 400));
  }

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
      { package: { priority: 'desc' } },
      { totalScore: 'desc' }
    ],
    take: 5
  });

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

  addLeadToQueue(lead.id).catch(err => console.error("Match lead queueing failed:", err));

  res.status(200).json(new ApiResponse(200, {
    message: "We've matched you with the best vendors!",
    matchedVendors,
    leadId: lead.id
  }));
});
