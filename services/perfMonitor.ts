import { Sentry } from './errorReporting';
import { createClientLogger } from './logger';

const log = createClientLogger('PerfMonitor');

interface PerfSpan {
  name: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

const activeSpans = new Map<string, PerfSpan>();

export function startSpan(name: string, metadata?: Record<string, unknown>): string {
  const spanId = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  activeSpans.set(spanId, { name, startTime: performance.now(), metadata });
  return spanId;
}

export function endSpan(spanId: string, status: 'ok' | 'error' = 'ok'): number | null {
  const span = activeSpans.get(spanId);
  if (!span) return null;

  const duration = performance.now() - span.startTime;
  activeSpans.delete(spanId);

  log.debug(`span:${span.name}`, {
    metadata: {
      durationMs: Math.round(duration),
      status,
      ...span.metadata,
    },
  });

  if (duration > 5000) {
    log.warn(`slow:${span.name}`, {
      metadata: { durationMs: Math.round(duration), ...span.metadata },
    });
  }

  return duration;
}

export function trackEdgeFunctionCall(functionName: string) {
  const spanId = startSpan(`edge:${functionName}`);
  return {
    success: (result?: unknown) => {
      const dur = endSpan(spanId, 'ok');
      if (dur !== null) {
        recordMetric('edge_function_latency', dur, {
          function: functionName,
          status: 'success',
        });
      }
      return result;
    },
    error: (error: unknown) => {
      const dur = endSpan(spanId, 'error');
      if (dur !== null) {
        recordMetric('edge_function_latency', dur, {
          function: functionName,
          status: 'error',
        });
      }
      throw error;
    },
  };
}

export function trackSupabaseQuery(queryName: string) {
  const spanId = startSpan(`db:${queryName}`);
  return {
    success: (result?: unknown) => {
      const dur = endSpan(spanId, 'ok');
      if (dur !== null) {
        recordMetric('supabase_query_latency', dur, {
          query: queryName,
          status: 'success',
        });
      }
      return result;
    },
    error: (error: unknown) => {
      const dur = endSpan(spanId, 'error');
      if (dur !== null) {
        recordMetric('supabase_query_latency', dur, {
          query: queryName,
          status: 'error',
        });
      }
      throw error;
    },
  };
}

interface MetricEntry {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

const metricsBuffer: MetricEntry[] = [];
const FLUSH_INTERVAL = 30_000;
const MAX_BUFFER_SIZE = 100;

function recordMetric(name: string, value: number, tags: Record<string, string> = {}) {
  metricsBuffer.push({ name, value, tags, timestamp: Date.now() });

  if (metricsBuffer.length >= MAX_BUFFER_SIZE) {
    flushMetrics();
  }
}

function flushMetrics() {
  if (metricsBuffer.length === 0) return;

  const batch = metricsBuffer.splice(0);
  const aggregated = aggregateMetrics(batch);

  log.info('metrics_flush', {
    metadata: {
      count: batch.length,
      aggregates: Object.keys(aggregated).length,
    },
  });

  Sentry.addBreadcrumb({
    category: 'metrics',
    message: `${batch.length} metrics flushed`,
    data: aggregated,
    level: 'info',
  });
}

function aggregateMetrics(entries: MetricEntry[]): Record<string, { count: number; avg: number; max: number; min: number }> {
  const groups: Record<string, number[]> = {};

  for (const entry of entries) {
    const key = `${entry.name}:${Object.entries(entry.tags).sort().map(([k, v]) => `${k}=${v}`).join(',')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry.value);
  }

  const result: Record<string, { count: number; avg: number; max: number; min: number }> = {};
  for (const [key, values] of Object.entries(groups)) {
    result[key] = {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      min: Math.min(...values),
    };
  }
  return result;
}

let flushTimer: ReturnType<typeof setInterval> | null = null;

export function startMetricsCollection() {
  if (flushTimer) return;
  flushTimer = setInterval(flushMetrics, FLUSH_INTERVAL);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushMetrics);
  }
}

export function stopMetricsCollection() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  flushMetrics();
}
