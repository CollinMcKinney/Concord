import { createClient } from "redis";

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const redisClient = createClient({
  socket: { 
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// Rate limit configurations (can be overridden via environment variables)
const RATE_LIMITS = {
  // Login attempts: 5 per 15 minutes
  LOGIN: { 
    windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || '900000') || 15 * 60 * 1000,
    maxAttempts: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5') || 5
  },

  // API calls: 200 per minute (sliding window)
  API: {
    windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000') || 60 * 1000,
    maxAttempts: parseInt(process.env.RATE_LIMIT_API_MAX || '200') || 200
  },

  // Env changes: 10 per 5 minutes
  ENV_CHANGE: { 
    windowMs: parseInt(process.env.RATE_LIMIT_ENV_WINDOW_MS || '300000') || 5 * 60 * 1000,
    maxAttempts: parseInt(process.env.RATE_LIMIT_ENV_MAX || '10') || 10
  },
};

// WebSocket-specific rate limiting config
export const WS_RATE_LIMITS = {
  // WebSocket connections per IP
  MAX_CONNECTIONS: parseInt(process.env.RATE_LIMIT_WS_CONNECTIONS || '10') || 10,
  
  // WebSocket messages per second
  MAX_MESSAGES_PER_SECOND: parseInt(process.env.RATE_LIMIT_WS_MESSAGES || '20') || 20,
  
  // WebSocket max payload size (bytes)
  MAX_PAYLOAD_SIZE: parseInt(process.env.RATE_LIMIT_WS_PAYLOAD || '1048576') || 1024 * 1024
};

/**
 * Initialize Redis client for rate limiting
 */
export async function initRateLimiter(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log(`${colors.green}[RateLimiter]${colors.reset} Redis connected`);
  }
}

/**
 * Check if an action is rate limited using sliding window algorithm.
 * Stores timestamps of recent requests and removes old ones as they age out.
 * @param key - Unique identifier for the action (e.g., IP + action type)
 * @param limitType - Type of rate limit to apply
 * @returns True if action is allowed, false if rate limited
 */
export async function checkRateLimit(key: string, limitType: keyof typeof RATE_LIMITS): Promise<boolean> {
  const limit = RATE_LIMITS[limitType];
  const redisKey = `ratelimit:${limitType}:${key}`;
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  // Get recent request timestamps using sorted set
  const timestamps = await redisClient.zRangeByScore(redisKey, windowStart, '+inf');
  const recentCount = timestamps.length;

  if (recentCount >= limit.maxAttempts) {
    // Calculate time until next request is allowed
    const oldestTimestamp = timestamps[0];
    const retryAfter = Math.ceil((parseInt(oldestTimestamp) + limit.windowMs - now) / 1000);
    console.log(`${colors.yellow}[RateLimiter]${colors.reset} Rate limited: ${colors.cyan}${key}${colors.reset} (${limitType}) - retry in ${retryAfter}s`);
    return false;
  }

  // Add current request timestamp to sorted set
  await redisClient.zAdd(redisKey, { score: now, value: now.toString() });
  
  // Set expiry to clean up old keys automatically
  await redisClient.expire(redisKey, Math.ceil(limit.windowMs / 1000) + 1);

  return true;
}

/**
 * Get remaining attempts for a rate limit
 * @param key - Unique identifier for the action
 * @param limitType - Type of rate limit
 * @returns Number of remaining attempts
 */
export async function getRemainingAttempts(key: string, limitType: keyof typeof RATE_LIMITS): Promise<number> {
  const limit = RATE_LIMITS[limitType];
  const redisKey = `ratelimit:${limitType}:${key}`;
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  const timestamps = await redisClient.zRangeByScore(redisKey, windowStart, '+inf');
  const recentCount = timestamps.length;

  return Math.max(0, limit.maxAttempts - recentCount);
}

/**
 * Get rate limit info for display
 * @param key - Unique identifier for the action
 * @param limitType - Type of rate limit
 * @returns Object with current status
 */
export async function getRateLimitInfo(key: string, limitType: keyof typeof RATE_LIMITS): Promise<{
  current: number;
  max: number;
  remaining: number;
  resetIn: number;
}> {
  const limit = RATE_LIMITS[limitType];
  const redisKey = `ratelimit:${limitType}:${key}`;
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  const timestamps = await redisClient.zRangeByScore(redisKey, windowStart, '+inf');
  const recentCount = timestamps.length;
  
  // Calculate when the oldest request will expire
  const oldestTimestamp = timestamps[0] ? parseInt(timestamps[0]) : now;
  const resetIn = timestamps.length > 0 ? (oldestTimestamp + limit.windowMs - now) : 0;

  return {
    current: recentCount,
    max: limit.maxAttempts,
    remaining: Math.max(0, limit.maxAttempts - recentCount),
    resetIn: Math.max(0, resetIn)
  };
}

export { RATE_LIMITS, redisClient };
