const requests = new Map();

const WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || "60000");
const MAX_REQUESTS = parseInt(process.env.RATE_MAX_REQUESTS || "5");

export function rateLimiter(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const ip = req.ip || req.connection.remoteAddress;
  const identifier = apiKey || ip;

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  if (!requests.has(identifier)) {
    requests.set(identifier, []);
  }

  const timestamps = requests.get(identifier).filter(t => t > windowStart);
  timestamps.push(now);
  requests.set(identifier, timestamps);

  const remaining = Math.max(0, MAX_REQUESTS - timestamps.length);
  const resetTime = new Date(windowStart + WINDOW_MS).toISOString();

  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", resetTime);

  if (timestamps.length > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests",
      limit: MAX_REQUESTS,
      window: `${WINDOW_MS / 1000}s`,
      retry_after: resetTime,
      hint: "Add x-api-key header for higher limits (if configured)"
    });
  }

  next();
}

export function cleanRateLimitStore() {
  const now = Date.now();
  for (const [key, timestamps] of requests) {
    const active = timestamps.filter(t => t > now - WINDOW_MS);
    if (active.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, active);
    }
  }
}
