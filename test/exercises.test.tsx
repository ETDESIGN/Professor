import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { getExerciseRegistry } from '../apps/student/exercises/registry';
import { createExerciseRegistry, toPoolItem } from '../types/exercise';
import ChoiceExercise from '../apps/student/exercises/ChoiceExercise';
import WordBankBuild from '../apps/student/exercises/WordBankBuild';
import TypeTranslate from '../apps/student/exercises/TypeTranslate';

function poolItem(content: any) {
  return toPoolItem({
    id: 'p1',
    unit_id: 'u1',
    objective_id: 'o1',
    exercise_type: content.type,
    difficulty: 2,
    content,
  })!;
}

describe('exercise registry dispatch', () => {
  it('registers and resolves all 12 core types', () => {
    const r = getExerciseRegistry();
    const all = [
      'IMAGE_SELECT', 'MEANING_MATCH', 'AUDIO_L1_SELECT', 'LISTEN_SELECT', 'SPELL_CLOZE',
      'WORD_BANK_BUILD', 'ERROR_SPOT', 'TRANSFORM', 'DICTATION', 'MINIMAL_PAIR_SWIPE',
      'TYPE_TRANSLATE', 'SPEAK_SENTENCE',
    ] as const;
    for (const t of all) {
      expect(r.has(t)).toBe(true);
      expect(r.get(t)).toBeTruthy();
    }
    expect(r.types().length).toBeGreaterThanOrEqual(12);
  });

  it('createExerciseRegistry is empty until registered', () => {
    const r = createExerciseRegistry();
    expect(r.has('MEANING_MATCH')).toBe(false);
    expect(r.get('MEANING_MATCH')).toBeUndefined();
  });
});

describe('ChoiceExercise (MEANING_MATCH)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('renders the prompt and marks the correct option as success', async () => {
    const onComplete = vi.fn();
    const item = poolItem({
      type: 'MEANING_MATCH',
      prompt: 'apple',
      options: ['苹果', '香蕉', '橙子', '葡萄'],
      correct_index: 0,
    });
    await act(async () => {
      render(<ChoiceExercise data={item} onComplete={onComplete} />);
    });
    expect(screen.getByText('apple')).toBeTruthy();
    // Click the correct option (苹果).
    await act(async () => {
      fireEvent.click(screen.getByText('苹果'));
    });
    // onComplete fires after the feedback delay.
    await act(async () => { vi.advanceTimersByTime(1200); });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0].success).toBe(true);
  });
});

describe('WordBankBuild', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('completes correct when tiles match the target sentence', async () => {
    const onComplete = vi.fn();
    const item = poolItem({
      type: 'WORD_BANK_BUILD',
      target_sentence: 'I like cats',
      word_bank: ['I', 'like', 'cats', 'dogs'],
    });
    await act(async () => {
      render(<WordBankBuild data={item} onComplete={onComplete} />);
    });
    // Tap the three correct tiles in order.
    for (const w of ['I', 'like', 'cats']) {
      await act(async () => { fireEvent.click(screen.getByText(w)); });
    }
    await act(async () => { fireEvent.click(screen.getByText('Check')); });
    await act(async () => { vi.advanceTimersByTime(1200); });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0].success).toBe(true);
  });
});

describe('TypeTranslate', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('accepts a case-insensitive translation', async () => {
    const onComplete = vi.fn();
    const item = poolItem({
      type: 'TYPE_TRANSLATE',
      prompt_l1: '苹果',
      accepted: ['apple'],
    });
    await act(async () => {
      render(<TypeTranslate data={item} onComplete={onComplete} />);
    });
    const input = screen.getByPlaceholderText('Type the English…') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '  Apple! ' } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    await act(async () => { vi.advanceTimersByTime(1300); });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0].success).toBe(true);
  });
});
