import { logger } from "./logger";

interface RateLimiterConfig {
  requestsPerMinute: number;
  requestsPerSecond: number;
  maxQueueSize: number;
}

interface QueuedRequest {
  resolve: () => void;
  reject: (err: Error) => void;
  timestamp: number;
}

interface RateLimiterStats {
  requestsThisMinute: number;
  requestsThisSecond: number;
  queueLength: number;
  isThrottled: boolean;
  retryAfterMs: number | null;
  totalRequests: number;
  totalThrottled: number;
  avgWaitMs: number;
}

class RateLimiter {
  private config: RateLimiterConfig;
  private minuteTokens: number;
  private secondTokens: number;
  private lastMinuteRefill: number;
  private lastSecondRefill: number;
  private queue: QueuedRequest[] = [];
  private retryAfterUntil: number | null = null;
  private totalRequests: number = 0;
  private totalThrottled: number = 0;
  private totalWaitTime: number = 0;
  private isProcessingQueue: boolean = false;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? 50,
      requestsPerSecond: config.requestsPerSecond ?? 4,
      maxQueueSize: config.maxQueueSize ?? 200,
    };
    
    this.minuteTokens = this.config.requestsPerMinute;
    this.secondTokens = this.config.requestsPerSecond;
    this.lastMinuteRefill = Date.now();
    this.lastSecondRefill = Date.now();
    
    logger.info(`[RateLimiter] Initialized: ${this.config.requestsPerMinute}/min, ${this.config.requestsPerSecond}/sec, queue max ${this.config.maxQueueSize}`);
  }

  private refillTokens(): void {
    const now = Date.now();
    
    const minuteElapsed = now - this.lastMinuteRefill;
    if (minuteElapsed >= 60000) {
      this.minuteTokens = this.config.requestsPerMinute;
      this.lastMinuteRefill = now;
    } else {
      const partialRefill = Math.floor((minuteElapsed / 60000) * this.config.requestsPerMinute);
      const maxTokens = this.config.requestsPerMinute;
      this.minuteTokens = Math.min(maxTokens, this.minuteTokens + partialRefill);
      if (partialRefill > 0) {
        this.lastMinuteRefill = now;
      }
    }
    
    const secondElapsed = now - this.lastSecondRefill;
    if (secondElapsed >= 1000) {
      this.secondTokens = this.config.requestsPerSecond;
      this.lastSecondRefill = now;
    }
  }

  private canProceed(): boolean {
    if (this.retryAfterUntil && Date.now() < this.retryAfterUntil) {
      return false;
    } else if (this.retryAfterUntil) {
      this.retryAfterUntil = null;
    }
    
    this.refillTokens();
    return this.minuteTokens > 0 && this.secondTokens > 0;
  }

  private consumeToken(): void {
    this.minuteTokens--;
    this.secondTokens--;
    this.totalRequests++;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    
    while (this.queue.length > 0) {
      if (!this.canProceed()) {
        const waitTime = this.getWaitTime();
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      
      const request = this.queue.shift();
      if (request) {
        const waitTime = Date.now() - request.timestamp;
        this.totalWaitTime += waitTime;
        this.consumeToken();
        request.resolve();
      }
    }
    
    this.isProcessingQueue = false;
  }

  private getWaitTime(): number {
    if (this.retryAfterUntil) {
      return Math.max(0, this.retryAfterUntil - Date.now());
    }
    
    if (this.secondTokens <= 0) {
      return Math.max(0, 1000 - (Date.now() - this.lastSecondRefill));
    }
    
    if (this.minuteTokens <= 0) {
      return Math.max(0, 60000 - (Date.now() - this.lastMinuteRefill));
    }
    
    return 100;
  }

  async acquire(): Promise<void> {
    if (this.canProceed()) {
      this.consumeToken();
      return;
    }
    
    if (this.queue.length >= this.config.maxQueueSize) {
      this.totalThrottled++;
      throw new Error(`Rate limiter queue full (${this.config.maxQueueSize} requests waiting)`);
    }
    
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject, timestamp: Date.now() });
      
      if (this.queue.length === 1) {
        this.processQueue().catch(err => {
          logger.error("[RateLimiter] Queue processing error:", err);
        });
      }
      
      if (this.queue.length % 10 === 0) {
        logger.info(`[RateLimiter] Queue depth: ${this.queue.length}, tokens: ${this.minuteTokens}/min, ${this.secondTokens}/sec`);
      }
    });
  }

  setRetryAfter(seconds: number): void {
    const retryAfterMs = seconds * 1000;
    this.retryAfterUntil = Date.now() + retryAfterMs;
    logger.warn(`[RateLimiter] Retry-After received: pausing for ${seconds}s`);
  }

  onRateLimitHit(): void {
    this.totalThrottled++;
    
    if (!this.retryAfterUntil) {
      const backoffMs = Math.min(30000, 5000 * (1 + Math.floor(this.totalThrottled / 5)));
      this.retryAfterUntil = Date.now() + backoffMs;
      logger.warn(`[RateLimiter] 429 hit, backing off for ${backoffMs}ms (throttle count: ${this.totalThrottled})`);
    }
    
    this.minuteTokens = Math.max(0, this.minuteTokens - 10);
  }

  getStats(): RateLimiterStats {
    return {
      requestsThisMinute: this.config.requestsPerMinute - this.minuteTokens,
      requestsThisSecond: this.config.requestsPerSecond - this.secondTokens,
      queueLength: this.queue.length,
      isThrottled: this.retryAfterUntil !== null && Date.now() < this.retryAfterUntil,
      retryAfterMs: this.retryAfterUntil ? Math.max(0, this.retryAfterUntil - Date.now()) : null,
      totalRequests: this.totalRequests,
      totalThrottled: this.totalThrottled,
      avgWaitMs: this.totalRequests > 0 ? Math.round(this.totalWaitTime / this.totalRequests) : 0,
    };
  }

  reset(): void {
    this.minuteTokens = this.config.requestsPerMinute;
    this.secondTokens = this.config.requestsPerSecond;
    this.retryAfterUntil = null;
    this.queue.forEach(q => q.reject(new Error("Rate limiter reset")));
    this.queue = [];
    logger.info("[RateLimiter] Reset");
  }
}

export const recruitCRMRateLimiter = new RateLimiter({
  requestsPerMinute: 50,
  requestsPerSecond: 4,
  maxQueueSize: 200,
});

export { RateLimiter, RateLimiterStats };
