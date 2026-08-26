// Prompt-quota lint (FIXPLAN_F P1.6, doc 10 principle 4): "no quotas — any
// hard number in an extraction/enrichment prompt is a bug". These tests read
// the book-fidelity prompts and fail if quota language sneaks back in.
import { describe, it, expect } from 'vitest';
import { INVENTORY_PROMPT, buildStructureExtractionPrompt } from '../supabase/functions/_shared/prompts/bookScan';

/** Matches quota phrasing like "6-12 words", "exactly 3", "2 to 4". */
const QUOTA_PATTERNS: RegExp[] = [
  /\bexactly\s+\d+/i,
  /\bat\s+(?:most|least)\s+\d+\s+(?:words|items|rules|sentences|pairs|examples|characters|pages|dialogues|songs)/i,
  /\b\d+\s*[-–to\s]+\d+\s+(?:words|items|rules|sentences|pairs|examples|characters|pages|dialogues|songs|lyrics|panels|bubbles|statements)/i,
  /\bno\s+more\s+than\s+\d+/i,
  /\bdo\s+not\s+exceed\s+\d+/i,
];

function allPromptTexts(): string[] {
  const extraction = buildStructureExtractionPrompt(['vocab_set', 'comic', 'grammar_box']);
  return [INVENTORY_PROMPT.systemPrompt, INVENTORY_PROMPT.userPromptTemplate, extraction.systemPrompt, extraction.userPromptTemplate];
}

describe('book-fidelity prompt quota lint', () => {
  it('contains no count quotas in the inventory prompt', () => {
    for (const text of [INVENTORY_PROMPT.systemPrompt, INVENTORY_PROMPT.userPromptTemplate]) {
      for (const pat of QUOTA_PATTERNS) {
        expect(text.match(pat), `"${text.slice(0, 60)}…" matched ${pat}`).toBeNull();
      }
    }
  });

  it('contains no count quotas in the extraction prompt', () => {
    const extraction = buildStructureExtractionPrompt(['vocab_set', 'comic', 'grammar_box']);
    for (const text of [extraction.systemPrompt, extraction.userPromptTemplate]) {
      for (const pat of QUOTA_PATTERNS) {
        expect(text.match(pat), `"${text.slice(0, 60)}…" matched ${pat}`).toBeNull();
      }
    }
  });

  it('includes the absence-is-absence and verbatim rules', () => {
    const texts = allPromptTexts().join('\n');
    expect(texts).toMatch(/empty/i);
    expect(INVENTORY_PROMPT.systemPrompt).toMatch(/never invent/i);
    expect(buildStructureExtractionPrompt(['vocab_set']).systemPrompt).toMatch(/never/i);
    expect(buildStructureExtractionPrompt(['vocab_set']).systemPrompt).toMatch(/word-for-word/i);
  });

  it('only includes schema blocks for detected types', () => {
    const withVocab = buildStructureExtractionPrompt(['vocab_set']);
    expect(withVocab.userPromptTemplate).toContain('[vocab_set]');
    expect(withVocab.userPromptTemplate).not.toContain('[comic]');
    const withComic = buildStructureExtractionPrompt(['comic']);
    expect(withComic.userPromptTemplate).toContain('[comic]');
    expect(withComic.userPromptTemplate).not.toContain('[vocab_set]');
  });
});
