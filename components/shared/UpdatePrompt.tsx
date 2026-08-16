// UpdatePrompt — surfaces "new version available" so already-open tabs reload.
//
// WHY THIS EXISTS: the app is a PWA (vite-plugin-pwa). When a new build
// deploys, the service worker installs and enters `waiting` (because we use
// registerType: 'prompt' and do NOT set skipWaiting). Without this component
// there is no UI to notify the user, so an open tab keeps running the OLD
// in-memory bundle indefinitely — the silent-staleness bug that masked the
// LiveCommander fixes (commits 5521847 / a44e1bb).
//
// FLOW:
//   1. New deploy ships → SW installs → fires `onNeedRefresh` → needRefresh=true.
//   2. This banner appears. The user picks WHEN to reload (important for a
//      live-classroom tool — we never auto-reload mid-lesson).
//   3. "Reload now" → updateServiceWorker(true) posts SKIP_WAITING → the waiting
//      SW activates → the page reloads into the new bundle.
//   4. "Later" hides the banner for the current session; it returns on the next
//      page load while a newer version is still waiting.
//
// Mount once per entry (see index.tsx / *Entry.tsx). See AGENTS.md §8.1.

import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from 'sonner';

export const UpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // One-shot toast the first time the SW caches everything for offline use.
  // (Distinct from the update banner — this fires once per browser, not per
  // deploy, and has no action beyond acknowledgement.)
  useEffect(() => {
    if (offlineReady) {
      toast.success('App ready to work offline', { duration: 4000 });
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,440px)]">
      <div className="flex items-center gap-3 bg-slate-900 border border-indigo-500/50 shadow-2xl rounded-2xl px-4 py-3">
        <div className="w-9 h-9 shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <span className="text-lg" aria-hidden>🔄</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-tight">A new version is available</p>
          <p className="text-xs text-slate-400 leading-tight mt-0.5">Reload to get the latest update.</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-3.5 py-2 rounded-lg transition-colors"
        >
          Reload
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          className="shrink-0 text-slate-400 hover:text-slate-200 text-sm font-bold px-2 py-2 transition-colors"
          aria-label="Dismiss update notification"
          title="Later"
        >
          Later
        </button>
      </div>
    </div>
  );
};

export default UpdatePrompt;
