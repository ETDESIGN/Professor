import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import SpellingBeeStage from '../components/games/spellingBee/SpellingBeeStage';

const word = {
  word: 'cat', letters: 'cat', meaning: 'a pet', imageUrl: null,
} as any;

const base = {
  word, typedCount: 0, wrongLetter: null, removedKeys: new Set<string>(),
  hintKey: null, status: 'typing' as const, onReady: () => {}, onType: () => {},
  onReplayAudio: () => {},
};

describe('SpellingBeeStage fixedStage', () => {
  it('board mode uses fixed desktop slot/keyboard sizes (no responsive prefixes)', () => {
    const { container } = render(<SpellingBeeStage {...base} fixedStage />);
    const html = container.innerHTML;
    expect(html).toContain('w-24');
    expect(html).not.toMatch(/\b(sm|md|lg|xl):/);
  });
  it('student mode keeps its responsive classes', () => {
    const { container } = render(<SpellingBeeStage {...base} compact lightTheme />);
    expect(container.innerHTML).toMatch(/sm:/);
  });
});
