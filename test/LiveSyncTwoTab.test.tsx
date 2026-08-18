// LiveSyncTwoTab (FIXPLAN E2.7) — the automated "two-tab check".
//
// Mounts TWO SessionProviders over a shared in-memory Supabase fake: the
// broadcast bus honours broadcast:{self:false} (a send reaches only the OTHER
// tab's channel) and row UPDATEs fire postgres_changes events to every
// classroom_session_sync subscriber — so both sync paths (fast broadcast +
// authoritative row) are exercised for real.
//
// Covers the Phase 2 acceptance criteria:
//   1. pick on tab A ⇒ tab A and tab B agree (responder, wheel, reveal deadline)
//   2. the row carries live_state + seq (CAS bumped)
//   3. every tab derives the reveal at revealAt (the old one-tab timer chain
//      is gone — no cross-tab broadcast dependency)
//   4. a THIRD tab mounting mid-turn (refresh / late join) restores the live
//      turn from the row — the flagship refresh-recovery guarantee
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';

// ── Module mocks (hoisted; supabase swapped per-test via the getter) ───────
const mockSupabase = vi.hoisted(() => ({ current: null as any }));

vi.mock('../services/supabaseClient', () => ({
  get supabase() { return mockSupabase.current; },
}));

vi.mock('../services/SupabaseService', () => ({
  Engine: {
    fetchUnits: async () => [],
    getUnitById: async (id: string) => ({
      id,
      flow: [{ type: 'SPLASH', title: 's0' }, { type: 'GAME', title: 's1' }],
    }),
    updateUnit: async () => {},
  },
}));

vi.mock('../services/DataService', () => ({
  getTeacherStudents: async () => [
    { id: 's1', full_name: 'Leo', xp: 0 },
    { id: 's2', full_name: 'Mia', xp: 0 },
    { id: 's3', full_name: 'Ada', xp: 0 },
  ],
  getSessionRoster: async () => [],
  awardClassPoints: async () => {},
}));

vi.mock('../services/AttendanceService', () => ({
  getOrCreateActiveOccurrence: async () => ({ id: null, error: null }),
  endOccurrence: async () => {},
  getAttendanceForOccurrence: async () => [],
}));

