/**
 * Rate limiting utilities
 * Session-based rate limiting to prevent abuse
 */

// In-memory store for rate limiting
// Format: Map<sessionId, {count: number, resetTime: number}>
const sessionLimits = new Map();

// Format: Map<ip, {count: number, resetTime: number}>
const ipLimits = new Map();

// Configuration (can be overridden by environment variables)
const MAX_REQUESTS_PER_SESSION = parseInt(process.env.MAX_REQUESTS_PER_SESSION || '20', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '600000', 10); // 10 minutes

const MAX_REQUESTS_PER_IP = 100; // Abuse prevention
const IP_WINDOW_MS = 3600000; // 1 hour

/**
 * Check if request is allowed under rate limits
 *
 * @param {string} sessionId - User session ID
 * @param {string} ip - IP address (optional, for secondary limit)
 * @returns {Object} Result object with allowed status and remaining count
 */
export function checkRateLimit(sessionId, ip = null) {
  const now = Date.now();

  // Check session-based limit
  const sessionLimit = sessionLimits.get(sessionId);

  if (!sessionLimit || now > sessionLimit.resetTime) {
    // Create new limit entry or reset expired one
    sessionLimits.set(sessionId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    });

    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_SESSION - 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
      resetIn: RATE_LIMIT_WINDOW_MS
    };
  }

  // Check if session limit exceeded
  if (sessionLimit.count >= MAX_REQUESTS_PER_SESSION) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: sessionLimit.resetTime,
      resetIn: sessionLimit.resetTime - now,
      reason: 'Session rate limit exceeded'
    };
  }

  // Check IP-based limit (abuse prevention)
  if (ip) {
    const ipLimit = ipLimits.get(ip);

    if (!ipLimit || now > ipLimit.resetTime) {
      ipLimits.set(ip, {
        count: 1,
        resetTime: now + IP_WINDOW_MS
      });
    } else if (ipLimit.count >= MAX_REQUESTS_PER_IP) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: ipLimit.resetTime,
        resetIn: ipLimit.resetTime - now,
        reason: 'IP rate limit exceeded (abuse prevention)'
      };
    } else {
      ipLimit.count++;
    }
  }

  // Increment session count
  sessionLimit.count++;

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_SESSION - sessionLimit.count,
    resetTime: sessionLimit.resetTime,
    resetIn: sessionLimit.resetTime - now
  };
}

/**
 * Get current rate limit status for a session
 *
 * @param {string} sessionId - User session ID
 * @returns {Object} Status object
 */
export function getRateLimitStatus(sessionId) {
  const now = Date.now();
  const sessionLimit = sessionLimits.get(sessionId);

  if (!sessionLimit || now > sessionLimit.resetTime) {
    return {
      used: 0,
      remaining: MAX_REQUESTS_PER_SESSION,
      total: MAX_REQUESTS_PER_SESSION,
      resetTime: null,
      resetIn: 0
    };
  }

  return {
    used: sessionLimit.count,
    remaining: MAX_REQUESTS_PER_SESSION - sessionLimit.count,
    total: MAX_REQUESTS_PER_SESSION,
    resetTime: sessionLimit.resetTime,
    resetIn: sessionLimit.resetTime - now
  };
}

/**
 * Reset rate limit for a session (admin function)
 *
 * @param {string} sessionId - User session ID
 */
export function resetRateLimit(sessionId) {
  sessionLimits.delete(sessionId);
}

/**
 * Clean up expired entries (run periodically)
 */
export function cleanupExpiredLimits() {
  const now = Date.now();
  let cleaned = 0;

  // Clean up expired session limits
  for (const [sessionId, limit] of sessionLimits.entries()) {
    if (now > limit.resetTime) {
      sessionLimits.delete(sessionId);
      cleaned++;
    }
  }

  // Clean up expired IP limits
  for (const [ip, limit] of ipLimits.entries()) {
    if (now > limit.resetTime) {
      ipLimits.delete(ip);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`✓ Cleaned up ${cleaned} expired rate limit entries`);
  }

  return cleaned;
}

/**
 * Get rate limiter statistics
 */
export function getRateLimiterStats() {
  return {
    activeSessions: sessionLimits.size,
    activeIPs: ipLimits.size,
    config: {
      maxRequestsPerSession: MAX_REQUESTS_PER_SESSION,
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequestsPerIP: MAX_REQUESTS_PER_IP,
      ipWindowMs: IP_WINDOW_MS
    }
  };
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredLimits, 5 * 60 * 1000);
