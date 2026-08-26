import { createClient } from '@supabase/supabase-js';
import { navigatorLock } from '@supabase/auth-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// AUDIT FIX (2026-08-26): with two tabs (or a PWA window + a browser tab)
// open, supabase-js's navigator-lock can fail IMMEDIATELY with
// "Acquiring an exclusive Navigator LockManager lock … failed", killing
// session restore and every authenticated call on the page. Wrap it:
// wait up to 10s for contention to clear, then degrade to running without
// the exclusive lock — the worst case is a redundant session refresh,
// never a dead app. (Same tab always holds the lock in practice.)
const resilientLock: <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R> =
  async (name, acquireTimeout, fn) => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      try {
        return await navigatorLock(name, acquireTimeout === 0 ? 10_000 : acquireTimeout, fn);
      } catch (err) {
        console.warn('[supabase] auth lock unavailable — continuing without it:', err);
      }
    }
    return fn();
  };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { lock: resilientLock },
});