vi.mock('../services/logger', () => ({
  createClientLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

import { SessionProvider, useSession } from '../store/SessionContext';

// ── In-memory Supabase fake ────────────────────────────────────────────────
type Row = Record<string, any>;

const TEACHER_ID = 'teacher-1';

const makeFakeSupabase = () => {
  const rows: Record<string, Row[]> = { classroom_sessions: [] };

  interface FakeChannel {
    name: string;
    broadcastHandlers: Array<(msg: any) => void>;
    pgHandlers: Array<{ table: string; cb: (payload: any) => void }>;
    subscribe: (cb?: (status: string) => void) => FakeChannel;
    on: (kind: string, filter: any, cb: (payload: any) => void) => FakeChannel;
    send: (msg: any) => void;
  }

  const channels: FakeChannel[] = [];

  const notifyPgChange = (table: string, row: Row) => {
    for (const ch of channels) {
      for (const h of ch.pgHandlers) {
        if (h.table === table) h.cb({ new: { ...row } });
      }
    }
  };

  const makeChannel = (name: string): FakeChannel => {
    const ch: FakeChannel = {
      name,
      broadcastHandlers: [],
      pgHandlers: [],
      subscribe(cb?: (status: string) => void) {
        if (cb) setTimeout(() => cb('SUBSCRIBED'), 0);
        return ch;
      },
      on(kind: string, filter: any, cb: (payload: any) => void) {
        if (kind === 'broadcast') ch.broadcastHandlers.push((msg) => cb({ payload: msg.payload }));
        else ch.pgHandlers.push({ table: filter?.table, cb });
        return ch;
      },
      send(msg: any) {
        // self:false — deliver to OTHER instances of the same channel only.
        for (const other of channels) {
          if (other !== ch && other.name === name) {
            for (const h of [...other.broadcastHandlers]) h(msg);
          }
        }
      },
    };
    channels.push(ch);
    return ch;
  };

  const matches = (r: Row, filters: Array<[string, any]>) =>
    filters.every(([k, v]) => r[k] === v);

  // Chainable AND thenable query builder, like supabase-js. .select() stays
  // chainable (update().select().eq() applies filters to the write); awaiting
  // executes: the write when op is set, the select otherwise. maybeSingle/
  // single shape the result as one row or null.
  const makeBuilder = (
    table: string,
    filters: Array<[string, any]> = [],
    payload?: Row,
    op?: 'update' | 'upsert',
    single = false,
  ) => {
    const resolve = async () => {
      if (op === 'update') {
        const found = rows[table].filter((r) => matches(r, filters));
        if (found.length === 0) return { data: [], error: null }; // CAS miss: 0 rows affected
        Object.assign(found[0], payload, { updated_at: new Date().toISOString() });
        if (table === 'classroom_sessions') notifyPgChange(table, found[0]);
        return { data: [found[0]], error: null };
      }
      if (op === 'upsert') {
        const key = payload?.teacher_id != null
          ? ([['teacher_id', payload.teacher_id]] as Array<[string, any]>)
          : [];
        let row = rows[table].find((r) => matches(r, key));
        if (!row) {
          // Column defaults, as the real table has them (seq 0, live_state {}).
          row = table === 'classroom_sessions'
            ? { seq: 0, live_state: {}, ...payload }
            : { ...payload };
          rows[table].push(row);
        } else {
          Object.assign(row, payload);
        }
        if (table === 'classroom_sessions') notifyPgChange(table, row);
        return { data: [row], error: null };
      }
      const found = rows[table].filter((r) => matches(r, filters));
      return { data: single ? found[0] ?? null : [...found], error: null };
    };
    const b: any = {
      select: () => makeBuilder(table, filters, payload, op, single),
      maybeSingle: () => makeBuilder(table, filters, payload, op, true),
      single: () => makeBuilder(table, filters, payload, op, true),
      eq: (k: string, v: any) => makeBuilder(table, [...filters, [k, v]], payload, op, single),
      update: (patch: Row) => makeBuilder(table, filters, patch, 'update', single),
      upsert: (row: Row) => makeBuilder(table, filters, row, 'upsert', single),
      then: (res: any, rej: any) => resolve().then(res, rej),
    };
    return b;
  };

  return {
    supabase: {
      channel: (name: string) => makeChannel(name),
      removeChannel: () => {},
      from: (table: string) => makeBuilder(table),
      rpc: async () => ({ data: null, error: null }),
      auth: { getUser: async () => ({ data: { user: { id: TEACHER_ID } } }) },
    },
    rows,
    channels,
  };
};

// ── Probe: captures each provider's latest session object ──────────────────
const latest: Record<string, ReturnType<typeof useSession>> = {};
function Probe({ tag }: { tag: string }) {
  latest[tag] = useSession();
  return <div data-testid={`probe-${tag}`}>{latest[tag].state.quickWheelWinner ?? 'none'}</div>;
}

// updateLiveTurn's row write chains several awaited steps (auth → CAS write →
// conflict read → upsert); flush enough microtask ticks for it to land.
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('two-tab live sync convergence (FIXPLAN E2)', () => {
  let fake: ReturnType<typeof makeFakeSupabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = makeFakeSupabase();
    mockSupabase.current = fake.supabase;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const mountTwoTabs = () =>
    render(
      <React.Fragment>
        <SessionProvider><Probe tag="A" /></SessionProvider>
        <SessionProvider><Probe tag="B" /></SessionProvider>
      </React.Fragment>,
    );

  it('pick on tab A converges tab B; reveal derives on BOTH tabs; a third tab refresh-restores the live turn', async () => {
    mountTwoTabs();
    await settle(10);
    await flush();
    expect(latest.A.state.students.length).toBe(3);
    expect(latest.B.state.students.length).toBe(3);

    // 1. Pick on tab A.
    await act(async () => { latest.A.selectNextStudent(); });
    await flush();

    const a = latest.A.state;
    const b = latest.B.state;
    expect(a.quickWheelWinner).toBeTruthy();
    expect(b.quickWheelWinner).toBe(a.quickWheelWinner);           // same responder
    expect(b.activeOverlay).toBe('QUICK_WHEEL');                    // wheel open everywhere
    expect(a.currentTurnId).toBeNull();                             // turn NOT started yet
    expect(b.currentTurnId).toBeNull();
    expect(b.turnRevealAt).toBe(a.turnRevealAt);                    // shared reveal deadline
    expect(a.turnRevealAt! - Date.now()).toBeLessThanOrEqual(2500); // ~SPIN_REVEAL_MS

    // 2. The authoritative row carries live_state + a CAS-bumped seq.
    const row = fake.rows.classroom_sessions[0];
    expect(row).toBeTruthy();
    expect(row.live_state.responderId).toBe(a.quickWheelWinner);
    expect(row.seq).toBeGreaterThanOrEqual(1);

    // 3. Reveal derives on BOTH tabs at revealAt — no cross-tab chain needed.
    await settle(2600);
    await flush();
    expect(latest.A.state.currentTurnId).toBe(row.live_state.turnToken);
    expect(latest.B.state.currentTurnId).toBe(row.live_state.turnToken);
    expect(latest.A.state.activeOverlay).toBe('NONE');
    expect(latest.B.state.activeOverlay).toBe('NONE');

    // 4. Third tab mounts mid-turn (board refresh): restores the LIVE turn
    //    from the row — picked student + active turn, reveal already derived.
    //    (flush FIRST so hydration lands and the 0ms reveal timer schedules,
    //    THEN advance the clock to fire it.)
    render(<SessionProvider><Probe tag="C" /></SessionProvider>);
    await flush();
    await settle(20);
    await flush();
    const c = latest.C.state;
    expect(c.quickWheelWinner).toBe(row.live_state.responderId);
    expect(c.currentTurnId).toBe(row.live_state.turnToken);
    expect(c.activeOverlay).toBe('NONE');
    expect(c.quickWheelWinner).toBe(row.live_state.responderId);
    expect(c.currentTurnId).toBe(row.live_state.turnToken);
    expect(c.activeOverlay).toBe('NONE');
  });

  it('cancelTurn clears the authoritative row: a later refresh starts choral', async () => {
    mountTwoTabs();
    await settle(10);
    await flush();

    await act(async () => { latest.A.selectNextStudent(); });
    await flush();
    const winner = latest.A.state.quickWheelWinner;
    expect(winner).toBeTruthy();
    expect(fake.rows.classroom_sessions[0].live_state.responderId).toBe(winner);

    // Cancel mid-spin (before reveal).
    await act(async () => { latest.A.cancelTurn(); });
    await flush();
    await settle(2600);
    await flush();

    expect(latest.A.state.currentTurnId).toBeNull();
    expect(latest.B.state.currentTurnId).toBeNull();
    expect(fake.rows.classroom_sessions[0].live_state.responderId).toBeNull();

    // A fresh tab now hydrates into choral mode (no resurrected turn).
    render(<SessionProvider><Probe tag="C" /></SessionProvider>);
    await settle(20);
    await flush();
    expect(latest.C.state.quickWheelWinner).toBeNull();
    expect(latest.C.state.currentTurnId).toBeNull();
  });

  it('slide change clears the in-flight spin everywhere and releases the pick guard', async () => {
    mountTwoTabs();
    await settle(10);
    await flush();

    await act(async () => { latest.A.setActiveUnit('u1'); });
    await flush();
    await settle(10);
    expect(latest.A.state.currentStepIndex).toBe(0);
    expect(latest.B.state.activeUnit?.id).toBe('u1');

    await act(async () => { latest.A.selectNextStudent(); });
    await flush();
    expect(latest.B.state.quickWheelWinner).toBeTruthy();

    // Advance a slide MID-SPIN (before reveal).
    await act(async () => { latest.A.goToSlide(1); });
    await flush();
    await settle(2600);
    await flush();

    // No stray NEW_TURN fired on either tab, and the row is clean.
    expect(latest.A.state.currentTurnId).toBeNull();
    expect(latest.B.state.currentTurnId).toBeNull();
    expect(latest.B.state.currentStepIndex).toBe(1);
    expect(fake.rows.classroom_sessions[0].live_state.responderId).toBeNull();
    // The spin guard released: the teacher can pick again immediately.
    await act(async () => { latest.A.selectNextStudent(); });
    await flush();
    expect(latest.A.state.quickWheelWinner).toBeTruthy();
  });
});
