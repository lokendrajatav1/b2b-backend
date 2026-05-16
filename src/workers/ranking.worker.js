const { Worker } = require('bullmq');
const { connection } = require('../config/redis');
const leadService = require('../modules/leads/leads.service');

const rankingWorker = new Worker('ranking-engine', async (job) => {
  console.log(`[RANKING-WORKER] Processing job: ${job.name}`);
  
  try {
    if (job.name === 'recalculate') {
      const { vendorId } = job.data || {};
      await leadService.recalculateRankings(vendorId);
    }
  } catch (error) {
    console.error(`[RANKING-WORKER-ERROR] Failed:`, error);
    throw error;
  }
}, { connection });

module.exports = rankingWorker;
