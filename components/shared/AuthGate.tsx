import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCurrentUser, hasAccessToPortal } from '../../services/AuthService';
import { supabase } from '../../services/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('AuthGate');

interface AuthGateProps {
  portal: 'admin' | 'teacher' | 'student' | 'parent';
  children: React.ReactNode;
}

const PUBLIC_PATHS = ['/login', '/', '/claim'];

function isPublicPath(p: string): boolean {
  return PUBLIC_PATHS.some(pp => p === pp || p.startsWith(pp));
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
 *  2. Portal guard: hasAccessToPortal → redirect if role mismatch
 *  3. Auth-state subscription: react to SIGNED_OUT / TOKEN_REFRESHED
 *
 * Standalone entries (adminEntry, teacherEntry, etc.) use BrowserRouter
 * with a basename (e.g. "/admin"), so login redirects use
 * window.location.href to reach the root /login served by index.html.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ portal, children }) => {
  const { setUserProfile, clearUserProfile } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);

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
            // Role can't access this portal — send them to their home portal.
            const home = homePathForRole(user.role);
            window.location.href = home;
            return;
          }
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
  }, [portal, setUserProfile, clearUserProfile, navigate, location.pathname]);

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

  return <>{children}</>;
};

export default AuthGate;
