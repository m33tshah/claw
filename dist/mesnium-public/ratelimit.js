/**
 * MESNIUM PUBLIC RATE LIMITER (PHASE 1 INTEGRATION)
 * 
 * Lightweight in-memory sliding window rate limiter.
 * Protects public endpoints from message flooding, automated scrapers, and abuse.
 * 
 * Zero external infrastructure requirements (no Redis dependency).
 */

export class MesniumPublicRateLimiter {
  constructor(options = {}) {
    // Window in milliseconds (default 60 seconds)
    this.windowMs = options.windowMs || 60_000;
    // Max requests per IP within window
    this.ipLimit = options.ipLimit || 25;
    // Max requests per conversation session within window
    this.sessionLimit = options.sessionLimit || 15;

    this.ipHits = new Map(); // ip -> [timestamp]
    this.sessionHits = new Map(); // token -> [timestamp]

    // Periodic sweep every 5 minutes to prevent memory leak
    this.sweepInterval = setInterval(() => this.sweep(), 300_000);
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  sweep() {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    for (const [ip, timestamps] of this.ipHits.entries()) {
      const active = timestamps.filter(t => t > cutoff);
      if (active.length === 0) {
        this.ipHits.delete(ip);
      } else {
        this.ipHits.set(ip, active);
      }
    }

    for (const [token, timestamps] of this.sessionHits.entries()) {
      const active = timestamps.filter(t => t > cutoff);
      if (active.length === 0) {
        this.sessionHits.delete(token);
      } else {
        this.sessionHits.set(token, active);
      }
    }
  }

  /**
   * Check rate limits for a public request.
   * Returns { allowed: true } or { allowed: false, reason: string, retryAfterSeconds: number }
   */
  checkRateLimit({ ip, conversationToken }) {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // 1. IP Check
    if (ip) {
      const timestamps = (this.ipHits.get(ip) || []).filter(t => t > cutoff);
      if (timestamps.length >= this.ipLimit) {
        const oldest = timestamps[0];
        const retryAfterSeconds = Math.ceil((oldest + this.windowMs - now) / 1000);
        return {
          allowed: false,
          reason: 'ip_rate_limit_exceeded',
          retryAfterSeconds: Math.max(1, retryAfterSeconds)
        };
      }
      timestamps.push(now);
      this.ipHits.set(ip, timestamps);
    }

    // 2. Conversation Session Check
    if (conversationToken) {
      const timestamps = (this.sessionHits.get(conversationToken) || []).filter(t => t > cutoff);
      if (timestamps.length >= this.sessionLimit) {
        const oldest = timestamps[0];
        const retryAfterSeconds = Math.ceil((oldest + this.windowMs - now) / 1000);
        return {
          allowed: false,
          reason: 'session_rate_limit_exceeded',
          retryAfterSeconds: Math.max(1, retryAfterSeconds)
        };
      }
      timestamps.push(now);
      this.sessionHits.set(conversationToken, timestamps);
    }

    return { allowed: true };
  }

  reset() {
    this.ipHits.clear();
    this.sessionHits.clear();
  }

  destroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
    }
  }
}

let sharedRateLimiter = null;
export function getSharedPublicRateLimiter() {
  if (!sharedRateLimiter) {
    sharedRateLimiter = new MesniumPublicRateLimiter();
  }
  return sharedRateLimiter;
}
