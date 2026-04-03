const cron = require('node-cron');
const leadService = require('../services/lead.service');

/**
 * Initialize Cron Jobs
 */
const initCrons = () => {
    console.log('Initializing Background Service Crons...');

    /**
     * Requirement 9: Follow-Up System
     * Runs every day at 1:00 AM
     * Checks for 6-day old leads and redistributes them if unresolved
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
};

module.exports = { initCrons };
