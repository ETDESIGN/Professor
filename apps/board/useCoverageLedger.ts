// useCoverageLedger — React binding over coverageStore + ledgerWriter.
// Hydrates the store from the session row's dealt_objectives (realtime),
// and writes marks through to the DB ledger (debounced).
import { useCallback, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';
import { hydrateUnit, markServed, resetUnit } from './coverageStore';
import { clearLedger, queueMerge } from './ledgerWriter';

export function useCoverageLedger(sessionId: string, unitId: string): {
  markServed: (objectiveIds: string[]) => void;
  resetUnit: () => void;
} {
  const { state } = useSession();
  const ledger = state.dealtObjectives?.[unitId];

  // Hydration + drift self-heal (union-merge; idempotent).
  useEffect(() => {
    if (!sessionId || !unitId || !Array.isArray(ledger) || ledger.length === 0) return;
    hydrateUnit(sessionId, unitId, ledger);
  }, [sessionId, unitId, ledger]);

  const markServedLedger = useCallback((objectiveIds: string[]) => {
    if (!sessionId || !unitId) return;
    markServed(sessionId, unitId, objectiveIds);
    queueMerge(sessionId, unitId, objectiveIds);
  }, [sessionId, unitId]);

  const resetUnitLedger = useCallback(() => {
    if (!sessionId || !unitId) return;
    resetUnit(sessionId, unitId);
    void clearLedger(sessionId, unitId);
  }, [sessionId, unitId]);

  return { markServed: markServedLedger, resetUnit: resetUnitLedger };
}
