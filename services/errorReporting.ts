import * as Sentry from '@sentry/react';

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

let currentUser: { id: string; role?: string } | null = null;
let isInitialized = false;

export function initErrorReporting(config?: { dsn?: string; environment?: string; release?: string }) {
  if (!config?.dsn) {
    isInitialized = false;
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment || import.meta.env.MODE,
    release: config.release || 'professor@0.1.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (currentUser) {
        event.user = { id: currentUser.id };
        if (currentUser.role) {
          event.tags = { ...event.tags, role: currentUser.role };
        }
      }
      return event;
    },
  });

  isInitialized = true;
}

export function setCurrentUser(user: { id: string; role?: string } | null) {
  currentUser = user;
  if (isInitialized) {
    if (user) {
      Sentry.setUser({ id: user.id });
      Sentry.setTag('role', user.role || 'unknown');
    } else {
      Sentry.setUser(null);
    }
  }
}

export function reportError(
  error: Error | string,
  metadata?: Record<string, unknown>
) {
  if (isInitialized) {
    Sentry.captureException(typeof error === 'string' ? new Error(error) : error, {
      extra: metadata,
    });
  }

  if (import.meta.env.DEV) {
    console.error(`[ErrorReport] ${typeof error === 'string' ? error : error.message}`, {
      metadata,
      stack: typeof error === 'string' ? undefined : error.stack,
    });
  }
}

export function reportApiError(
  endpoint: string,
  status: number,
  message: string,
  metadata?: Record<string, unknown>
) {
  if (isInitialized) {
    Sentry.captureMessage(`API ${status}: ${endpoint}`, {
      level: status >= 500 ? 'error' : 'warning',
      extra: { endpoint, status, message, ...metadata },
    });
  }

  if (import.meta.env.DEV) {
    console.error(`[API Error] ${status} ${endpoint}: ${message}`, metadata);
  }
}

export function setupGlobalErrorHandler() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, {
      type: 'unhandled_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportError(error, { type: 'unhandled_promise_rejection' });
  });
}

export { Sentry };
