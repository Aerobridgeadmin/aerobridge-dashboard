import { Request, Response, NextFunction } from 'express';
import { RateLimitedError } from '../lib/errors';
import { logger } from '../lib/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limiters = new Map<string, Map<string, RateLimitEntry>>();

function cleanupExpiredEntries(limiterName: string): void {
  const limiter = limiters.get(limiterName);
  if (!limiter) return;
  
  const now = Date.now();
  for (const [key, entry] of limiter.entries()) {
    if (entry.resetAt <= now) {
      limiter.delete(key);
    }
  }
}

export function createRateLimiter(name: string, config: RateLimitConfig) {
  if (!limiters.has(name)) {
    limiters.set(name, new Map());
    setInterval(() => cleanupExpiredEntries(name), config.windowMs);
  }
  
  const defaultKeyGenerator = (req: Request): string => {
    return req.session?.userId || req.ip || 'anonymous';
  };
  
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const limiter = limiters.get(name)!;
    const key = keyGenerator(req);
    const now = Date.now();
    
    let entry = limiter.get(key);
    
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs
      };
      limiter.set(key, entry);
    }
    
    entry.count++;
    
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetTime = Math.ceil((entry.resetAt - now) / 1000);
    
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', resetTime.toString());
    
    if (entry.count > config.maxRequests) {
      const retryAfterMs = entry.resetAt - now;
      
      logger.warn(`[RateLimit] ${name} exceeded for ${key}`, {
        requestId: req.requestId,
        limiter: name,
        key,
        count: entry.count,
        limit: config.maxRequests,
        retryAfterMs
      });
      
      res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
      
      throw new RateLimitedError(retryAfterMs);
    }
    
    next();
  };
}

export const apiRateLimiter = createRateLimiter('api', {
  windowMs: 60 * 1000,
  maxRequests: 100
});

export const authRateLimiter = createRateLimiter('auth', {
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `auth:${req.ip}`
});

export const uploadRateLimiter = createRateLimiter('upload', {
  windowMs: 60 * 1000,
  maxRequests: 20
});

export const aiRateLimiter = createRateLimiter('ai', {
  windowMs: 60 * 1000,
  maxRequests: 30
});
