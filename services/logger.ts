type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ClientLogEntry {
  timestamp: string;
  level: ClientLogLevel;
  service: string;
  action: string;
  userId?: string;
  metadata?: Record<string, any>;
  error?: string;
}

const LOG_LEVEL_PRIORITY: Record<ClientLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: ClientLogLevel = (import.meta.env.VITE_LOG_LEVEL as ClientLogLevel) || 'warn';

function shouldLog(level: ClientLogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: ClientLogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    entry.level.toUpperCase().padEnd(5),
    `${entry.service}:${entry.action}`,
  ];
  if (entry.error) parts.push(`error="${entry.error}"`);
  if (entry.metadata) parts.push(JSON.stringify(entry.metadata));
  return parts.join(' ');
}

export function createClientLogger(service: string) {
  const log = (level: ClientLogLevel, action: string, extra?: Partial<Omit<ClientLogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => {
    if (!shouldLog(level)) return;

    const entry: ClientLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      action,
      ...extra,
    };

    const formatted = formatEntry(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    debug: (action: string, extra?: Partial<Omit<ClientLogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('debug', action, extra),
    info: (action: string, extra?: Partial<Omit<ClientLogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('info', action, extra),
    warn: (action: string, extra?: Partial<Omit<ClientLogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('warn', action, extra),
    error: (action: string, extra?: Partial<Omit<ClientLogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('error', action, extra),
  };
}
