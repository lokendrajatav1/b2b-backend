const cron = require('node-cron');
const prisma = require('../config/prisma');
const leadService = require('../services/lead.service');

// Run every day at 2:00 AM — Check expiring subscriptions
const job = cron.schedule('0 2 * * *', async () => {
  console.log('Running subscription expiry checks...');
  
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const oneDay = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  try {
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

      console.log(`Vendor ${vendor.id} plan expired and downgraded.`);
    }

    // Recalculate rankings for expired vendors
    if (expiredVendors.length > 0) {
      await leadService.recalculateRankings();
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
        // Check if we already sent a reminder for this window
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

    console.log('Subscription expiry checks completed');
  } catch (err) {
    console.error('Error in subscription expiry job:', err);
  }
}, {
  scheduled: process.env.NODE_ENV !== 'test'
});

if (process.env.NODE_ENV !== 'test') {
  console.log('Subscription expiry job scheduled');
}

module.exports = job;
