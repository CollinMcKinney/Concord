import { createClient, type RedisClientType } from "redis";

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

// Type definitions
type RedisSetOptions = Parameters<RedisClientType["set"]>[2];
type RedisSetResult = Awaited<ReturnType<RedisClientType["set"]>>;

// =====================
// Redis Client
// =====================
const redisHost = process.env.REDIS_HOST ?? 'redis';
const redisPort = parseInt(process.env.REDIS_PORT ?? '6379');

const client: RedisClientType = createClient({
  socket: {
    host: redisHost,
    port: redisPort
  }
});

client.on("error", (err: Error) => console.error(`${colors.red}[cache]${colors.reset} Redis Client Error:`, err));

/**
 * Connects the shared Redis client if it has not been opened yet.
 */
export async function initStorage(): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
    console.log(`${colors.green}[cache]${colors.reset} Redis connected!`);
  }
}

// =====================
// Basic Redis Operations
// =====================
/**
 * Reads and deserializes a JSON value from Redis.
 */
export async function get<T>(key: string): Promise<T | null> {
  const data = await client.get(key);
  return data ? (JSON.parse(data) as T) : null;
}

/**
 * Serializes and stores a JSON value in Redis.
 */
export async function set<T>(key: string, value: T, options?: RedisSetOptions): Promise<RedisSetResult> {
  return client.set(key, JSON.stringify(value), options);
}

/**
 * Checks whether a Redis key exists.
 */
export async function exists(key: string): Promise<number> {
  return client.exists(key);
}

/**
 * Adds a member to a Redis set.
 */
export async function sAdd(key: string, value: string): Promise<number> {
  return client.sAdd(key, value);
}

/**
 * Reads all members from a Redis set.
 */
export async function sMembers(key: string): Promise<string[]> {
  return client.sMembers(key);
}

/**
 * Removes a member from a Redis set.
 */
export async function sRem(key: string, value: string): Promise<number> {
  return client.sRem(key, value);
}

/**
 * Score/value pair accepted by Redis sorted-set writes.
 */
interface ZAddOptions {
  score: number;
  value: string;
}

/**
 * Adds one or more score/value pairs to a Redis sorted set.
 */
export async function zAdd(key: string, scoreValue: ZAddOptions | ZAddOptions[]): Promise<number> {
  if (Array.isArray(scoreValue)) return client.zAdd(key, scoreValue);
  return client.zAdd(key, scoreValue);
}

/**
 * Reads a score-ordered range from a Redis sorted set.
 */
export async function zRange(key: string, start: number, end: number): Promise<string[]> {
  return client.zRange(key, start, end);
}

/**
 * Removes a member from a Redis sorted set.
 */
export async function zRem(key: string, value: string): Promise<number> {
  return client.zRem(key, value);
}

/**
 * Deletes a Redis key.
 */
export async function del(key: string): Promise<number> {
  return client.del(key);
}

export { client };
