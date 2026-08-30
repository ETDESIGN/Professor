// BoardComicPanels — slide-the-panels storytelling (doc 12 §4). Verifies the
// owner-locked behaviors: art-only tray (no text before placement), reveal on
// placement, LCS check with partial credit, the LIVE_GAME_LIFECYCLE §5 must-dos
// (NEW_TURN re-deal, scoring gated on quickWheelWinner, personalized message),
// and the empty state (absence = absence).
//
// Placement is driven deterministically: the component deals with
// seededShuffle(panels, makeRng(seedBase, turnId ?? 'choral', 'comic-panels')),
// and the test computes the SAME deal to know which tray tile holds which panel.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { makeRng, seededShuffle } from '../services/seededRandom';

const addPoints = vi.fn();
const triggerAction = vi.fn();
const pushToRemediation = vi.fn();
const triggerConfetti = vi.fn();
let quickWheelWinner: string | null = null;
let currentTurnId: string | null = null;
let lastAction: any = null;

vi.mock('../store/SessionContext', () => ({
  useSeedBase: () => 'test-session|u1|0',
  useSession: () => ({
    state: {
      activeUnit: { id: 'u1' },
      students: [{ id: 's1', name: 'Leo', claimed_profile_id: null }],
      quickWheelWinner,
      currentTurnId,
      lastAction,
      activeClassId: 'c1',
    },
    addPoints,
    triggerAction,
    pushToRemediation,
    triggerConfetti,
  }),
}));

// The story-objective lookup hits supabase — stub the chain it uses.
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [{ id: 'obj-story' }], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../services/attemptsLog', () => ({
  recordAttempt: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/boardLearner', () => ({
  gradeObjective: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../apps/board/templates/playCue', () => ({ playCue: vi.fn() }));

import BoardComicPanels from '../apps/board/templates/BoardComicPanels';

const panels = [
  { id: 'c:0', order: 0, image_url: 'https://example.com/p0.jpg', narration: '', texts: ['Good morning, everyone.'] },
  { id: 'c:1', order: 1, image_url: 'https://example.com/p1.jpg', narration: '', texts: ['Are they sleeping, Mum?', 'No, they aren’t sleeping.'] },
  { id: 'c:2', order: 2, narration: 'Later that day…', texts: ['Look! There are three puppies.'] },
  { id: 'c:3', order: 3, texts: ['It’s naughty!'] },
];

const SEED_BASE = 'test-session|u1|0';
const dealFor = (turn: string) => seededShuffle(panels, makeRng(SEED_BASE, turn, 'comic-panels'));

const trayTiles = () => screen.getAllByRole('button').filter((t) => t.className.includes('w-40'));

/**
 * Tap tray tiles so slot s receives a chosen panel. The tray preserves the
 * initial deal order (clicks only remove), so at each step the remaining tray
 * = deal minus already-placed ids, in deal order.
 */
const placeByOrder = (turn: string, orderForSlot: (slot: number, total: number) => number) => {
  const deal = dealFor(turn) as any[];
  const placed = new Set<string>();
  for (let s = 0; s < deal.length; s++) {
    const remaining = deal.filter((p) => !placed.has(p.id));
    const idx = remaining.findIndex((p) => p.order === orderForSlot(s, deal.length));
    expect(idx).toBeGreaterThanOrEqual(0);
    fireEvent.click(trayTiles()[idx]);
    placed.add(remaining[idx].id);
  }
  expect(trayTiles().length).toBe(0);
};

/** Correct arrangement: slot s receives the panel whose order === s. */
const placeAllCorrect = (turn: string) => placeByOrder(turn, (s) => s);

/** Full reversal: slot s receives panel order (total-1-s) — LCS ratio 0.25. */
const placeAllReversed = (turn: string) => placeByOrder(turn, (s, total) => total - 1 - s);

describe('BoardComicPanels (slide-the-panels storytelling)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    quickWheelWinner = null;
    currentTurnId = null;
    lastAction = null;
  });

  it('renders the empty state when no comic data exists (absence = absence)', () => {
    render(<BoardComicPanels data={{ panels: [] }} />);
    expect(screen.getByText(/No comic panels for this unit yet/i)).toBeTruthy();
  });

  it('shows the tray ART ONLY — no bubble text before placement', () => {
    render(<BoardComicPanels data={{ panels, comic_label: 'printed p8' }} />);
    expect(trayTiles().length).toBe(4);
    expect(screen.queryByText(/Good morning, everyone/i)).toBeNull();
    expect(screen.queryByText(/three puppies/i)).toBeNull();
    expect(screen.queryByText(/It’s naughty/i)).toBeNull();
  });

  it('places a panel and immediately reveals its verbatim text (narration + bubbles)', () => {
    render(<BoardComicPanels data={{ panels }} />);
    const deal = dealFor('choral');
    // Place the panel that carries the narration box first.
    const narrationIdx = deal.findIndex((p: any) => p.narration);
    fireEvent.click(trayTiles()[narrationIdx]);
    expect(screen.getByText(/Later that day…/i)).toBeTruthy();
    expect(screen.getByText(/three puppies/i)).toBeTruthy();
  });

  it('choral/practice mode never scores, even on a perfect rebuild', async () => {
    render(<BoardComicPanels data={{ panels }} />);
    placeAllCorrect('choral');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check Answer/i })); });
    await waitFor(() => expect(screen.getByText(/Perfect story order!/i)).toBeTruthy());
    expect(addPoints).not.toHaveBeenCalled();
  });

  it('picked responder: correct order pays once with the personalized message', async () => {
    quickWheelWinner = 's1';
    currentTurnId = 'turn-2';
    render(<BoardComicPanels data={{ panels }} />);
    placeAllCorrect('turn-2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check Answer/i })); });
    await waitFor(() => expect(screen.getByText(/Leo rebuilt the story!/i)).toBeTruthy());
    expect(addPoints).toHaveBeenCalledTimes(1);
    expect(addPoints).toHaveBeenCalledWith('s1', expect.any(Number));
    expect(addPoints.mock.calls[0][1]).toBeGreaterThan(0);
    // Re-checking after success does not double-pay (awardedRef latch).
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check Answer/i })); });
    expect(addPoints).toHaveBeenCalledTimes(1);
  });

  it('reversed order misses: −1 penalty and misplaced panels return to the tray', async () => {
    quickWheelWinner = 's1';
    render(<BoardComicPanels data={{ panels }} />);
    placeAllReversed('choral');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check Answer/i })); });
    await waitFor(() => expect(addPoints).toHaveBeenCalledWith('s1', -1));
    // Misplaced panels come back to the tray after the 1.2s feedback beat
    // (a full reversal has LCS 1 → every panel but one is misplaced).
    await waitFor(() => expect(trayTiles().length).toBeGreaterThan(0), { timeout: 2500 });
  });

  it('RESET_GAME re-deals a fresh shuffle (per-turn variety rule)', async () => {
    const view = render(<BoardComicPanels data={{ panels }} />);
    placeAllCorrect('choral');
    expect(trayTiles().length).toBe(0);
    lastAction = { type: 'RESET_GAME', timestamp: Date.now() };
    view.rerender(<BoardComicPanels data={{ panels }} />);
    await waitFor(() => expect(trayTiles().length).toBe(4)); // fresh deal
  });
});
