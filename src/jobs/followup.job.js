const cron = require('node-cron');
const prisma = require('../config/prisma');
const notificationService = require('../services/notification.service');
const leadService = require('../services/lead.service');

// Run every day at 1:00 AM
const job = cron.schedule('0 1 * * *', async () => {
  console.log('Running lead follow-up checks...');
  
  const sixDaysAgo = new Date();
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

  // 1. Prompts for leads at exactly 5 days (1 day before expiry)
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  
  const followUpLeads = await prisma.lead.findMany({
    where: {
      status: 'DISTRIBUTED',
      followUpSent: false,
      updatedAt: { lte: fiveDaysAgo, gt: sixDaysAgo }
    },
    include: { vendor: true }
  });

  for (const lead of followUpLeads) {
    if (lead.vendor) {
      await prisma.notification.create({
        data: {
          userId: lead.vendor.userId,
          title: 'Did you close this lead?',
          message: `The lead from ${lead.buyerName} is expiring tomorrow. Please mark it as CLOSED or we will redistribute it to another vendor.`
        }
      });
      await notificationService.sendWhatsApp(
        lead.vendor.phone,
        `⏳ *Lead Expiring Soon* \n\nHi ${lead.vendor.businessName}, the lead from ${lead.buyerName} expires tomorrow. \n\nPlease login to your B2B dashboard and mark it as CLOSED if you secured the business, or it will be redistributed automatically.`
      );
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { followUpSent: true }
    });
  }

  // 2. Find leads that were distributed 6+ days ago and are still not closed
  const staleLeads = await prisma.lead.findMany({
    where: {
      status: 'DISTRIBUTED',
      updatedAt: {
        lte: sixDaysAgo
      }
    }
  });

  for (const lead of staleLeads) {
    // Logic: If vendor hasn't closed it in 6 days, we assume "NO" and REDISTRIBUTE
    console.log(`Lead ${lead.id} exceeded 6-day threshold. Redistributing...`);
    
    await leadService.redistributeLead(lead.id);

    // Notify the *previous* vendor that the lead was taken away
    // (Optional but good for UX)
    if (lead.vendorId) {
       const vendor = await prisma.vendor.findUnique({ 
         where: { id: lead.vendorId },
         include: { user: true }
       });
       
       if (vendor) {
         await prisma.notification.create({
           data: {
             userId: vendor.userId,
             title: 'Lead Expired & Redistributed',
             message: `The lead from ${lead.buyerName} was redistributed as it was not closed within 6 days.`
           }
         });
       }
    }
  }
}, {
  scheduled: process.env.NODE_ENV !== 'test'
});

if (process.env.NODE_ENV !== 'test') {
  console.log('Lead follow-up job scheduled');
}

module.exports = job;
