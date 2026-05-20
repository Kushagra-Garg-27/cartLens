/**
 * In-memory sliding window rate limiter.
 * Each window tracks request timestamps per key (IP).
 */

const windows = new Map();

/**
 * Create a rate limiter middleware.
 * @param {{ max: number, windowMs?: number }} options
 * @returns {import("express").RequestHandler}
 */
function createRateLimiter({ max, windowMs = 60000 }) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();

    if (!windows.has(key)) {
      windows.set(key, []);
    }

    const timestamps = windows.get(key);

    // Remove timestamps outside the current window
    while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= max) {
      return res.status(429).json({
        error: `Rate limit exceeded. Maximum ${max} requests per ${windowMs / 1000}s.`,
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    timestamps.push(now);
    next();
  };
}

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of windows.entries()) {
    const filtered = timestamps.filter((t) => t > now - 300000);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}, 300000).unref();

module.exports = { createRateLimiter };
