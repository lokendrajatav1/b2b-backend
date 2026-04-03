const cron = require('node-cron');
const leadService = require('../services/lead.service');

// Run every 24 hours at midnight
const job = cron.schedule('0 0 * * *', async () => {
  console.log('Running daily ranking recalculation...');
  try {
    await leadService.recalculateRankings();
    console.log('Ranking recalculation complete.');
  } catch (error) {
    console.error('Error in ranking recalculation job:', error);
  }
}, {
  scheduled: process.env.NODE_ENV !== 'test'
});

if (process.env.NODE_ENV !== 'test') {
  console.log('Ranking job scheduled');
}

module.exports = job;
