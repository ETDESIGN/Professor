// attemptsLog.ts — the SEPARATE, non-debounced per-attempt correctness write
// path (architecture §4.4, owner decision 1 resolved 2026-08-05).
//
// WHY THIS EXISTS (not folded into addPoints / awardClassPoints):
//   addPoints() debounces per-student writes (1500ms) — a +30 success and a
//   −5 mistake in the same window coalesce into ONE ledger row. A single
//   metadata.correctness on that row would be meaningless (which attempt won?).
//   So game code calls BOTH:
//     • addPoints(id, delta)  — the leaderboard (existing, untouched)
//     • recordAttempt(...)    — analytics (this module), every attempt gets
//                               its own row with amount=0 + metadata.correctness
//
// WHAT THIS WRITES:
//   A point_transactions row with amount=0, source='attempt', and
//   metadata={correctness, objectiveId, exerciseType, difficulty, sessionId}.
//   Analytics reads filter `source='attempt'` (or `metadata ? 'correctness'`).
//
// DOES NOT touch the points flush. Does NOT addPoints. Purely additive.

import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('AttemptsLog');

export type AttemptCorrectness = 'correct' | 'incorrect' | 'partial';

export interface AttemptRecord {
  /** roster_students.id (the board identity — same id addPoints uses). */
  rosterId: string;
  classId: string | null | undefined;
  /** The profile id if the roster student has claimed a home account
   *  (nullable — unclaimed students still get an attempt row for class-level
   *  accuracy; per-student analytics filters to claimed rows). */
  profileId?: string | null;
  correctness: AttemptCorrectness;
  objectiveId?: string;
  exerciseType?: string;
  difficulty?: number;
  /** Optional session id for tie-breaking concurrent sessions. */
  sessionId?: string;
}

/**
 * Write ONE per-attempt correctness row. Non-debounced by design — every
 * attempt gets its own row so Class Accuracy = correct ÷ total is honest.
 *
 * Non-fatal: logs on failure, never throws (this is analytics, not gameplay —
 * a missed analytics row must not break a live class).
 */
export async function recordAttempt(record: AttemptRecord): Promise<void> {
  if (!record.rosterId) return;
  try {
    const { error } = await supabase.from('point_transactions').insert({
      roster_id: record.rosterId,
      class_id: record.classId ?? null,
      profile_id: record.profileId ?? null,
      amount: 0, // the points delta lives on the SEPARATE addPoints path
      source: 'attempt',
      metadata: {
        correctness: record.correctness,
        objectiveId: record.objectiveId ?? null,
        exerciseType: record.exerciseType ?? null,
        difficulty: record.difficulty ?? null,
        sessionId: record.sessionId ?? null,
      },
    });
    if (error) {
      log.warn('record_attempt_error', { error: error.message, metadata: { correctness: record.correctness } });
    }
  } catch (err) {
    log.warn('record_attempt_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

// =====================================================================
// Analytics reads (architecture §4.4). These compute Class Accuracy and
// Struggling Students from the attempt rows written above.
//
//   Class Accuracy       = correct attempts ÷ total attempts (this session).
//   Struggling Students  = students with attempts_this_session ≥ 2 AND
//                          accuracy_this_session < 60%, sorted ascending.
//
// "This session" = attempts on point_transactions with source='attempt' for
// the given class, since the session start. The caller passes the cutoff
// timestamp (SessionContext tracks session start).
// =====================================================================

export interface ClassAccuracy {
  correct: number;
  total: number;
  accuracy: number; // 0..1; 0 if no attempts
}

export interface StudentAccuracy {
  rosterId: string;
  profileId: string | null;
  correct: number;
  total: number;
  accuracy: number; // 0..1
}

/** Compute class-wide accuracy for attempts in [since, now]. */
export async function classAccuracySince(
  classId: string,
  since: Date,
): Promise<ClassAccuracy> {
  try {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('metadata')
      .eq('class_id', classId)
      .eq('source', 'attempt')
      .gte('created_at', since.toISOString());
    if (error || !data) return { correct: 0, total: 0, accuracy: 0 };

    let correct = 0;
    let total = 0;
    for (const row of data) {
      const m = row.metadata as any;
      if (!m || typeof m.correctness !== 'string') continue;
      total += 1;
      if (m.correctness === 'correct') correct += 1;
      // 'partial' counts as not-fully-correct for the strict ratio; callers
      // wanting a "productive-inclusive" accuracy can re-query with a different
      // roll-up. Keeping the strict definition here so Class Accuracy is
      // unambiguous.
    }
    return { correct, total, accuracy: total > 0 ? correct / total : 0 };
  } catch (err) {
    log.warn('class_accuracy_error', { error: err instanceof Error ? err.message : String(err) });
    return { correct: 0, total: 0, accuracy: 0 };
  }
}

/** Per-student accuracy for attempts in [since, now]. Returns students sorted
 *  weakest-first. Used by the Struggling Students analytics panel
 *  (filter client-side: attempts ≥ 2 AND accuracy < 60%). */
export async function studentAccuracySince(
  classId: string,
  since: Date,
): Promise<StudentAccuracy[]> {
  try {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('roster_id, profile_id, metadata')
      .eq('class_id', classId)
      .eq('source', 'attempt')
      .gte('created_at', since.toISOString());
    if (error || !data) return [];

    const byRoster = new Map<string, StudentAccuracy>();
    for (const row of data) {
      const m = row.metadata as any;
      if (!m || typeof m.correctness !== 'string') continue;
      const key = row.roster_id;
      const acc = byRoster.get(key) ?? {
        rosterId: key,
        profileId: row.profile_id ?? null,
        correct: 0,
        total: 0,
        accuracy: 0,
      };
      acc.total += 1;
      if (m.correctness === 'correct') acc.correct += 1;
      byRoster.set(key, acc);
    }
    const out = Array.from(byRoster.values());
    for (const a of out) a.accuracy = a.total > 0 ? a.correct / a.total : 0;
    // weakest-first (lowest accuracy, tie-break most attempts)
    out.sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
    return out;
  } catch (err) {
    log.warn('student_accuracy_error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
