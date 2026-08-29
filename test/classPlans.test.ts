import { describe, it, expect } from 'vitest';
import {
  proposeClasses,
  candidateCuts,
  defaultClassCount,
  pageSetLabels,
  type ClassPageInput,
} from '../supabase/functions/_shared/classPlans';

/** Helper: a page with one vocab_set structure of n words carrying a label. */
const page = (
  id: string,
  order: number,
  printed: string,
  label: string | null,
  words: number,
  extra: { type?: string }[] = [],
): ClassPageInput => ({
  id,
  upload_order: order,
  printed_page_number: printed,
  structures: [
    ...((label !== null || words > 0) ? [{ structure_type: 'vocab_set', set_label: label, vocab_count: words }] : []),
    ...extra.map((e) => ({ structure_type: e.type, set_label: null as any, vocab_count: 0 })),
  ],
});

describe('classPlans: pageSetLabels', () => {
  it('skips removed structures and empty labels', () => {
    const p: ClassPageInput = {
      id: 'p1', upload_order: 0, printed_page_number: '6',
      structures: [
        { structure_type: 'vocab_set', set_label: 'Countryside', vocab_count: 4 },
        { structure_type: 'vocab_set', set_label: '  ', vocab_count: 1 },
        { structure_type: 'vocab_set', set_label: 'Routines', review_status: 'removed', vocab_count: 9 },
      ],
    };
    expect(pageSetLabels(p)).toEqual(['Countryside']);
  });
});

describe('classPlans: candidateCuts', () => {
  it('signals at set-label changes, song ends, opener starts, review starts', () => {
    const pages = [
      page('a', 0, '6', 'Countryside', 6),
      page('b', 1, '7', 'Countryside', 5, [{ type: 'song_sheet' }]),
      page('c', 2, '8', 'Routines', 6),
      page('d', 3, '9', 'Routines', 5),
      page('e', 4, '10', null, 0, [{ type: 'review_statements' }]),
    ];
    const cuts = candidateCuts(pages);
    expect(cuts).toHaveLength(4);
    // gap 0: labels unchanged on page b, no rhythm structure between → no signal
    expect(cuts[0]).toEqual({ gap: 0, signal: false });
    // gap 1: label change (Countryside → Routines) AND song ends on page b
    expect(cuts[1]).toEqual({ gap: 1, signal: true });
    // gap 2: no signal
    expect(cuts[2]).toEqual({ gap: 2, signal: false });
    // gap 3: review page starts
    expect(cuts[3]).toEqual({ gap: 3, signal: true });
  });

  it('no signal on pages without labels or rhythm structures', () => {
    const pages = [page('a', 0, '6', null, 4), page('b', 1, '7', null, 4)];
    expect(candidateCuts(pages)[0].signal).toBe(false);
  });
});

describe('classPlans: defaultClassCount', () => {
  it('targets ~12 words per class, clamped 1..6', () => {
    expect(defaultClassCount([page('a', 0, '6', 'X', 0)])).toBe(1);
    expect(defaultClassCount([page('a', 0, '6', 'X', 11)])).toBe(1);
    expect(defaultClassCount([page('a', 0, '6', 'X', 12)])).toBe(1);
    expect(defaultClassCount([page('a', 0, '6', 'X', 13)])).toBe(2);
    expect(defaultClassCount([page('a', 0, '6', 'X', 35)])).toBe(3);
    expect(defaultClassCount([page('a', 0, '6', 'X', 120)])).toBe(6);
  });
});

