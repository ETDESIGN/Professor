import React, { Component, ErrorInfo, ReactNode } from 'react';
import { reportError } from '../../services/errorReporting';

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** True when we've already auto-reloaded once for a chunk-load failure this
   *  session — used to avoid an infinite reload loop. */
  retriedChunkReload: boolean;
}

const CHUNK_FAIL = /dynamically imported module|error loading|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RETRY_KEY = 'route_eb_chunk_reloaded';

/**
 * Detects a stale-chunk / dynamic-import failure (common after a new deploy:
 * the service worker or cached index references an old chunk hash that no longer
 * exists) and AUTO-RELOADS the page once to fetch the fresh bundles. If a reload
 * doesn't fix it, shows a clear "clear cache / hard refresh" message.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retriedChunkReload: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const alreadyRetried = sessionStorage.getItem(RETRY_KEY) === '1';
    const isChunkFail = CHUNK_FAIL.test(error?.message || '');
    // Auto-reload once to pick up fresh chunks after a deploy.
    if (isChunkFail && !alreadyRetried && typeof window !== 'undefined') {
      sessionStorage.setItem(RETRY_KEY, '1');
      window.location.reload();
    }
    return { hasError: true, error, retriedChunkReload: alreadyRetried };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportError(error, { component: this.props.name || 'unknown', ...errorInfo });
  }

  private hardReload = () => {
    sessionStorage.removeItem(RETRY_KEY);
    // Bypass any service-worker cache for this navigation.
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkFail = CHUNK_FAIL.test(this.state.error?.message || '');
      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
          <div className="text-4xl mb-4">{isChunkFail ? '🔄' : '⚠️'}</div>
          <h2 className="text-lg font-bold text-slate-700 mb-2">
            {isChunkFail ? 'Updating the app…' : 'Something went wrong'}
          </h2>
          <p className="text-slate-500 text-sm mb-4 text-center max-w-sm">
            {isChunkFail
              ? this.state.retriedChunkReload
                ? 'A newer version is available but your browser cached the old one. Clear the cache to continue.'
                : 'Reloading to get the latest version…'
              : this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={isChunkFail ? this.hardReload : () => this.setState({ hasError: false, error: null, retriedChunkReload: false })}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors"
          >
            {isChunkFail ? 'Clear cache & reload' : 'Try Again'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
