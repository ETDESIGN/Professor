const requestCounts = new Map<string, { count: number; windowStart: number }>();

interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 30,
  windowMs: 60 * 1000,
};

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = DEFAULT_OPTIONS
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = requestCounts.get(identifier);

  if (!entry || now - entry.windowStart > options.windowMs) {
    requestCounts.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: options.maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= options.maxRequests) {
    const retryAfterMs = options.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: options.maxRequests - entry.count, retryAfterMs: 0 };
}

export function extractIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();

  const authHeader = req.headers.get('authorization');
  if (authHeader) return `auth:${authHeader.slice(0, 20)}`;

  return `ip:unknown`;
}

export function rateLimitHeaders(remaining: number, retryAfterMs: number): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': String(remaining),
  };
  if (retryAfterMs > 0) {
    headers['Retry-After'] = String(Math.ceil(retryAfterMs / 1000));
  }
  return headers;
}
