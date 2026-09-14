import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import BoardCanvas from '../apps/board/BoardCanvas';

// Module-level mutable mock state — later tasks extend/reassign fields here
// (BoardComponents.test.tsx convention). vi.mock factories are hoisted but
// invoked lazily on first import, so this binding is initialized by then.
const mockState = {
  status: 'LIVE' as const,
  currentStepIndex: 0,
  activeSlideData: { type: 'FOCUS_CARDS', phase: 'INPUT', data: { words: [] } },
  activeUnit: { flow: [{ type: 'FOCUS_CARDS' }] },
  students: [
    { id: 's1', name: 'Alice', points: 100, avatar: '' },
    { id: 's2', name: 'Bob', points: 50, avatar: '' },
  ],
  pointsLog: [],
  selectionHistory: [],
  selectionMode: 'FAIR' as const,
  lastAction: null,
  isConnected: true,
  liveSnapImage: null,
  drawings: [],
  confettiTrigger: 0,
  activeOverlay: 'NONE' as const,
  quickWheelWinner: null,
};

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: mockState,
    addPoints: vi.fn(),
    triggerAction: vi.fn(),
    triggerConfetti: vi.fn(),
    nextSlide: vi.fn(),
    prevSlide: vi.fn(),
    goToSlide: vi.fn(),
  }),
}));

describe('BoardCanvas', () => {
  it('renders the shell frame and is stage-shaped (fills its parent)', () => {
    const { container, getByText } = render(<BoardCanvas />);
    expect(getByText('🏆 Leaderboard')).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('absolute inset-0');
  });
});
