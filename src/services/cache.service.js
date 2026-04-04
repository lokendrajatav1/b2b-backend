const Redis = require('ioredis');

// Initialize Redis Client
const redisUrl = process.env.REDIS_URL ;

if (!process.env.REDIS_URL) {
  console.warn('⚠️  REDIS_URL is not set. Defaulting to localhost:6379');
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  }
});

redis.on('connect', () => {
  console.log('✅ Redis client connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

/**
 * Get data from cache
 * @param {string} key - The cache key
 * @returns {Promise<any>}
 */
const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`Cache GET error for key ${key}:`, err);
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
  try {
    const stringValue = JSON.stringify(value);
    await redis.set(key, stringValue, 'EX', ttl);
  } catch (err) {
    console.error(`Cache SET error for key ${key}:`, err);
  }
};

/**
 * Delete data from cache
 * @param {string} key - The cache key
 */
const deleteCache = async (key) => {
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`Cache DELETE error for key ${key}:`, err);
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