describe('classPlans: proposeClasses', () => {
  const unitTitle = 'A day on the farm';

  it('one class returns the whole page span with the unit title', () => {
    const pages = [
      page('a', 0, '16', 'Countryside', 6),
      page('b', 1, '17', 'Routines', 5),
    ];
    const out = proposeClasses(pages, 1, unitTitle);
    expect(out).toHaveLength(1);
    expect(out[0].from_page_id).toBe('a');
    expect(out[0].to_page_id).toBe('b');
    expect(out[0].title).toBe(unitTitle);
  });

  it('splits at signal cuts when they balance the vocabulary load', () => {
    const pages = [
      page('a', 0, '16', 'Countryside', 6),
      page('b', 1, '17', 'Countryside', 6, [{ type: 'song_sheet' }]),
      page('c', 2, '18', 'Routines', 6),
      page('d', 3, '19', 'Routines', 6),
    ];
    const out = proposeClasses(pages, 2, unitTitle);
    expect(out).toHaveLength(2);
    // Cut at the song/label boundary (gap 1): class1 = a,b; class2 = c,d.
    expect(out[0].to_page_id).toBe('b');
    expect(out[1].from_page_id).toBe('c');
    expect(out[0].vocab_weight).toBe(12);
    expect(out[1].vocab_weight).toBe(12);
    expect(out[0].title).toBe('Countryside');
    expect(out[1].title).toBe('Routines');
    expect(out[0].from_printed).toBe('16');
    expect(out[1].to_printed).toBe('19');
  });

  it('falls back to balanced non-signal cuts for label-less books', () => {
    const pages = [
      page('a', 0, '6', null, 4),
      page('b', 1, '7', null, 4),
      page('c', 2, '8', null, 4),
      page('d', 3, '9', null, 4),
    ];
    const out = proposeClasses(pages, 2, unitTitle);
    expect(out).toHaveLength(2);
    expect(out[0].vocab_weight).toBe(8);
    expect(out[1].vocab_weight).toBe(8);
    // No labels and no printed range fallback title beyond "Class N"/range.
    expect(out[0].title).toBe('pp. 6–7');
    expect(out[1].title).toBe('pp. 8–9');
  });

  it('three balanced classes across the Power Up rhythm', () => {
    // Rough shape of "A day on the farm": opener+series 1, song boundary,
    // series 2, review tail.
    const pages = [
      page('a', 0, '16', 'Countryside', 8, [{ type: 'mission_opener' }]),
      page('b', 1, '17', 'Countryside', 4),
      page('c', 2, '18', 'Countryside', 4, [{ type: 'song_sheet' }]),
      page('d', 3, '19', 'Routines', 8),
      page('e', 4, '20', 'Routines', 6),
      page('f', 5, '21', null, 0, [{ type: 'review_statements' }]),
    ];
    const out = proposeClasses(pages, 3, unitTitle);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.page_count).reduce((s, x) => s + x, 0)).toBe(6);
    // Every page appears exactly once, in order.
    expect(out[0].from_page_id).toBe('a');
    expect(out[2].to_page_id).toBe('f');
    expect(out[0].title).toBe(unitTitle); // opener class keeps the unit title
    // Classes are contiguous: each class starts right after the previous end.
    for (let i = 1; i < out.length; i++) {
      const prevIdx = pages.findIndex((p) => p.id === out[i - 1].to_page_id);
      expect(out[i].from_page_id).toBe(pages[prevIdx + 1].id);
    }
  });

  it('clamps targetCount above the page count', () => {
    const pages = [page('a', 0, '6', 'X', 3), page('b', 1, '7', 'Y', 3)];
    expect(proposeClasses(pages, 5, unitTitle)).toHaveLength(2);
  });

  it('empty input yields no proposals', () => {
    expect(proposeClasses([], 3, unitTitle)).toEqual([]);
  });

  it('is deterministic (same input, same output)', () => {
    const pages = [
      page('a', 0, '6', 'A', 5), page('b', 1, '7', 'B', 5),
      page('c', 2, '8', 'C', 5), page('d', 3, '9', 'D', 5),
    ];
    const r1 = JSON.stringify(proposeClasses(pages, 3, unitTitle));
    const r2 = JSON.stringify(proposeClasses(pages, 3, unitTitle));
    expect(r1).toBe(r2);
  });
});
