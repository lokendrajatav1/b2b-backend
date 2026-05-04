const cron = require('node-cron');
const leadService = require('../services/lead.service');
const prisma = require('../config/prisma');
const notificationService = require('../services/notification.service');

/**
 * Shared helper: find vendors expiring in exactly N days and notify them
 */
async function sendExpiryReminder(daysLeft) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysLeft);
    targetDate.setHours(0, 0, 0, 0);

    const targetEnd = new Date(targetDate);
    targetEnd.setHours(23, 59, 59, 999);

    const vendors = await prisma.vendor.findMany({
        where: {
            planExpiry: { gte: targetDate, lte: targetEnd },
            packageId: { not: null }
        },
        include: { package: true }
    });

    console.log(`CRON: Found ${vendors.length} vendor(s) expiring in ${daysLeft} day(s).`);

    for (const vendor of vendors) {
        try {
            const expiry = vendor.planExpiry?.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            await notificationService.notifySubscriptionEvent(vendor, 'EXPIRY_WARNING', {
                daysLeft,
                packageName: vendor.package?.name || 'current plan',
                expiry
            });

            const user = await prisma.user.findFirst({ where: { id: vendor.userId } });
            if (user) {
                await prisma.notification.create({
                    data: {
                        userId: user.id,
                        title: `⏳ Subscription Expiring in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
                        message: `Your ${vendor.package?.name || 'plan'} expires on ${expiry}. Renew now to keep your listing active.`
                    }
                });
            }

            console.log(`CRON: ${daysLeft}-day reminder sent → ${vendor.businessName}`);
        } catch (err) {
            console.error(`CRON ERROR: Reminder failed for ${vendor.businessName}:`, err);
        }
    }
}

/**
 * Initialize Cron Jobs
 */
const initCrons = () => {
    console.log('Initializing Background Service Crons...');

    /**
     * Requirement 9: Follow-Up System
     * Runs every day at 1:00 AM
     */
    cron.schedule('0 1 * * *', async () => {
        console.log('CRON: Processing 6-day aged leads for redistribution...');
        try {
            await leadService.processAgedLeads();
        } catch (error) {
            console.error('CRON ERROR: Aged lead processing failed:', error);
        }
    });

    /**
     * Daily Ranking Recalculation
     * Runs every day at 3:00 AM
     */
    cron.schedule('0 3 * * *', async () => {
        console.log('CRON: Recalculating system-wide vendor rankings...');
        try {
            await leadService.recalculateRankings();
        } catch (error) {
            console.error('CRON ERROR: Ranking recalculation failed:', error);
        }
    });

    /**
     * Subscription Expiry Reminder — 7 Days Before
     * Runs every day at 9:00 AM
     */
    cron.schedule('0 9 * * *', async () => {
        console.log('CRON: Checking subscriptions expiring in 7 days...');
        try {
            await sendExpiryReminder(7);
        } catch (error) {
            console.error('CRON ERROR: 7-day expiry check failed:', error);
        }
    });

    /**
     * Subscription Expiry Reminder — 3 Days Before
     * Runs every day at 9:05 AM
     */
    cron.schedule('5 9 * * *', async () => {
        console.log('CRON: Checking subscriptions expiring in 3 days...');
        try {
            await sendExpiryReminder(3);
        } catch (error) {
            console.error('CRON ERROR: 3-day expiry check failed:', error);
        }
    });

    /**
     * Subscription Expiry Reminder — 1 Day Before
     * Runs every day at 9:10 AM
     */
    cron.schedule('10 9 * * *', async () => {
        console.log('CRON: Checking subscriptions expiring in 1 day...');
        try {
            await sendExpiryReminder(1);
        } catch (error) {
            console.error('CRON ERROR: 1-day expiry check failed:', error);
        }
    });

    /**
     * Auto-Downgrade Expired Subscriptions
     * Runs every day at 10:00 AM
     * Finds vendors whose plan has expired and removes their package
     */
    cron.schedule('0 10 * * *', async () => {
        console.log('CRON: Auto-downgrading expired subscriptions...');
        try {
            const now = new Date();
            const expiredVendors = await prisma.vendor.findMany({
                where: {
                    planExpiry: { lt: now },
                    packageId: { not: null }
                },
                include: { package: true }
            });

            console.log(`CRON: Found ${expiredVendors.length} expired vendor(s).`);

            for (const vendor of expiredVendors) {
                try {
                    // Remove subscription
                    await prisma.vendor.update({
                        where: { id: vendor.id },
                        data: { packageId: null }
                    });

                    // In-app notification
                    const user = await prisma.user.findFirst({ where: { id: vendor.userId } });
                    if (user) {
                        await prisma.notification.create({
                            data: {
                                userId: user.id,
                                title: '⚠️ Subscription Expired',
                                message: `Your ${vendor.package?.name || 'plan'} subscription has expired. Renew now to keep your listing active.`
                            }
                        });
                    }

                    // Email + WhatsApp
                    await notificationService.notifySubscriptionEvent(vendor, 'EXPIRED', {});

                    // Recalculate ranking (without premium boost)
                    await leadService.recalculateRankings(vendor.id);

                    console.log(`CRON: Downgraded vendor: ${vendor.businessName}`);
                } catch (err) {
                    console.error(`CRON ERROR: Failed to downgrade vendor ${vendor.businessName}:`, err);
                }
            }
        } catch (error) {
            console.error('CRON ERROR: Auto-downgrade failed:', error);
        }
    });
};

module.exports = { initCrons };
