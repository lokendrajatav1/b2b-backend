const notificationService = require('./notification.service');
const whatsappService = require('./whatsapp.service');
const prisma = require('../config/prisma');

/**
 * Distribute an inquiry lead to relevant vendors based on ranking and plan.
 * Supports IDLE (Diamond-only) and INQUIRY (Ranking-based) types.
 */
/**
 * Distribute an inquiry lead to relevant vendors based on ranking and plan.
 *Supports Lead Type 1 (IDLE), Lead Type 2 (DIRECT - Skip), and Lead Type 3 (INQUIRY).
 */
const distributeInquiryLead = async (leadId) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { category: true }
  });

  if (!lead || lead.type === 'DIRECT') return;

  // Find eligible vendors in same city and category
  // Requirement 8: Same Category, Same City/Location
  const eligibleVendors = await prisma.vendor.findMany({
    where: {
      city: { equals: lead.city, mode: 'insensitive' },
      categories: { some: { id: lead.categoryId } },
      verified: true,
      user: { isActive: true }
    },
    include: {
      package: true,
      user: true
    }
  });

  if (eligibleVendors.length === 0) return;

  // Track previous assignments to enable Rotation and avoid duplicates
  const previousAssignments = await prisma.leadLifecycle.findMany({
    where: { leadId, action: { in: ['DISTRIBUTED', 'REDISTRIBUTED'] } }
  });
  
  const previousVendorIds = previousAssignments
    .map(a => {
      const match = a.details?.match(/\(([^)]+)\)$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  const availableVendors = eligibleVendors.filter(v => !previousVendorIds.includes(v.id));
  
  // Requirement 8: Ranking order & Type distribution
  let targetVendor;

  if (lead.type === 'IDLE') {
    // Lead Type 1: Search Idle Lead — Strictly Diamond vendors
    const diamondVendors = availableVendors
        .filter(v => v.package?.name?.toUpperCase() === 'DIAMOND')
        .sort((a, b) => b.totalScore - a.totalScore); // Ranking order within Diamond
    
    if (diamondVendors.length === 0) return;
    targetVendor = diamondVendors[0];
  } else {
    // Lead Type 3: Inquiry Form — Ranking order
    const rankedVendors = availableVendors.sort((a, b) => b.totalScore - a.totalScore);
    if (rankedVendors.length === 0) return;
    targetVendor = rankedVendors[0]; 
  }

  // Assign lead
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      vendorId: targetVendor.id,
      status: 'DISTRIBUTED',
      updatedAt: new Date()
    }
  });

  // Log lifecycle
  await prisma.leadLifecycle.create({
    data: {
      leadId,
      action: 'DISTRIBUTED',
      details: `Lead assigned to vendor ${targetVendor.businessName} (${targetVendor.id})`
    }
  });

  // Notify Vendor (Email, WhatsApp, In-App)
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

/**
 * Requirement 9: Follow-Up System (6-Day Redistribution)
 * Finds leads that haven't been resolved in 6 days and triggers redistribution.
 */
const processAgedLeads = async () => {
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

    // Find distributed leads that are exactly/older than 6 days and not yet followed up or closed
    const agedLeads = await prisma.lead.findMany({
        where: {
            status: 'DISTRIBUTED',
            followUpSent: false,
            createdAt: { lte: sixDaysAgo }
        }
    });

    for (const lead of agedLeads) {
        // In a real flow, we'd send an email/SMS to the BUYER asking "Did you close?"
        // If they click NO (or if we auto-check and no closure logged), we redistribute.
        // For this task, we assume "NO" if they haven't manually closed it on our end.
        
        console.log(`Processing aged lead feedback for ${lead.id}`);
        
        // Mark follow-up as sent
        await prisma.lead.update({
            where: { id: lead.id },
            data: { followUpSent: true }
        });

        // Trigger redistribution (Requirement 9)
        await redistributeLead(lead.id);
    }
};

/**
 * Redistribute a lead (Same category & same city)
 */
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
      action: 'REDISTRIBUTED',
      details: `Lead redistributed from vendor (${previousVendorId}) due to non-closure.`
    }
  });

  // Redistribute matching Requirements (Same category, Same city)
  await distributeInquiryLead(leadId);
};

/**
 * Recalculate Vendor Rankings based on the 40% Package / 60% Performance formula.
 */
const recalculateRankings = async (targetVendorId = null) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } }) || 
                   { rankingWeightProfile: 0.4, rankingWeightPerformance: 0.6 };

  const where = targetVendorId ? { id: targetVendorId } : {};
  const vendors = await prisma.vendor.findMany({
    where,
    include: {
      package: true,
      reviews: true,
      keywords: true,
    }
  });

  const maxPackagePriceRow = await prisma.package.findFirst({ orderBy: { price: 'desc' } });
  const maxPrice = maxPackagePriceRow?.price || 1;

  for (const vendor of vendors) {
    const packageWeight = (vendor.package?.price || 0) / maxPrice;

    const profileScore = vendor.profileCompleteness / 100;
    const responseScore = Math.max(0, 1 - (vendor.responseTime / 1000));

    const avgRating = vendor.reviews.length > 0 
      ? vendor.reviews.reduce((acc, r) => acc + r.rating, 0) / vendor.reviews.length 
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
