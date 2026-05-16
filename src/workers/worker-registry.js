// Import workers to start them
require('./leads.worker');
require('./ranking.worker');
require('./subscriptions.worker');

console.log('[QUEUES] BullMQ Workers initialized successfully.');
