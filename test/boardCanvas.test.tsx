import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import BoardCanvas from '../apps/board/BoardCanvas';

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: {
      status: 'LIVE',
      currentStepIndex: 0,
      activeSlideData: { type: 'FOCUS_CARDS', phase: 'INPUT', data: { words: [] } },
      activeUnit: { flow: [{ type: 'FOCUS_CARDS' }] },
      students: [
        { id: 's1', name: 'Alice', points: 100, avatar: '' },
        { id: 's2', name: 'Bob', points: 50, avatar: '' },
      ],
      isConnected: true,
      liveSnapImage: null,
      drawings: [],
      confettiTrigger: 0,
      activeOverlay: 'NONE',
      quickWheelWinner: null,
    },
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
