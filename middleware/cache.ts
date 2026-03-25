import { Request, Response, NextFunction } from 'express';
import { GraphQLCache, CachePresets } from '../nepa-dapp/src/graphql/cache';

// Global cache instance
let cacheInstance: GraphQLCache | null = null;

// Initialize cache with environment-specific configuration
function getCacheInstance(): GraphQLCache {
  if (!cacheInstance) {
    const env = process.env.NODE_ENV || 'development';
    const config = CachePresets[env as keyof typeof CachePresets] || CachePresets.development;
    
    // Override with environment variables if provided
    const finalConfig = {
      ...config,
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttl: parseInt(process.env.CACHE_TTL || config.ttl.toString()),
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || config.maxSize.toString()),
      redis: config.redis ? {
        ...config.redis,
        host: process.env.REDIS_HOST || config.redis.host,
        port: parseInt(process.env.REDIS_PORT || config.redis.port.toString()),
        password: process.env.REDIS_PASSWORD || config.redis.password,
        db: parseInt(process.env.REDIS_DB || config.redis.db?.toString() || '0')
      } : undefined
    };
    
    cacheInstance = new GraphQLCache(finalConfig);
  }
  return cacheInstance;
}

// Generate cache key based on request
function generateCacheKey(req: Request): string {
  const userId = (req as any).user?.id || 'anonymous';
  const path = req.path;
  const method = req.method;
  const query = JSON.stringify(req.query);
  const params = JSON.stringify(req.params);
  
  return `${method}:${path}:${userId}:${Buffer.from(query + params).toString('base64')}`;
}

// Cache middleware factory
export function cacheMiddleware(options: {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  tags?: string[];
} = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cache = getCacheInstance();
    
    // Skip caching if disabled or condition fails
    if (!cache.config.enabled || (options.condition && !options.condition(req))) {
      return next();
    }

    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const key = options.keyGenerator ? options.keyGenerator(req) : generateCacheKey(req);
      
      // Try to get from cache
      const cached = await cache.get(key);
      if (cached !== null) {
        res.set('X-Cache', 'HIT');
        return res.json(cached);
      }

      // Intercept response to cache it
      const originalJson = res.json;
      res.json = function(data: any) {
        // Only cache successful responses
        if (res.statusCode === 200 && data !== null && data !== undefined) {
          cache.set(key, data, options.ttl).catch(error => {
            console.error('Cache set error:', error);
          });
        }
        res.set('X-Cache', 'MISS');
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

// Cache invalidation middleware
export function invalidateCache(options: {
  patterns?: string[];
  tags?: string[];
  userId?: boolean; // Invalidate user-specific cache
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cache = getCacheInstance();
    
    // Continue with the request first
    next();
    
    // Invalidate cache after successful response
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const invalidated: number[] = [];
          
          // Invalidate by patterns
          if (options.patterns) {
            for (const pattern of options.patterns) {
              const count = await cache.invalidateByPattern(pattern);
              invalidated.push(count);
            }
          }
          
          // Invalidate user-specific cache
          if (options.userId && (req as any).user?.id) {
            const userId = (req as any).user.id;
            const count = await cache.invalidateByPattern(`user:${userId}`);
            invalidated.push(count);
          }
          
          // Invalidate by tags (if implemented)
          if (options.tags) {
            for (const tag of options.tags) {
              const count = await cache.invalidateByPattern(tag);
              invalidated.push(count);
            }
          }
          
          if (invalidated.some(count => count > 0)) {
            console.log(`Cache invalidated: ${invalidated.reduce((a, b) => a + b, 0)} entries`);
          }
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      }
    });
  };
}

// Helper function to manually invalidate cache
export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  const cache = getCacheInstance();
  return cache.invalidateByPattern(pattern);
}

// Helper function to invalidate user cache
export async function invalidateUserCache(userId: string): Promise<number> {
  const cache = getCacheInstance();
  return cache.invalidateByUser(userId);
}

// Cache health check endpoint
export async function getCacheHealth() {
  const cache = getCacheInstance();
  return cache.healthCheck();
}

// Cache statistics endpoint
export async function getCacheStats() {
  const cache = getCacheInstance();
  return cache.getStats();
}

// Clear all cache (admin only)
export async function clearAllCache(): Promise<void> {
  const cache = getCacheInstance();
  return cache.clear();
}
