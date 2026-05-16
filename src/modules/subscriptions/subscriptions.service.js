const prisma = require('../../config/prisma');

/**
 * Subscription Service — Handles plan lifecycle operations
 */

/**
 * Check if a vendor's subscription is active
 */
const isSubscriptionActive = async (vendorId) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor?.planExpiry) return false;
  return new Date(vendor.planExpiry) > new Date();
};

/**
 * Get vendor's upgrade history (all transactions)
 */
const getUpgradeHistory = async (vendorId) => {
  return prisma.transaction.findMany({
    where: { vendorId, status: 'COMPLETED' },
    include: { package: true },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Requirement 11: Check and process all vendor plan expiries
 */
const checkAndProcessExpiries = async () => {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneDay = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  // 1. Auto-downgrade expired plans
  const expiredVendors = await prisma.vendor.findMany({
    where: {
      planExpiry: { lte: now },
      packageId: { not: null }
    }
  });

  for (const vendor of expiredVendors) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { packageId: null, planExpiry: null }
    });

    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: '⚠️ Subscription Expired',
        message: 'Your subscription has expired. Your listing has been downgraded. Renew now to restore your ranking.'
      }
    });

    console.log(`[SUBSCRIPTION-SERVICE] Vendor ${vendor.id} plan expired and downgraded.`);
  }

  // Recalculate rankings for expired vendors
  if (expiredVendors.length > 0) {
    const { recalculateRankings } = require('../leads/leads.service');
    await recalculateRankings();
  }

  // 2. Send reminders for upcoming expiry
  const reminderWindows = [
    { start: now, end: oneDay, label: '1 day' },
    { start: oneDay, end: threeDays, label: '3 days' },
    { start: threeDays, end: sevenDays, label: '7 days' },
  ];

  for (const window of reminderWindows) {
    const vendorsExpiringSoon = await prisma.vendor.findMany({
      where: {
        planExpiry: { gte: window.start, lte: window.end },
        packageId: { not: null }
      }
    });

    for (const vendor of vendorsExpiringSoon) {
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: vendor.userId,
          title: { contains: `${window.label} remaining` },
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
        }
      });

      if (!existingNotification) {
        await prisma.notification.create({
          data: {
            userId: vendor.userId,
            title: `🔔 Subscription: ${window.label} remaining`,
            message: `Your subscription expires in ${window.label}. Renew now to maintain your ranking and lead priority.`
          }
        });
      }
    }
  }
};

module.exports = { isSubscriptionActive, getUpgradeHistory, checkAndProcessExpiries };
