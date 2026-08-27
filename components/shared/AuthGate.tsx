import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getCurrentUser, hasAccessToPortal } from '../../services/AuthService';
import { supabase } from '../../services/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('AuthGate');

interface AuthGateProps {
  portal: 'admin' | 'teacher' | 'student' | 'parent';
  children: React.ReactNode;
}

// Exact matches only — a '/' entry with startsWith would make EVERY path
// public (audit 2026-08-28 P0-1). Real prefixes are listed explicitly.
const PUBLIC_EXACT = new Set(['/', '/login', '/claim']);
const PUBLIC_PREFIXES = ['/claim/', '/onboarding/'];

export function isPublicPath(p: string): boolean {
  if (PUBLIC_EXACT.has(p)) return true;
  return PUBLIC_PREFIXES.some(prefix => p.startsWith(prefix));
}

function homePathForRole(role: string | undefined): string {
  if (role === 'admin' || role === 'manager') return '/admin';
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  return '/student';
}

/**
 * AuthGate — extracted auth bootstrap for standalone portal entries.
 *
 * Performs the same 3 jobs as App.tsx's session logic:
 *  1. Session check: getCurrentUser → populate useAppStore
 *  2. Portal guard: hasAccessToPortal → explainer screen on role mismatch
 *     (instead of a silent redirect — a teacher opening /student on a phone
 *     used to be bounced to /teacher with no explanation)
 *  3. Auth-state subscription: react to SIGNED_OUT / TOKEN_REFRESHED
 */
export const AuthGate: React.FC<AuthGateProps> = ({ portal, children }) => {
  const { t } = useTranslation();
  const { setUserProfile, clearUserProfile } = useAppStore();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [wrongRole, setWrongRole] = useState<{ role: string; home: string } | null>(null);

  // Session bootstrap
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = await getCurrentUser();
        if (!mounted) return;
        if (user) {
          setUserProfile(user);
          if (!hasAccessToPortal(user.role, portal)) {
            // Role can't access this portal — explain instead of silently
            // redirecting, and let the user pick where to go.
            setWrongRole({ role: user.role || 'user', home: homePathForRole(user.role) });
            setReady(true);
            return;
          }
          setWrongRole(null);
        } else {
          clearUserProfile();
          if (!isPublicPath(location.pathname)) {
            window.location.href = '/login';
            return;
          }
        }
        setReady(true);
      } catch (error) {
        if (!mounted) return;
        log.warn('auth_gate_error', { error: error instanceof Error ? error.message : String(error) });
        clearUserProfile();
        if (!isPublicPath(location.pathname)) {
          window.location.href = '/login';
          return;
        }
        setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, [portal, setUserProfile, clearUserProfile, location.pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Auth-state subscription (mirror App.tsx:130-144)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearUserProfile();
        window.location.href = '/login';
      } else if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        getCurrentUser().then(u => u ? setUserProfile(u) : clearUserProfile());
      }
    });
    return () => subscription.unsubscribe();
  }, [setUserProfile, clearUserProfile]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
      </div>
    );
  }

  if (wrongRole) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-slate-100 p-8 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">{t('auth.wrongPortalTitle', 'This is the wrong app for your account')}</h1>
          <p className="text-slate-500 mb-6">
            {t('auth.wrongPortalBody', 'You are signed in as a {{role}}, but you opened the {{portal}} app.', { role: wrongRole.role, portal })}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => { window.location.href = wrongRole.home; }}
              className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors"
            >
              {t('auth.goToYourApp', 'Open your {{role}} app', { role: wrongRole.role })}
            </button>
            <button
              onClick={handleSignOut}
              className="w-full border border-slate-200 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              {t('auth.wrongPortalSignOut', 'Sign out')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
