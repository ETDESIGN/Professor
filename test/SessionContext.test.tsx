import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../services/supabaseClient', () => {
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb?: (s: string) => void) => {
      if (typeof cb === 'function') cb('SUBSCRIBED');
      return channelMock;
    }),
    send: vi.fn(),
  };

  // Chainable query builder mock for classroom_sessions persistence.
  const updateSpy = vi.fn();
  const upsertSpy = vi.fn();
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn((patch: any) => { updateSpy(patch); return builder; }),
    upsert: vi.fn((row: any) => { upsertSpy(row); return builder; }),
  };

  return {
    supabase: {
      channel: vi.fn().mockReturnValue(channelMock),
      removeChannel: vi.fn(),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'teacher-1' } } })) },
      from: vi.fn(() => builder),
      __updateSpy: updateSpy,
      __upsertSpy: upsertSpy,
    },
  };
});

vi.mock('../services/DataService', () => ({
  getTeacherStudents: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/SupabaseService', () => ({
  Engine: {
    fetchUnits: vi.fn().mockResolvedValue([
      {
        id: 'unit-1',
        title: 'Test Unit',
        flow: [
          { type: 'FOCUS_CARDS', data: { title: 'Cards', cards: [] } },
          { type: 'STORY_STAGE', data: { title: 'Story', pages: [] } },
          { type: 'GAME_ARENA', data: { questions: [] } },
        ],
      },
    ]),
    getUnitById: vi.fn().mockResolvedValue({
      id: 'unit-1',
      title: 'Test Unit',
      flow: [
        { type: 'FOCUS_CARDS', data: { title: 'Cards', cards: [] } },
        { type: 'STORY_STAGE', data: { title: 'Story', pages: [] } },
        { type: 'GAME_ARENA', data: { questions: [] } },
      ],
    }),
    updateUnit: vi.fn().mockResolvedValue(undefined),
    unlockNextUnit: vi.fn().mockResolvedValue(undefined),
  },
}));

import { SessionProvider, useSession } from '../store/SessionContext';
import { supabase } from '../services/supabaseClient';

const TestConsumer = () => {
  const { state, startSession, endSession, nextSlide, prevSlide, goToSlide, addPoints, setActiveUnit } = useSession();

  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="step-index">{state.currentStepIndex}</div>
      <div data-testid="connected">{String(state.isConnected)}</div>
      <div data-testid="students-count">{state.students.length}</div>
      <div data-testid="points-log-length">{state.pointsLog.length}</div>
      <button data-testid="btn-start" onClick={startSession}>Start</button>
      <button data-testid="btn-end" onClick={endSession}>End</button>
      <button data-testid="btn-next" onClick={nextSlide}>Next</button>
      <button data-testid="btn-prev" onClick={prevSlide}>Prev</button>
      <button data-testid="btn-goto-2" onClick={() => goToSlide(2)}>GoTo 2</button>
      <button data-testid="btn-points" onClick={() => addPoints('s1', 10)}>Add Points</button>
      <button data-testid="btn-set-unit" onClick={() => setActiveUnit('unit-1')}>Set Unit</button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <SessionProvider>
      <TestConsumer />
    </SessionProvider>
  );
};

describe('SessionContext - State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in IDLE status', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('status')).toHaveTextContent('IDLE');
  });

  it('transitions to LIVE on startSession', async () => {
    renderWithProvider();
    const statusEl = await screen.findByTestId('status');

    act(() => {
      screen.getByTestId('btn-start').click();
    });

    expect(statusEl).toHaveTextContent('LIVE');
  });

  it('transitions back to IDLE on endSession', async () => {
    renderWithProvider();
    const statusEl = await screen.findByTestId('status');

    act(() => {
      screen.getByTestId('btn-start').click();
    });
    expect(statusEl).toHaveTextContent('LIVE');

    act(() => {
      screen.getByTestId('btn-end').click();
    });
    expect(statusEl).toHaveTextContent('IDLE');
  });

  it('resets step index to 0 on endSession', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => {
      screen.getByTestId('btn-start').click();
    });

    act(() => {
      screen.getByTestId('btn-end').click();
    });

    expect(screen.getByTestId('step-index')).toHaveTextContent('0');
  });
});

describe('SessionContext - Slide Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts at step index 0', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('step-index')).toHaveTextContent('0');
  });
});

describe('SessionContext - Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets isConnected to true when subscription succeeds', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('connected')).toHaveTextContent('true');
  });
});

describe('SessionContext - Points', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty points log', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('points-log-length')).toHaveTextContent('0');
  });

  it('adds entry to points log on addPoints', async () => {
    renderWithProvider();
    await screen.findByTestId('points-log-length');

    act(() => {
      screen.getByTestId('btn-points').click();
    });

    expect(screen.getByTestId('points-log-length')).toHaveTextContent('1');
  });
});

describe('SessionContext - Students', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with students loaded from DataService', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('students-count')).toHaveTextContent('0');
  });
});

describe('SessionContext - Classroom Session Sync (Phase 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists unit selection to classroom_sessions (upsert) on setActiveUnit', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    await act(async () => {
      screen.getByTestId('btn-set-unit').click();
    });

    const upsertSpy = (supabase as any).__upsertSpy;
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ teacher_id: 'teacher-1', unit_id: 'unit-1', current_index: 0, status: 'LIVE' }),
    );
  });

  it('persists current_index to classroom_sessions on goToSlide', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    await act(async () => {
      screen.getByTestId('btn-set-unit').click();
    });

    await act(async () => {
      screen.getByTestId('btn-goto-2').click();
    });

    const updateSpy = (supabase as any).__updateSpy;
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ current_index: 2 }));
  });

  it('persists status to classroom_sessions on startSession / endSession', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    await act(async () => {
      screen.getByTestId('btn-start').click();
    });
    expect((supabase as any).__updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'LIVE' }));

    await act(async () => {
      screen.getByTestId('btn-end').click();
    });
    expect((supabase as any).__updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'IDLE', current_index: 0 }));
  });
});
