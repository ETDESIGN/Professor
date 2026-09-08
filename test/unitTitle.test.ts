import { describe, it, expect } from 'vitest';
import { isJunkUnitTitle, sanitizeUnitTitle, isOverwritableAutoTitle } from '../services/unitTitle';

// NOTE: the edge twin (supabase/functions/_shared/unitTitle.ts) must stay
// logic-identical — this suite pins the shared contract.

describe('isJunkUnitTitle', () => {
  it('rejects the owner-confirmed junk cases', () => {
    expect(isJunkUnitTitle('NRISH')).toBe(true); // OCR misread of ENRISH/ENGLISH
    expect(isJunkUnitTitle('ENRISH')).toBe(true); // d=1 to ENRICH, d=2 to ENGLISH
    expect(isJunkUnitTitle('ENGLISH')).toBe(true);
    expect(isJunkUnitTitle('ENGLISH!')).toBe(true);
    expect(isJunkUnitTitle('Unit')).toBe(true); // bare "Unit" — no number
    expect(isJunkUnitTitle('Unit title')).toBe(true); // AI placeholder echo
    expect(isJunkUnitTitle('123')).toBe(true); // pure numbers
    expect(isJunkUnitTitle('')).toBe(true);
    expect(isJunkUnitTitle('   ')).toBe(true); // whitespace-only normalizes empty
  });

  it('accepts real unit titles', () => {
    expect(isJunkUnitTitle('A Day at the Zoo')).toBe(false);
    expect(isJunkUnitTitle('ANIMALS')).toBe(false); // ALL-CAPS but far from every deny word
    expect(isJunkUnitTitle('My Family and Me')).toBe(false);
    expect(isJunkUnitTitle('Animals')).toBe(false); // mixed-case single word is fine
    expect(isJunkUnitTitle('Unit 3')).toBe(false); // numbered fallback is acceptable
    expect(isJunkUnitTitle('A1 Movers')).toBe(false); // one digit of nine — not digits-heavy
  });

  it('rejects textbook section headers (exact and near-miss ALL-CAPS tokens)', () => {
    for (const header of ['VOCABULARY', 'GRAMMAR', 'READING', 'PRACTICE', 'WORKBOOK', 'PAGE']) {
      expect(isJunkUnitTitle(header)).toBe(true);
    }
    expect(isJunkUnitTitle('VOCABULRY')).toBe(true); // d=1 typo of VOCABULARY
    expect(isJunkUnitTitle('READNG')).toBe(true); // d=1 to READING
    expect(isJunkUnitTitle('SONGS')).toBe(true); // d=1 to SONG
  });

  it('does not reject ALL-CAPS tokens far from the deny list (min distance >= 3)', () => {
    expect(isJunkUnitTitle('COLORS')).toBe(false); // d=4 to STORY
    expect(isJunkUnitTitle('KITCHEN')).toBe(false); // d=4 to TEACHER
    expect(isJunkUnitTitle('BIRTHDAY')).toBe(false); // d=6 to GRAMMAR
    expect(isJunkUnitTitle('ANIMALS')).toBe(false); // d=5 to LANGUAGE
    // Collateral of the d<=2 rule: some legit ALL-CAPS words DO sit within 2
    // of a deny word (WEATHER vs TEACHER, STORES vs STORY). That is accepted —
    // the fallback ladder names the unit "<Book> – Unit N" and the teacher can
    // rename; the fuzzy net must stay wide enough to catch OCR fragments.
    expect(isJunkUnitTitle('WEATHER')).toBe(true); // d=2 to TEACHER
    expect(isJunkUnitTitle('STORES')).toBe(true); // d=2 to STORY
  });

  it('rejects digits-heavy, too-short and too-long titles', () => {
    expect(isJunkUnitTitle('2024')).toBe(true);
    expect(isJunkUnitTitle('Unit 12345')).toBe(true); // 5 digits of 10 = 50%
    expect(isJunkUnitTitle('ab')).toBe(true); // < 3 chars
    expect(isJunkUnitTitle('x'.repeat(81))).toBe(true); // > 80 chars
    expect(isJunkUnitTitle('x'.repeat(80))).toBe(false);
  });

  it('normalizes whitespace before judging', () => {
    expect(isJunkUnitTitle('  Unit  ')).toBe(true);
    expect(isJunkUnitTitle('A   Day   at   the   Zoo')).toBe(false);
  });
});

describe('sanitizeUnitTitle', () => {
  it('returns the normalized title when usable', () => {
    expect(sanitizeUnitTitle('  A Day at the Zoo ')).toBe('A Day at the Zoo');
    expect(sanitizeUnitTitle('My   Family and Me')).toBe('My Family and Me');
  });

  it('returns null for junk', () => {
    expect(sanitizeUnitTitle('NRISH')).toBeNull();
    expect(sanitizeUnitTitle('Unit')).toBeNull();
    expect(sanitizeUnitTitle('')).toBeNull();
  });
});

describe('isOverwritableAutoTitle', () => {
  it('allows the AI to replace placeholders and junk', () => {
    expect(isOverwritableAutoTitle('Draft Unit 9/2/2026')).toBe(true);
    expect(isOverwritableAutoTitle('Unit 3')).toBe(true);
    expect(isOverwritableAutoTitle('Unit')).toBe(true);
    expect(isOverwritableAutoTitle('NRISH')).toBe(true);
    expect(isOverwritableAutoTitle('')).toBe(true);
  });

  it('protects real titles from the AI echo', () => {
    expect(isOverwritableAutoTitle('A Day at the Zoo')).toBe(false);
    expect(isOverwritableAutoTitle('ANIMALS')).toBe(false);
    expect(isOverwritableAutoTitle('My Family and Me')).toBe(false);
  });
});
