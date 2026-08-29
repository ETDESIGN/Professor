// ledgerWriter — drains coverage marks into the classroom_sessions
// dealt_objectives ledger (merge_dealt_objectives RPC). Non-React so it is
// unit-testable; useCoverageLedger is the React binding.
import { supabase } from '../../services/supabaseClient';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('LedgerWriter');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBOUNCE_MS = 800;

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
let rpcFn: RpcFn = (fn, args) => supabase.rpc(fn, args) as unknown as Promise<unknown>;

/** Test seam. */
export function configureLedgerRpc(fn: RpcFn): void {
  rpcFn = fn;
}

const pending = new Map<string, { sessionId: string; unitId: string; ids: Set<string> }>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function queueMerge(sessionId: string, unitId: string, objectiveIds: string[]): void {
  if (!UUID_RE.test(sessionId) || !unitId || objectiveIds.length === 0) return;
  const key = `${sessionId}:${unitId}`;
  let entry = pending.get(key);
  if (!entry) {
    entry = { sessionId, unitId, ids: new Set<string>() };
    pending.set(key, entry);
  }
  for (const id of objectiveIds) entry.ids.add(id);
  if (timer === null) {
    timer = setTimeout(() => {
      timer = null;
      void flushLedgerNow();
    }, DEBOUNCE_MS);
  }
}

export async function flushLedgerNow(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const entries = Array.from(pending.values());
  pending.clear();
  for (const e of entries) {
    try {
      await rpcFn('merge_dealt_objectives', {
        p_session_id: e.sessionId,
        p_unit_id: e.unitId,
        p_objective_ids: Array.from(e.ids),
      });
    } catch (err) {
      // Fire-and-forget: the in-memory store remains the working state. A
      // failed flush drops this batch's ids from the DB ledger — later
      // rounds' own writes still land, but this batch is not re-sent.
      log.warn('ledger_merge_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export async function clearLedger(sessionId: string, unitId: string): Promise<void> {
  if (!UUID_RE.test(sessionId) || !unitId) return;
  try {
    await rpcFn('clear_dealt_objectives', { p_session_id: sessionId, p_unit_id: unitId });
  } catch (err) {
    log.warn('ledger_clear_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}
