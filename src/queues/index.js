const { Queue } = require('bullmq');
const { connection } = require('../config/redis');

// Define Queues
const leadQueue = new Queue('lead-distribution', { connection });
const rankingQueue = new Queue('ranking-engine', { connection });
const notificationQueue = new Queue('notifications', { connection });
const subscriptionQueue = new Queue('subscription-jobs', { connection });

/**
 * Add a lead to the distribution queue
 */
const addLeadToQueue = async (leadId) => {
  await leadQueue.add('distribute', { leadId }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    }
  });
};

/**
 * Schedule repeatable jobs
 */
const scheduleRepeatableJobs = async () => {
  // Ranking recalculation every day at midnight
  await rankingQueue.add('recalculate', {}, {
    repeat: {
      pattern: '0 0 * * *'
    }
  });

  // Aged lead processing every hour
  await leadQueue.add('process-aged', {}, {
    repeat: {
      pattern: '0 * * * *'
    }
  });

  // Subscription expiry check every day at 2 AM
  await subscriptionQueue.add('check-expiries', {}, {
    repeat: {
      pattern: '0 2 * * *'
    }
  });
};

module.exports = {
  leadQueue,
  rankingQueue,
  notificationQueue,
  subscriptionQueue,
  addLeadToQueue,
  scheduleRepeatableJobs
};
