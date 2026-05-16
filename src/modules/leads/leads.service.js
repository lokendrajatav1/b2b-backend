const prisma = require("../../config/prisma");
const notificationService = require("../notifications/notifications.service");
const whatsappService = require("../../services/whatsapp"); // Pointing to the modular whatsapp service

/**
 * Normalize city names for better matching
 */
const normalizeCity = (city) => {
  if (!city) return '';
  const c = city.trim().toLowerCase();
  if (c === 'bangalore' || c === 'bengaluru') return 'bangalore';
  if (c === 'bombay' || c === 'mumbai') return 'mumbai';
  if (c === 'calcutta' || c === 'kolkata') return 'kolkata';
  if (c === 'madras' || c === 'chennai') return 'chennai';
  if (c === 'gurgaon' || c === 'gurugram') return 'gurugram';
  return c;
};

const distributeInquiryLead = async (leadId) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { category: true }
  });

  const leadCity = normalizeCity(lead.city);
  
  const allVendors = await prisma.vendor.findMany({
    where: {
      categories: { some: { id: lead.categoryId } },
      verified: true,
      user: { isActive: true }
    },
    include: {
      package: true,
      user: true
    }
  });

  const eligibleVendors = allVendors.filter(v => normalizeCity(v.city) === leadCity);

  if (eligibleVendors.length === 0) return;

  const previousAssignments = await prisma.leadLifecycle.findMany({
    where: { leadId, action: { in: ['DISTRIBUTED', 'REDISTRIBUTED'] } }
  });
  
  const previousVendorIds = previousAssignments.map(a => a.vendorId).filter(Boolean);
  const availableVendors = eligibleVendors.filter(v => !previousVendorIds.includes(v.id));
  
  let targetVendor;

  if (lead.type === 'IDLE') {
    const diamondVendors = availableVendors
        .filter(v => v.package?.name?.toUpperCase() === 'DIAMOND')
        .sort((a, b) => b.totalScore - a.totalScore); 
    
    if (diamondVendors.length === 0) return;
    targetVendor = diamondVendors[0];
  } else {
    const rankedVendors = availableVendors.sort((a, b) => b.totalScore - a.totalScore);
    if (rankedVendors.length === 0) return;
    targetVendor = rankedVendors[0]; 
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      vendorId: targetVendor.id,
      status: 'DISTRIBUTED',
      updatedAt: new Date()
    }
  });

  await prisma.leadLifecycle.create({
    data: {
      leadId,
      vendorId: targetVendor.id,
      action: 'DISTRIBUTED',
      details: `Lead assigned to vendor ${targetVendor.businessName}`
    }
  });

  notificationService.notifyVendorOfLead(targetVendor, lead).catch(() => {});
  whatsappService.notifyVendorWhatsApp(targetVendor, lead).catch(() => {});
  
  await prisma.notification.create({
    data: {
      userId: targetVendor.userId,
      title: 'New Lead Opportunity',
      message: `New ${lead.type} lead from ${lead.buyerName}.`
    }
  });
};

const processAgedLeads = async () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

    const agedLeads = await prisma.lead.findMany({
        where: {
            status: 'DISTRIBUTED',
            followUpSent: false,
            createdAt: { lte: sixDaysAgo }
        }
    });

    for (const lead of agedLeads) {
        await prisma.lead.update({
            where: { id: lead.id },
            data: { followUpSent: true }
        });
        await redistributeLead(lead.id);
    }
};

const redistributeLead = async (leadId) => {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.status === 'CLOSED') return;

  const previousVendorId = lead.vendorId;

  await prisma.lead.update({
    where: { id: leadId },
    data: { 
      vendorId: null, 
      status: 'PENDING',
      updatedAt: new Date()
    }
  });

  await prisma.leadLifecycle.create({
    data: {
      leadId,
      vendorId: previousVendorId,
      action: 'REDISTRIBUTED',
      details: `Lead redistributed due to non-closure.`
    }
  });

  const { addLeadToQueue } = require('../../queues');
  await addLeadToQueue(leadId);
};

const recalculateRankings = async (targetVendorId = null) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } }) || 
                   { rankingWeightProfile: 0.4, rankingWeightPerformance: 0.6 };

  const where = targetVendorId ? { id: targetVendorId } : {};
  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      package: true,
      reviewsReceived: true,
      keywords: true,
    }
  });

  const maxPackagePriceRow = await prisma.package.findFirst({ orderBy: { price: 'desc' } });
  const maxPrice = maxPackagePriceRow?.price || 1;

  for (const vendor of vendors) {
    const packageWeight = (vendor.package?.price || 0) / maxPrice;
    const profileScore = vendor.profileCompleteness / 100;
    const responseScore = Math.max(0, 1 - (vendor.responseTime / 1000));

    const avgRating = vendor.reviewsReceived.length > 0 
      ? vendor.reviewsReceived.reduce((acc, r) => acc + r.rating, 0) / vendor.reviewsReceived.length 
      : 0;
    const reviewScore = avgRating / 5;

    const keywordScore = Math.min(1, vendor.keywords.length / 10);
    const engagementScore = (vendor.leadClosureRate * 0.7) + (Math.min(1, vendor.loginFrequency / 30) * 0.3);

    const performanceScore = (profileScore * 0.2) + (responseScore * 0.2) + 
                            (reviewScore * 0.3) + (keywordScore * 0.1) + 
                            (engagementScore * 0.2);

    const totalScore = (packageWeight * settings.rankingWeightProfile) + 
                      (performanceScore * settings.rankingWeightPerformance) +
                      vendor.manualBoost;

    await prisma.$transaction([
      prisma.vendor.update({
        where: { id: vendor.id },
        data: { totalScore: parseFloat(totalScore.toFixed(4)) }
      }),
      prisma.ranking.create({
        data: { vendorId: vendor.id, score: totalScore }
      })
    ]);
  }
};

module.exports = { distributeInquiryLead, recalculateRankings, redistributeLead, processAgedLeads };
