const IORedis = require('ioredis');

const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null })
  : new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
  });


connection.on('error', (err) => {
  console.error('[REDIS-ERROR]', err.message);
});

connection.on('connect', () => {
  console.log('[REDIS] Connected successfully.');
});

module.exports = { connection };
