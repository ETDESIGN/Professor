import { corsHeaders, handleCors, jsonResponse, errorResponse } from './cors.ts';
import { createLogger } from './logger.ts';
import { softAuthenticate } from './authMiddleware.ts';
import { checkRateLimit, extractIdentifier, rateLimitHeaders } from './rateLimit.ts';
import { handleHealthCheck } from './health.ts';

interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'object' | 'array';
  minLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
}

export interface EdgeFunctionConfig {
  name: string;
  rateLimit: { maxRequests: number; windowMs: number };
  validationRules: ValidationRule[];
}

export function validateBody(body: any, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = body[rule.field];

    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${rule.field}`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rule.type) {
      if (rule.type === 'array' && !Array.isArray(value)) {
        errors.push(`Field "${rule.field}" must be an array`);
      } else if (rule.type !== 'array' && typeof value !== rule.type) {
        errors.push(`Field "${rule.field}" must be a ${rule.type}`);
      }
    }

    if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
      errors.push(`Field "${rule.field}" must be at least ${rule.minLength} characters`);
    }

    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      errors.push(`Field "${rule.field}" has invalid format`);
    }

    if (rule.custom) {
      const customError = rule.custom(value);
      if (customError) errors.push(customError);
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function serveEdgeFunction(req: Request, config: EdgeFunctionConfig, handler: (body: any, auth: any) => Promise<any>) {
  const startTime = Date.now();
  const log = createLogger(config.name);

  try {
    const healthResponse = handleHealthCheck(req);
    if (healthResponse) return healthResponse;

    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const identifier = extractIdentifier(req);
    const rateLimit = checkRateLimit(identifier, config.rateLimit);
    if (!rateLimit.allowed) {
      log.warn('rate_limited', { metadata: { identifier } });
      return errorResponse('Rate limit exceeded.', 429, rateLimitHeaders(rateLimit.remaining, rateLimit.retryAfterMs));
    }

    const auth = await softAuthenticate(req);
    const userId = auth?.userId;

    const body = await req.json();

    const { valid, errors } = validateBody(body, config.validationRules);
    if (!valid) {
      return errorResponse(`Validation failed: ${errors.join('; ')}`, 400, rateLimitHeaders(rateLimit.remaining, 0));
    }

    log.info('request_start', { userId, metadata: { action: body.action || 'default' } });

    const result = await handler(body, auth);

    log.info('request_complete', {
      userId,
      durationMs: Date.now() - startTime,
      metadata: { action: body.action || 'default' },
    });

    return jsonResponse(result, 200, rateLimitHeaders(rateLimit.remaining, 0));
  } catch (error: any) {
    const log2 = createLogger(config.name);
    log2.error('request_failed', { error: error.message, durationMs: Date.now() - startTime });
    return errorResponse(error.message);
  }
}
