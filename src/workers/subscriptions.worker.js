const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const subscriptionService = require('../modules/subscriptions/subscriptions.service');

const subscriptionWorker = new Worker('subscription-jobs', async (job) => {
  console.log(`[SUBSCRIPTION-WORKER] Processing job: ${job.name}`);
  
  try {
    if (job.name === 'check-expiries') {
      await subscriptionService.checkAndProcessExpiries();
    }
  } catch (error) {
    console.error(`[SUBSCRIPTION-WORKER-ERROR] Job ${job.id} failed:`, error);
    throw error;
  }
}, { connection });

module.exports = subscriptionWorker;
