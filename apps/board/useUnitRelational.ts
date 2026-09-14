// useUnitRelational — board-side relational bundle recovery.
//
// ROUND-2 #7 (2026-09-15): getStory()/scene art resolve pages from
// manifest._relational, which the COMMANDER attaches via setActiveUnit — but
// the live board hydrates from the session row without it, so story surfaces
// rendered zero pages ("comprehension question with no story") and art fell
// back to placeholders. This hook re-fetches the bundle on the board tab and
// attaches it exactly the way setActiveUnit does. (Pattern extracted from
// Anti-Gravity's BoardStoryStage.ag.tsx live-asset recovery.)
import { useEffect, useState } from 'react';
import { useSession } from '../../store/SessionContext';
import { supabase } from '../../services/supabaseClient';

export function useUnitRelational(): boolean {
  const { state } = useSession();
  const unit: any = state.activeUnit;
  const manifest = unit?.manifest;
  const has = Boolean(manifest && typeof manifest === 'object' && (manifest as any)._relational);
  const [, bump] = useState(0);

  useEffect(() => {
    if (has || !unit?.id || !manifest || typeof manifest !== 'object') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_unit_bundle', { p_unit_id: unit.id });
        if (cancelled || !data) return;
        try {
          Object.defineProperty(manifest, '_relational', { value: data, enumerable: false, configurable: true });
        } catch {
          (manifest as any)._relational = data;
        }
        bump((n) => n + 1); // re-render so getStory() re-resolves pages
      } catch {
        // keep frozen-fallback rendering — the board never blocks on this
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id, has]);

  return has;
}
