// Direct recordAttempt test (plan 5.1). Mocks the Supabase client so we can assert
// that recordAttempt() integrates FSRS (schedule) + the mastery ladder into a
// correct upsert patch — the LearnerState write path that closes the loop.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the last upsert payload + control the existing-row read.
let lastUpsert: any = null;
let existingRow: any = null;

const chain = () => {
  const c: any = {
    select: () => c,
    eq: () => c,
    in: () => c,
    not: () => c,
    order: () => c,
    limit: () => c,
    update: () => c,
    insert: () => c,
    upsert: (payload: any) => { lastUpsert = payload; return c; },
    maybeSingle: async () => ({ data: existingRow, error: null }),
    single: async () => ({ data: { id: 'srs-1' }, error: null }),
  };
  return c;
};

vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'stu-1' } } }) },
    from: () => chain(),
  },
}));

// Import AFTER the mock is registered.
import { recordAttempt } from '../services/learnerState';

describe('recordAttempt (FSRS + mastery integration)', () => {
  beforeEach(() => { lastUpsert = null; existingRow = null; });

  it('cold-start receptive success advances new -> learning and writes FSRS state', async () => {
    const res = await recordAttempt('stu-1', 'o1', 'good', { modality: 'receptive' });
    expect(res).not.toBeNull();
    expect(res!.effective_mastery).toBe('learning');
    // The upsert patch must carry the FSRS computation + mastery transition.
    expect(lastUpsert).toBeTruthy();
    expect(lastUpsert.student_id).toBe('stu-1');
    expect(lastUpsert.objective_id).toBe('o1');
    expect(lastUpsert.mastery_state).toBe('learning');
    expect(lastUpsert.reps).toBe(1); // successful cold-start sets reps=1
    expect(lastUpsert.stability).toBeGreaterThan(0); // initStability('good')
    expect(lastUpsert.next_review).toBeTruthy(); // scheduled
    expect(lastUpsert.mastery_meta.last_receptive_at).toBeTruthy();
  });

  it('productive lapse resets mastered progress and increments lapses', async () => {
    // Existing row already mastered with some productive wins.
    existingRow = {
      id: 'srs-1', stability: 5, difficulty: 5, reps: 3, lapses: 0,
      mastery_state: 'mastered', mastery_meta: { productive_wins: 3, first_productive_at: '2026-01-01T00:00:00Z' },
      last_review: new Date(Date.now() - 3 * 86400000).toISOString(),
    };
    const res = await recordAttempt('stu-1', 'o1', 'again', { modality: 'productive' });
    expect(res).not.toBeNull();
    expect(res!.effective_mastery).toBe('familiar'); // mastered -> familiar on lapse
    expect(lastUpsert.mastery_state).toBe('familiar');
    expect(lastUpsert.lapses).toBe(1);
    // Productive progress reset (so re-mastery needs 3 fresh wins).
    expect(lastUpsert.mastery_meta.productive_wins).toBe(0);
    expect(lastUpsert.mastery_meta.first_productive_at).toBeNull();
  });
});
