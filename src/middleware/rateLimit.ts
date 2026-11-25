import type { NextFunction, Request, Response } from 'express';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message: string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, RateLimitBucket>();
  let lastPruneAt = Date.now();
  const MAX_BUCKETS = 10_000;

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    const now = Date.now();
    if (now - lastPruneAt > options.windowMs || buckets.size > MAX_BUCKETS) {
      for (const [k, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) {
          buckets.delete(k);
        }
      }
      if (buckets.size > MAX_BUCKETS) {
        buckets.clear();
      }
      lastPruneAt = now;
    }

    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${clientIp}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      const resetAt = now + options.windowMs;
      buckets.set(key, { count: 1, resetAt });
      res.setHeader('RateLimit-Limit', String(options.max));
      res.setHeader('RateLimit-Remaining', String(Math.max(options.max - 1, 0)));
      next();
      return;
    }

    current.count += 1;
    const remaining = Math.max(options.max - current.count, 0);
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));

    if (current.count > options.max) {
      const retryAfterSec = Math.max(
        Math.ceil((current.resetAt - now) / 1000),
        1,
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message,
        retryAfterSeconds: retryAfterSec,
      });
      return;
    }

    next();
  };
}
