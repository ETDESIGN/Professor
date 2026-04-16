type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  action: string;
  userId?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: string;
}

function formatLog(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    entry.level.toUpperCase().padEnd(5),
    `service=${entry.service}`,
    `action=${entry.action}`,
  ];
  if (entry.userId) parts.push(`userId=${entry.userId}`);
  if (entry.durationMs !== undefined) parts.push(`duration=${entry.durationMs}ms`);
  if (entry.error) parts.push(`error="${entry.error}"`);
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    parts.push(`meta=${JSON.stringify(entry.metadata)}`);
  }
  return parts.join(' ');
}

export function createLogger(service: string) {
  const log = (level: LogLevel, action: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      action,
      ...extra,
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'info':
        console.log(formatted);
        break;
      case 'debug':
        console.log(formatted);
        break;
    }

    return entry;
  };

  return {
    debug: (action: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('debug', action, extra),
    info: (action: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('info', action, extra),
    warn: (action: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('warn', action, extra),
    error: (action: string, extra?: Partial<Omit<LogEntry, 'timestamp' | 'level' | 'service' | 'action'>>) => log('error', action, extra),
  };
}
