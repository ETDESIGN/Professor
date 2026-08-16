// ExercisePoolService — teacher/admin surface for the exercise-pool pipeline
// (Phase 3 remediation, audit 2026-08-17). Wraps the generate-exercises edge
// function with job-status polling so UIs can show real progress instead of
// fire-and-forget silence.

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('ExercisePoolService');

export interface GenerationResult {
  success: boolean;
  unitId?: string;
  objectives?: number;
  poolItems?: number;
  error?: string;
  errors?: string[];
}

export interface JobStatus {
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
  error?: string | null;
}

/** Invoke generate-exercises for one unit. Caller must be the unit owner or
 *  an admin (the function's ownership guard enforces this server-side). */
export async function invokeGenerateExercises(unitId: string): Promise<GenerationResult> {
  const { data, error } = await supabase.functions.invoke('generate-exercises', { body: { unitId } });
  if (error) {
    // FunctionsError.message is often generic ("Edge Function returned a
    // non-2xx status") — prefer the body's error field when present.
    const msg = (data as any)?.error || error.message || String(error);
    log.warn('generate_exercises_failed', { metadata: { unitId }, error: msg });
    return { success: false, error: msg };
  }
  return (data as GenerationResult) || { success: false, error: 'Empty response' };
}

/** Poll generation_jobs until the generate-exercises stage reaches a terminal
 *  state (succeeded/failed) or the timeout elapses. */
export async function waitForGenerationJob(
  unitId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<JobStatus> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('status, error')
      .eq('unit_id', unitId)
      .eq('stage', 'generate-exercises')
      .maybeSingle();

    if (!error && data && (data.status === 'succeeded' || data.status === 'failed')) {
      return { status: data.status, error: data.error };
    }
    if (Date.now() >= deadline) {
      return { status: 'unknown', error: error?.message ?? 'Timed out waiting for generation to finish' };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

/** Count of pool_items for a unit (readable by the owner/admin per RLS). */
export async function getPoolCount(unitId: string): Promise<number> {
  const { count, error } = await supabase
    .from('pool_items')
    .select('id', { count: 'exact', head: true })
    .eq('unit_id', unitId);
  if (error) {
    log.warn('pool_count_failed', { metadata: { unitId }, error: error.message });
    return 0;
  }
  return count ?? 0;
}

/** Sequential backfill with pacing: the edge rate limiter allows 10 req/min
 *  per IP, so we space invocations ~7s apart. Stops on the first hard
 *  failure/429 so the user can resume without hammering. Returns per-unit
 *  outcomes for progress display. */
export async function backfillPools(
  unitIds: string[],
  onProgress: (done: number, total: number, unitId: string, ok: boolean) => void,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < unitIds.length; i++) {
    const unitId = unitIds[i];
    if (i > 0) await new Promise(r => setTimeout(r, 7_000));
    const result = await invokeGenerateExercises(unitId);
    if (result.success) ok += 1;
    else failed += 1;
    onProgress(i + 1, unitIds.length, unitId, result.success);
    // A rate-limit / server error mid-run: stop and let the user resume.
    if (!result.success && /rate|429|too many/i.test(result.error || '')) {
      log.warn('backfill_rate_limited', { metadata: { unitId, at: i + 1 } });
      break;
    }
  }
  return { ok, failed };
}
