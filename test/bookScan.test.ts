// Book-fidelity extraction contract tests (FIXPLAN_F P1.6).
// The shared contract is pure TS (no Deno imports), so vitest imports the
// same file the edge function and frontend use.
import { describe, it, expect } from 'vitest';
import {
  verifyStructures,
  sanitizeBbox,
  EXTRACTOR_VERSION,
  VERIFICATION_FLAG,
} from '../supabase/functions/_shared/bookScan';

describe('sanitizeBbox', () => {
  it('accepts a valid normalized box', () => {
    expect(sanitizeBbox([0.1, 0.2, 0.3, 0.4]).bbox).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('rejects malformed boxes', () => {
    expect(sanitizeBbox('nope').bbox).toBeNull();
    expect(sanitizeBbox([0.1, 0.2]).bbox).toBeNull();
    expect(sanitizeBbox([0.1, 0.2, NaN, 0.4]).bbox).toBeNull();
    expect(sanitizeBbox([-0.5, 0.2, 0.3, 0.4]).bbox).toBeNull(); // far outside the page
    expect(sanitizeBbox([0.1, 0.2, 2, 2]).bbox).toBeNull(); // larger than the page
  });

  it('flips negative width/height instead of rejecting them', () => {
    const { bbox } = sanitizeBbox([0.4, 0.5, -0.2, -0.1]);
    expect(bbox).toEqual([0.2, 0.4, 0.2, 0.1]);
  });

  it('flags degenerate (sub-minimum) boxes without keeping them', () => {
    const res = sanitizeBbox([0.5, 0.5, 0.001, 0.001]);
    expect(res.bbox).toBeNull();
    expect(res.degenerate).toBe(true);
  });
});

describe('verifyStructures', () => {
  it('drops unknown types and non-objects, keeps valid ones', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'dog' }] } },
      { structure_type: 'time_machine', data: {} },
      null,
    ] as any);
    expect(out).toHaveLength(1);
    expect(out[0].structure_type).toBe('vocab_set');
  });

  it('flags low confidence and stamps grammar BOX tier', () => {
    const out = verifyStructures([
      { structure_type: 'grammar_box', confidence: 0.3, data: { rule_text: 'You must be quiet.', example_sentences: [] } },
    ]);
    expect(out[0].grammar_tier).toBe('BOX');
    expect(out[0].verification_flags).toContain(VERIFICATION_FLAG.LOW_CONFIDENCE);
  });

  it('flags vocab sets whose items have no picture boxes (no_image)', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'dog' }, { word: 'cat' }] } },
    ]);
    expect(out[0].verification_flags).toContain(VERIFICATION_FLAG.NO_IMAGE);
  });

  it('does not flag vocab items that carry picture boxes', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'dog', picture_bbox: [0.1, 0.1, 0.2, 0.2] }] } },
    ]);
    expect(out[0].verification_flags).not.toContain(VERIFICATION_FLAG.NO_IMAGE);
  });

  it('flags missing required fields per type (absence is recorded, not dropped)', () => {
    const out = verifyStructures([
      { structure_type: 'grammar_box', data: {} },
      { structure_type: 'song_sheet', data: { lyrics: '' } },
      { structure_type: 'review_statements', data: { statements: [] } },
      { structure_type: 'dialogue_sequence', data: { lines: [{ text: 'Hi' }] } },
    ]);
    expect(out[0].verification_flags).toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
    expect(out[1].verification_flags).toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
    expect(out[2].verification_flags).toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
    expect(out[3].verification_flags).not.toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
  });

  it('flags same-type boxes that overlap heavily', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', bbox: [0.1, 0.1, 0.5, 0.5], data: { items: [{ word: 'a' }] } },
      { structure_type: 'vocab_set', bbox: [0.2, 0.2, 0.5, 0.5], data: { items: [{ word: 'b' }] } },
      { structure_type: 'vocab_set', bbox: [0.7, 0.1, 0.2, 0.2], data: { items: [{ word: 'c' }] } },
    ]);
    expect(out[0].verification_flags).toContain(VERIFICATION_FLAG.OVERLAP);
    expect(out[1].verification_flags).toContain(VERIFICATION_FLAG.OVERLAP);
    expect(out[2].verification_flags).not.toContain(VERIFICATION_FLAG.OVERLAP);
  });

  it('dedupes identical payloads (models sometimes emit a structure twice)', () => {
    const raw = { structure_type: 'printed_activity', data: { instruction: 'Listen and point.' } };
    expect(verifyStructures([raw, { ...raw }])).toHaveLength(1);
  });

  it('sanitizes nested bboxes inside data payloads and drops unusable ones', () => {
    const out = verifyStructures([
      {
        structure_type: 'comic',
        data: {
          panels: [
            {
              order_index: 0,
              bbox: [0.1, 0.1, 0.3, 0.3],
              bubbles: [{ bbox: [5, 5, 5, 5], speaker: 'Jim', text: 'Hello!' }], // invalid box
            },
          ],
        },
      },
    ]);
    expect(out[0].verification_flags).toContain(VERIFICATION_FLAG.INVALID_BBOX);
    const bubble = out[0].data.panels[0].bubbles[0];
    expect(bubble.text).toBe('Hello!');
    expect(bubble.bbox).toBeUndefined();
  });

  it('flags grammar boxes only when BOTH rule text and examples are absent', () => {
    const out = verifyStructures([
      { structure_type: 'grammar_box', data: { rule_text: '', example_sentences: ['Are you reading a book?'] } },
      { structure_type: 'grammar_box', data: { rule_text: '', example_sentences: [] } },
    ]);
    expect(out[0].verification_flags).not.toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
    expect(out[1].verification_flags).toContain(VERIFICATION_FLAG.MISSING_REQUIRED);
  });

  it('stamps the extractor version constant used by scan-page', () => {
    // v7 = per-paragraph scene anchoring (story fidelity)
    expect(EXTRACTOR_VERSION).toBe('scan-v7');
  });
});

describe('vocab item quality flags (owner audit 2026-08-26)', () => {
  it('flags ALL-CAPS scene titles and question captions as label-like', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'BOOK CLUB' }, { word: 'Feed Fred the fish?' }, { word: 'forest' }] } },
    ]);
    expect(out[0].verification_flags).toContain('label_like_item');
  });
  it('does not flag normal mixed-case words', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'forest' }, { word: 'get dressed' }] } },
    ]);
    expect(out[0].verification_flags).not.toContain('label_like_item');
  });
  it('flags containment duplicates within a set', () => {
    const out = verifyStructures([
      { structure_type: 'vocab_set', data: { items: [{ word: 'elbow pads' }, { word: 'elbow and knee pads' }] } },
    ]);
    expect(out[0].verification_flags).toContain('duplicate_item');
  });
});
