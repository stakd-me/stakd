import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Singleton pattern for Redis connection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

if (!g.__redis) {
  g.__redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
    lazyConnect: true,
  });
}

export const redis: Redis = g.__redis;

/**
 * Rate-limit check: returns true if allowed, false if rate-limited.
 * Uses a sliding window counter.
 */
export async function rateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<boolean> {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }
  return current <= maxAttempts;
}

/**
 * Debounce check: returns true if the action should proceed (not debounced).
 */
export async function debounce(
  key: string,
  cooldownSeconds: number
): Promise<boolean> {
  const result = await redis.set(key, "1", "EX", cooldownSeconds, "NX");
  return result === "OK";
}
