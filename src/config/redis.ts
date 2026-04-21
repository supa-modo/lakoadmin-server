import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// In-memory fallback store for when Redis is unavailable
const memoryStore = new Map<string, { value: string; expiresAt?: number }>();

const memoryFallback = {
  get: async (key: string): Promise<string | null> => {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  set: async (key: string, value: string, exSeconds?: number): Promise<void> => {
    memoryStore.set(key, {
      value,
      expiresAt: exSeconds ? Date.now() + exSeconds * 1000 : undefined,
    });
  },
  del: async (key: string): Promise<void> => {
    memoryStore.delete(key);
  },
  setex: async (key: string, seconds: number, value: string): Promise<void> => {
    memoryStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
  },
  exists: async (key: string): Promise<number> => {
    const entry = memoryStore.get(key);
    if (!entry) return 0;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return 0;
    }
    return 1;
  },
};

export function getRedisClient(): Redis | null {
  return redisClient;
}

export function isRedisConnected(): boolean {
  return isRedisAvailable;
}

export async function connectRedis(): Promise<void> {
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not set – Redis disabled, using in-memory fallback');
    return;
  }

  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      logger.info('Redis connected');
    });

    redisClient.on('error', (err) => {
      if (isRedisAvailable) {
        logger.warn('Redis connection lost, falling back to in-memory cache', { error: err.message });
      }
      isRedisAvailable = false;
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    await redisClient.ping();
    isRedisAvailable = true;
  } catch (error) {
    isRedisAvailable = false;
    logger.warn('Redis unavailable – using in-memory fallback', { error: (error as Error).message });
  }
}

// Unified cache interface that falls back to memory automatically
export const cache = {
  async get(key: string): Promise<string | null> {
    if (isRedisAvailable && redisClient) {
      try {
        return await redisClient.get(key);
      } catch {
        isRedisAvailable = false;
      }
    }
    return memoryFallback.get(key);
  },

  async set(key: string, value: string, exSeconds?: number): Promise<void> {
    if (isRedisAvailable && redisClient) {
      try {
        if (exSeconds) {
          await redisClient.setex(key, exSeconds, value);
        } else {
          await redisClient.set(key, value);
        }
        return;
      } catch {
        isRedisAvailable = false;
      }
    }
    return memoryFallback.set(key, value, exSeconds);
  },

  async setex(key: string, seconds: number, value: string): Promise<void> {
    return this.set(key, value, seconds);
  },

  async del(key: string): Promise<void> {
    if (isRedisAvailable && redisClient) {
      try {
        await redisClient.del(key);
        return;
      } catch {
        isRedisAvailable = false;
      }
    }
    return memoryFallback.del(key);
  },

  async exists(key: string): Promise<boolean> {
    if (isRedisAvailable && redisClient) {
      try {
        const result = await redisClient.exists(key);
        return result > 0;
      } catch {
        isRedisAvailable = false;
      }
    }
    const result = await memoryFallback.exists(key);
    return result > 0;
  },
};
