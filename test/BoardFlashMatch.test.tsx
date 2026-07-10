// Regression: BoardFlashMatch must NOT enter an infinite setState/render loop in
// pool-driven mode (no frozen data.pairs). Root cause was an unstable `frozenPairs`
// array identity retriggering the rebuild effect every render. We mock useBoardPool
// + the session so the component renders in the pool path; a loop would throw
// "Maximum update depth exceeded" / time out.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSession } from '../store/SessionContext';

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: {
      activeUnit: { id: 'u1' },
      students: [{ id: 's1', name: 'Leo' }],
      lastAction: null,
    },
    triggerAction: vi.fn(),
    gradeStudent: vi.fn(),
  }),
}));

const poolItems = [
  { id: 'p1', objective_id: 'o1', exercise_type: 'MEANING_MATCH', difficulty: 1, content: { type: 'MEANING_MATCH', prompt: 'apple', options: ['苹果', '香蕉', '橙子'], correct_index: 0 } },
  { id: 'p2', objective_id: 'o2', exercise_type: 'MEANING_MATCH', difficulty: 1, content: { type: 'MEANING_MATCH', prompt: 'dog', options: ['狗', '猫', '鸟'], correct_index: 0 } },
  { id: 'p3', objective_id: 'o3', exercise_type: 'MEANING_MATCH', difficulty: 1, content: { type: 'MEANING_MATCH', prompt: 'book', options: ['书', '笔', '纸'], correct_index: 0 } },
];

vi.mock('../apps/board/useBoardPool', () => ({
  useBoardPool: () => ({ items: poolItems, loading: false, weakOrder: ['o1', 'o2', 'o3'] }),
}));

import BoardFlashMatch from '../apps/board/templates/BoardFlashMatch';

describe('BoardFlashMatch (pool mode, no infinite loop)', () => {
  it('renders pairs from the pool and is matchable without looping', async () => {
    const { container } = render(<BoardFlashMatch data={{}} />);
    // If the rebuild effect looped, this would throw before resolving.
    await waitFor(() => expect(screen.getByText('apple')).toBeTruthy());
    expect(screen.getByText('苹果')).toBeTruthy();
    expect(useSession()).toBeTruthy();

    // Matching the first pair should not reset the board (the old bug wiped state).
    fireEvent.click(screen.getByText('apple'));
    fireEvent.click(screen.getByText('苹果'));
    await waitFor(() => expect(container.textContent).toContain('1 /'));
  });
});
