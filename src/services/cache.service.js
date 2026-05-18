const Redis = require('ioredis');

// Initialize Redis Client
const redisUrl = process.env.REDIS_URL;

if (!process.env.REDIS_URL) {
  console.warn('⚠️  REDIS_URL is not set. Defaulting to localhost:6379');
}

let failureCount = 0;
const MAX_SILENT_FAILURES = 10;

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  keepAlive: 10000,
  family: 4, // Force IPv4 to avoid potential IPv6 proxy issues
  reconnectOnError: (err) => {
    if (err.message.includes('READONLY') || err.message.includes('ECONNRESET')) {
      return true;
    }
    return false;
  },
  retryStrategy(times) {
    failureCount = times;
    const delay = Math.min(times * 1000, 30000); // Slower retries to be gentle (up to 30s)

    if (times === 1) {
      console.warn('⚠️  [REDIS] Connection lost. Attempting to reconnect...');
    }

    if (times === MAX_SILENT_FAILURES) {
      console.error('🛑 [REDIS] Remote connection failing repeatedly. Check your REDIS_URL or internet.');
      console.log('💡 [TIP] Try using a local Redis: REDIS_URL=redis://localhost:6379');
    }

    return delay;
  }
});

let isConnected = false;

redis.on('connect', () => {
  // Silent connecting
});

redis.on('ready', () => {
  isConnected = true;
  console.log('🚀 [REDIS] System Online');
  failureCount = 0;
});

redis.on('error', (err) => {
  isConnected = false;
  // Only log unique errors to avoid spam
  if (failureCount < 2) {
    console.error('❌ [REDIS] Error:', err.message);
  }
});

redis.on('close', () => {
  isConnected = false;
});

/**
 * Get data from cache
 * @param {string} key - The cache key
 * @returns {Promise<any>}
 */
const getCache = async (key) => {
  if (!isConnected) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
};

/**
 * Set data in cache
 * @param {string} key - The cache key
 * @param {any} value - The data to cache
 * @param {number} ttl - Time to live in seconds (default: 3600 = 1 hour)
 */
const setCache = async (key, value, ttl = 3600) => {
  if (!isConnected) return;
  try {
    const stringValue = JSON.stringify(value);
    await redis.set(key, stringValue, 'EX', ttl);
  } catch (err) {
    // Silent fail
  }
};

/**
 * Delete data from cache
 * @param {string} key - The cache key
 */
const deleteCache = async (key) => {
  if (!isConnected) return;
  try {
    await redis.del(key);
  } catch (err) {
    // Silent fail
  }
};

/**
 * Clear all cache with a specific prefix
 * @param {string} prefix - The prefix to match
 */
const clearCacheByPrefix = async (prefix) => {
  try {
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = newCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error(`Cache CLEAR error for prefix ${prefix}:`, err);
  }
};

module.exports = {
  redis,
  getCache,
  setCache,
  deleteCache,
  clearCacheByPrefix
};
