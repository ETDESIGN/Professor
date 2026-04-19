import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows requests under the limit', async () => {
    const { checkRateLimit } = await import('../supabase/functions/_shared/rateLimit.ts');
    const result = checkRateLimit('user-1', { maxRequests: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterMs).toBe(0);
  });

  it('blocks requests over the limit', async () => {
    const { checkRateLimit } = await import('../supabase/functions/_shared/rateLimit.ts');
    for (let i = 0; i < 5; i++) {
      checkRateLimit('user-2', { maxRequests: 5, windowMs: 60000 });
    }
    const result = checkRateLimit('user-2', { maxRequests: 5, windowMs: 60000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks different identifiers independently', async () => {
    const { checkRateLimit } = await import('../supabase/functions/_shared/rateLimit.ts');
    for (let i = 0; i < 3; i++) {
      checkRateLimit('user-a', { maxRequests: 3, windowMs: 60000 });
    }
    const resultA = checkRateLimit('user-a', { maxRequests: 3, windowMs: 60000 });
    const resultB = checkRateLimit('user-b', { maxRequests: 3, windowMs: 60000 });
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it('resets window after expiry', async () => {
    const { checkRateLimit } = await import('../supabase/functions/_shared/rateLimit.ts');
    const id = `user-expiry-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(id, { maxRequests: 3, windowMs: 10 });
    }
    const blocked = checkRateLimit(id, { maxRequests: 3, windowMs: 10 });
    expect(blocked.allowed).toBe(false);

    await new Promise(r => setTimeout(r, 20));

    const result = checkRateLimit(id, { maxRequests: 3, windowMs: 10 });
    expect(result.allowed).toBe(true);
  });
});

describe('CORS Utilities', () => {
  it('returns null for non-OPTIONS requests', async () => {
    const { handleCors } = await import('../supabase/functions/_shared/cors.ts');
    const req = new Request('http://localhost/test', { method: 'POST' });
    const result = handleCors(req);
    expect(result).toBeNull();
  });

  it('returns Response for OPTIONS requests', async () => {
    const { handleCors } = await import('../supabase/functions/_shared/cors.ts');
    const req = new Request('http://localhost/test', { method: 'OPTIONS' });
    const result = handleCors(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(200);
  });

  it('jsonResponse returns correct content-type', async () => {
    const { jsonResponse } = await import('../supabase/functions/_shared/cors.ts');
    const res = jsonResponse({ test: true });
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('errorResponse returns error body', async () => {
    const { errorResponse } = await import('../supabase/functions/_shared/cors.ts');
    const res = errorResponse('Something broke', 500);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Something broke');
  });
});

describe('Structured Logger', () => {
  it('createLogger returns all log level methods', async () => {
    const { createLogger } = await import('../supabase/functions/_shared/logger.ts');
    const logger = createLogger('test-service');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('logger formats entries with structured fields', async () => {
    const { createLogger } = await import('../supabase/functions/_shared/logger.ts');
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('test');
    logger.error('test_action', { error: 'test error', metadata: { key: 'value' } });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('ERROR');
    expect(output).toContain('service=test');
    expect(output).toContain('action=test_action');
    expect(output).toContain('error="test error"');
    logSpy.mockRestore();
  });
});

describe('Client Logger', () => {
  it('createClientLogger returns all methods', async () => {
    const { createClientLogger } = await import('../services/logger');
    const logger = createClientLogger('test');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('client logger formats entries', async () => {
    const { createClientLogger } = await import('../services/logger');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createClientLogger('client-test');
    logger.warn('test_warn', { metadata: { foo: 'bar' } });
    expect(warnSpy).toHaveBeenCalled();
    const output = warnSpy.mock.calls[0][0];
    expect(output).toContain('WARN');
    expect(output).toContain('client-test:test_warn');
    warnSpy.mockRestore();
  });
});

describe('Error Reporting', () => {
  it('reportError handles string errors', async () => {
    const { reportError } = await import('../services/errorReporting');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError('test error');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('reportError handles Error objects', async () => {
    const { reportError } = await import('../services/errorReporting');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('test error object'), { extra: 'data' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('reportApiError includes endpoint and status', async () => {
    const { reportApiError } = await import('../services/errorReporting');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportApiError('/api/test', 404, 'Not found');
    expect(errorSpy).toHaveBeenCalled();
    const output = errorSpy.mock.calls[0][0];
    expect(output).toContain('404');
    expect(output).toContain('/api/test');
    errorSpy.mockRestore();
  });
});
