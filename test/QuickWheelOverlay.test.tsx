// QuickWheelOverlay smoke — the carnival picker overlay is the most complex new
// surface of the 2026-09-09 wheel choreography and nothing else mounts it. This
// verifies the wiring end-to-end at the DOM level: wedges render with names,
// the rAF phase machine reaches 'landed' at landAt, the winner modal appears
// with the bilingual badge, and tap-to-skip calls the context method.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import { SPIN_MS } from '../services/wheelChoreography';

// Hoisted so the (hoisted) vi.mock factory can close over it. revealAt must
// be a STABLE value across renders — recomputing Date.now() per render would
// push the deadline forever forward and the phase machine would never land.
const h = vi.hoisted(() => ({ revealAt: 0, skip: vi.fn() }));

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: {
      students: [
        { id: 's1', name: 'Emma Page', avatar: null },
        { id: 's2', name: 'Leo Wang', avatar: null },
        { id: 's3', name: 'Mia Chen', avatar: null },
        { id: 's4', name: 'Noah Kim', avatar: null },
        { id: 's5', name: 'Zoe Adams', avatar: null },
        { id: 's6', name: 'Sam Patel', avatar: null },
        { id: 's7', name: 'Lucas Diaz', avatar: null },
        { id: 's8', name: 'Lily Zhou', avatar: null },
      ],
      quickWheelWinner: 's3',
      turnRevealAt: h.revealAt,
      pendingTurnToken: 'tok-1',
      activeOverlay: 'QUICK_WHEEL',
    },
    skipWheelReveal: h.skip,
  }),
}));

import QuickWheelOverlay from '../apps/board/templates/QuickWheelOverlay';

describe('QuickWheelOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.skip.mockClear();
    h.revealAt = Date.now() + SPIN_MS + 2500; // landAt = revealAt − 3000 = now + SPIN_MS − 500
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renders the spin stage: wedges, avatar slots, first names, headline', () => {
    render(<QuickWheelOverlay />);
    expect(screen.getByText("Who's next? • 谁来下一个？", { exact: false })).toBeTruthy();
    // First names shown on wedges (≤12 students), split off surnames.
    expect(screen.getAllByText('Mia').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Mia Chen')).toBeNull();
    // 8 candy wedges in the SVG body.
    expect(document.querySelectorAll('path[d^="M50,50"]').length).toBe(8);
  });

  it('reaches the landed winner modal at landAt with the bilingual turn badge', async () => {
    render(<QuickWheelOverlay />);
    await act(async () => { vi.advanceTimersByTime(SPIN_MS + 300); });
    expect(screen.getByText('The Carnival Wheel has spoken!')).toBeTruthy();
    // Rendered text is "Mia" — the UPPERCASE treatment is CSS (text-transform),
    // invisible to the DOM textContent.
    expect(screen.getByText('⭐ Mia ⭐')).toBeTruthy();
    expect(screen.getByText('Your Turn!')).toBeTruthy();
    expect(screen.getByText('轮到你了！')).toBeTruthy();
  });

  it('tap-to-skip routes to the context method', async () => {
    render(<QuickWheelOverlay />);
    await act(async () => { vi.advanceTimersByTime(SPIN_MS + 300); });
    const card = screen.getByText('The Carnival Wheel has spoken!').closest('div[class*="rounded-3xl"]');
    // The overlay root is the clickable skip surface — click the modal area.
    const root = card?.closest('div.cursor-pointer') as HTMLElement;
    expect(root).toBeTruthy();
    await act(async () => { root.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(h.skip).toHaveBeenCalled();
  });
});
