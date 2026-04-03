const prisma = require('../config/prisma');

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

module.exports = { isSubscriptionActive, getUpgradeHistory };
