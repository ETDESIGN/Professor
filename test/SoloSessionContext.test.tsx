import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../services/supabaseClient', () => {
  const channelMock = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb: (s: string) => void) => {
      cb('SUBSCRIBED');
      return channelMock;
    }),
    send: vi.fn(),
  };
  return {
    supabase: {
      channel: vi.fn().mockReturnValue(channelMock),
      removeChannel: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { avatar_url: null } }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    },
  };
});

vi.mock('../services/DataService', () => ({
  getTeacherStudents: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/SupabaseService', () => ({
  Engine: {
    fetchUnits: vi.fn().mockResolvedValue([
      { id: 'unit-1', title: 'Animals', level: 'A1', status: 'Active', topic: 'Vocabulary', flow: [
        { type: 'INTRO_SPLASH', data: { title: 'Animals' } },
        { type: 'FOCUS_CARDS', data: { title: 'Cards', cards: [{ front: 'cat', back: 'cat' }] } },
        { type: 'SPEED_QUIZ', data: { questions: [{ id: 'q1', text: 'Q?', options: ['A', 'B'], correct: 'A' }] } },
      ]},
      { id: 'unit-2', title: 'Colors', level: 'A1', status: 'Locked', topic: 'Vocabulary', flow: [] },
    ]),
    getUnitById: vi.fn().mockResolvedValue({
      id: 'unit-1', title: 'Animals', level: 'A1', status: 'Active', topic: 'Vocabulary', flow: [
        { type: 'INTRO_SPLASH', data: { title: 'Animals' } },
        { type: 'FOCUS_CARDS', data: { title: 'Cards', cards: [{ front: 'cat', back: 'cat' }] } },
        { type: 'SPEED_QUIZ', data: { questions: [{ id: 'q1', text: 'Q?', options: ['A', 'B'], correct: 'A' }] } },
      ],
    }),
    updateUnit: vi.fn().mockResolvedValue(undefined),
    unlockNextUnit: vi.fn().mockResolvedValue(undefined),
    getStudentProgress: vi.fn().mockResolvedValue({ xp: 100, streak: 3 }),
    updateStudentProgress: vi.fn().mockResolvedValue(undefined),
  },
}));

import { SoloSessionProvider } from '../store/SoloSessionContext';
import { useSession } from '../store/SessionContext';

const TestConsumer = () => {
  const { state, startSession, endSession, nextSlide, prevSlide, goToSlide, addPoints, setActiveUnit } = useSession();

  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <div data-testid="step-index">{state.currentStepIndex}</div>
      <div data-testid="connected">{String(state.isConnected)}</div>
      <div data-testid="units-count">{state.units.length}</div>
      <div data-testid="score">{state.score ?? 0}</div>
      <div data-testid="active-unit">{state.activeUnit?.title || 'none'}</div>
      <div data-testid="slide-type">{state.activeSlideData?.type || 'none'}</div>
      <button data-testid="btn-start" onClick={startSession}>Start</button>
      <button data-testid="btn-end" onClick={endSession}>End</button>
      <button data-testid="btn-next" onClick={nextSlide}>Next</button>
      <button data-testid="btn-prev" onClick={prevSlide}>Prev</button>
      <button data-testid="btn-goto-1" onClick={() => goToSlide(1)}>GoTo 1</button>
      <button data-testid="btn-points" onClick={() => addPoints('solo', 10)}>Add Points</button>
      <button data-testid="btn-set-unit" onClick={() => setActiveUnit('unit-1')}>Set Unit</button>
    </div>
  );
};

const renderWithProvider = () => {
  return render(
    <SoloSessionProvider>
      <TestConsumer />
    </SoloSessionProvider>
  );
};

describe('SoloSessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts in IDLE status', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('status')).toHaveTextContent('IDLE');
  });

  it('loads units on mount', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('units-count')).toHaveTextContent('2');
  });

  it('starts with isConnected true (no realtime needed)', async () => {
    renderWithProvider();
    expect(await screen.findByTestId('connected')).toHaveTextContent('true');
  });

  it('transitions to LIVE on startSession', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-start').click(); });
    expect(screen.getByTestId('status')).toHaveTextContent('LIVE');
  });

  it('transitions back to IDLE on endSession', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-start').click(); });
    act(() => { screen.getByTestId('btn-end').click(); });
    expect(screen.getByTestId('status')).toHaveTextContent('IDLE');
  });

  it('sets active unit and loads first slide', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-set-unit').click(); });

    const activeUnit = await screen.findByTestId('active-unit');
    expect(activeUnit).toHaveTextContent('Animals');

    const slideType = screen.getByTestId('slide-type');
    expect(slideType).toHaveTextContent('INTRO_SPLASH');
  });

  it('navigates slides with nextSlide/prevSlide', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-set-unit').click(); });
    await screen.findByTestId('active-unit');

    expect(screen.getByTestId('step-index')).toHaveTextContent('0');
    expect(screen.getByTestId('slide-type')).toHaveTextContent('INTRO_SPLASH');

    act(() => { screen.getByTestId('btn-next').click(); });
    expect(screen.getByTestId('step-index')).toHaveTextContent('1');
    expect(screen.getByTestId('slide-type')).toHaveTextContent('FOCUS_CARDS');

    act(() => { screen.getByTestId('btn-prev').click(); });
    expect(screen.getByTestId('step-index')).toHaveTextContent('0');
  });

  it('navigates slides with goToSlide', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-set-unit').click(); });
    await screen.findByTestId('active-unit');

    act(() => { screen.getByTestId('btn-goto-1').click(); });
    expect(screen.getByTestId('step-index')).toHaveTextContent('1');
    expect(screen.getByTestId('slide-type')).toHaveTextContent('FOCUS_CARDS');
  });

  it('tracks score with addPoints', async () => {
    renderWithProvider();
    await screen.findByTestId('score');

    expect(screen.getByTestId('score')).toHaveTextContent('0');

    act(() => { screen.getByTestId('btn-points').click(); });
    expect(screen.getByTestId('score')).toHaveTextContent('10');

    act(() => { screen.getByTestId('btn-points').click(); });
    expect(screen.getByTestId('score')).toHaveTextContent('20');
  });

  it('resets state on setActiveUnit', async () => {
    renderWithProvider();
    await screen.findByTestId('status');

    act(() => { screen.getByTestId('btn-points').click(); });
    expect(screen.getByTestId('score')).toHaveTextContent('10');

    act(() => { screen.getByTestId('btn-set-unit').click(); });
    await screen.findByTestId('active-unit');

    expect(screen.getByTestId('score')).toHaveTextContent('0');
    expect(screen.getByTestId('step-index')).toHaveTextContent('0');
  });
});
