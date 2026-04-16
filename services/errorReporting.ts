interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

type ErrorReporter = (error: ErrorReport) => void;

let reporter: ErrorReporter | null = null;
let currentUser: { id: string; role?: string } | null = null;

const defaultReporter: ErrorReporter = (report) => {
  if (import.meta.env.DEV) {
    console.error(`[ErrorReport] ${report.message}`, {
      url: report.url,
      userId: report.userId,
      metadata: report.metadata,
      stack: report.stack,
    });
  }
};

reporter = defaultReporter;

export function initErrorReporting(config?: { dsn?: string; environment?: string }) {
  if (!config?.dsn) {
    reporter = defaultReporter;
    return;
  }

  reporter = (report) => {
    defaultReporter(report);

    if (config.dsn) {
      try {
        fetch(config.dsn, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }
  };
}

export function setCurrentUser(user: { id: string; role?: string } | null) {
  currentUser = user;
}

export function reportError(
  error: Error | string,
  metadata?: Record<string, any>
) {
  const report: ErrorReport = {
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userId: currentUser?.id,
    metadata,
    timestamp: new Date().toISOString(),
  };

  reporter?.(report);
}

export function reportApiError(
  endpoint: string,
  status: number,
  message: string,
  metadata?: Record<string, any>
) {
  reportError(new Error(`API ${status}: ${endpoint} - ${message}`), {
    type: 'api_error',
    endpoint,
    status,
    ...metadata,
  });
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
