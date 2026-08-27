// FIXPLAN_G unitization algorithm tests, including a GOLDEN test built from
// the owner's real 26-page Power Up 2 scan (queried from production
// 2026-08-27: openers, stage tags, lesson labels and all).
import { describe, it, expect } from 'vitest';
import { proposeGroups, isUnitNumber, type UnitizePageInput } from '../supabase/functions/_shared/unitize';

describe('isUnitNumber', () => {
  it('accepts bare numbers and "Unit N"', () => {
    expect(isUnitNumber('1')).toBe(1);
    expect(isUnitNumber(' 2 ')).toBe(2);
    expect(isUnitNumber('Unit 3')).toBe(3);
    expect(isUnitNumber('unit 12')).toBe(12);
  });
  it('rejects stage tags, lesson labels, and empty strings', () => {
    expect(isUnitNumber('STAGE 3')).toBeNull();
    expect(isUnitNumber('Language practice 1')).toBeNull();
    expect(isUnitNumber('')).toBeNull();
    expect(isUnitNumber(null)).toBeNull();
    expect(isUnitNumber('A1 Movers')).toBeNull();
  });
});

/** Real signals from the owner's 26-page scan (production query 2026-08-27). */
const REAL_SAMPLE: UnitizePageInput[] = [
  { id: 'p04', upload_order: 0, printed_page_number: '4', printed_title: 'Meet the family', openers: [] },
  { id: 'p05', upload_order: 1, printed_page_number: '5', printed_title: 'The Friendly Farm', openers: [] },
  { id: 'p06', upload_order: 2, printed_page_number: '6', printed_title: 'A day on the farm', openers: [{ printed_unit_number: '1', printed_title: '' }] },
  { id: 'p07', upload_order: 3, printed_page_number: '7', printed_title: 'Countryside', openers: [] },
  { id: 'p08', upload_order: 4, printed_page_number: '8', printed_title: 'The Friendly Farm', openers: [] },
  { id: 'p09', upload_order: 5, printed_page_number: '9', openers: [{ printed_unit_number: '', printed_title: '' }] },
  { id: 'p10', upload_order: 6, printed_page_number: '10', printed_title: 'Daily routines', openers: [] },
  { id: 'p11', upload_order: 7, printed_page_number: '11', printed_title: 'Language practice 2', openers: [{ printed_unit_number: '', printed_title: '' }] },
  { id: 'p12', upload_order: 8, printed_page_number: '12', printed_title: 'Look after our planet', openers: [] },
  { id: 'p13', upload_order: 9, printed_page_number: '13', openers: [{ printed_unit_number: 'STAGE 3', printed_title: 'mission' }] },
  { id: 'p14', upload_order: 10, printed_page_number: '14', printed_unit_label: 'Literature', openers: [] },
  { id: 'p15', upload_order: 11, printed_page_number: '15', openers: [] },
  { id: 'p16', upload_order: 12, printed_page_number: '16', printed_unit_label: 'A1 Movers', printed_title: 'Preparation for Speaking Part 1', openers: [] },
  { id: 'p17', upload_order: 13, printed_page_number: '17', printed_title: 'mission in action!', openers: [{ printed_unit_number: '1', printed_title: '' }] },
  { id: 'p18', upload_order: 14, printed_page_number: '18', printed_title: 'My week', openers: [{ printed_unit_number: '2', printed_title: 'My week' }] },
  { id: 'p19', upload_order: 15, printed_page_number: '19', printed_title: 'Days of the week', openers: [] },
  { id: 'p20', upload_order: 16, printed_page_number: '20', printed_title: 'The Friendly Farm', openers: [] },
  { id: 'p21', upload_order: 17, printed_page_number: '21', openers: [{ printed_unit_number: '', printed_title: '' }] },
  { id: 'p22', upload_order: 18, printed_page_number: '22', printed_title: 'Free time activities', openers: [] },
  { id: 'p23', upload_order: 19, printed_page_number: '23', openers: [{ printed_unit_number: '', printed_title: '' }] },
  { id: 'p24', upload_order: 20, printed_page_number: "24", printed_title: "Let's be healthy!", openers: [] },
  { id: 'p25', upload_order: 21, printed_page_number: '25', openers: [{ printed_unit_number: '', printed_title: '' }] },
  { id: 'p26', upload_order: 22, printed_page_number: '26', printed_unit_label: 'Literature', printed_title: 'A bad, bad Monday morning', openers: [] },
  { id: 'p27', upload_order: 23, printed_page_number: '27', openers: [] },
  { id: 'p28', upload_order: 24, printed_page_number: '28', printed_unit_label: 'A1 Movers', printed_title: 'Preparation for Reading and Writing Part 1', openers: [] },
  { id: 'p29', upload_order: 25, printed_page_number: '29', printed_unit_label: 'Unit consolidation', openers: [{ printed_unit_number: '2', printed_title: '' }] },
];

describe('proposeGroups — GOLDEN: owner\'s real 26-page Power Up 2 scan', () => {
  const groups = proposeGroups(REAL_SAMPLE);

  it('proposes exactly setup + Unit 1 + Unit 2', () => {
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.is_setup)).toEqual([true, false, false]);
  });

  it('setup group holds the welcome pages (4-5)', () => {
    expect(groups[0].pageIds).toEqual(['p04', 'p05']);
    expect(groups[0].fromPrinted).toBe('4');
    expect(groups[0].toPrinted).toBe('5');
  });

  it('Unit 1 spans printed 6-17 with the opener title', () => {
    expect(groups[1].title).toBe('A day on the farm');
    expect(groups[1].unitNumber).toBe(1);
    expect(groups[1].fromPrinted).toBe('6');
    expect(groups[1].toPrinted).toBe('17');
    expect(groups[1].pageIds).toHaveLength(12);
  });

  it('Unit 2 spans printed 18-29 with the opener title', () => {
    expect(groups[2].title).toBe('My week');
    expect(groups[2].unitNumber).toBe(2);
    expect(groups[2].fromPrinted).toBe('18');
    expect(groups[2].toPrinted).toBe('29');
    expect(groups[2].pageIds).toHaveLength(12);
  });

  it('never splits on STAGE 3, lesson labels, or same-unit openers', () => {
    // If any of those split, group counts or ranges would differ — the
    // assertions above encode the full expectation; this one states intent.
    expect(groups[1].pageIds).toContain('p13'); // STAGE 3 stays in Unit 1
    expect(groups[1].pageIds).toContain('p17'); // same-unit opener stays
    expect(groups[2].pageIds).toContain('p29'); // "Unit consolidation" label stays
  });
});

describe('proposeGroups — synthetic edge cases', () => {
  it('returns one non-setup group when there is no boundary signal at all', () => {
    const pages: UnitizePageInput[] = [
      { id: 'a', upload_order: 0, printed_page_number: '10', printed_title: 'Some lesson', openers: [] },
      { id: 'b', upload_order: 1, printed_page_number: '11', openers: [] },
    ];
    const groups = proposeGroups(pages);
    expect(groups).toHaveLength(1);
    expect(groups[0].is_setup).toBe(false);
    expect(groups[0].pageIds).toEqual(['a', 'b']);
  });

  it('Mode B (no openers): unit-ish labels split, other labels do not', () => {
    const pages: UnitizePageInput[] = [
      { id: 'a', upload_order: 0, printed_page_number: '1', printed_unit_label: 'Unit 1: Numbers', openers: [] },
      { id: 'b', upload_order: 1, printed_page_number: '2', printed_unit_label: 'Lesson 2', openers: [] },
      { id: 'c', upload_order: 2, printed_page_number: '3', printed_unit_label: 'Unit 2: Colors', openers: [] },
      { id: 'd', upload_order: 3, printed_page_number: '4', printed_unit_label: 'Unit 2: Colors', openers: [] },
    ];
    const groups = proposeGroups(pages);
    expect(groups).toHaveLength(2);
    expect(groups[0].pageIds).toEqual(['a', 'b']);
    expect(groups[1].pageIds).toEqual(['c', 'd']);
  });

  it('leading unlabelled pages become the setup group even in Mode B', () => {
    const pages: UnitizePageInput[] = [
      { id: 'w1', upload_order: 0, printed_page_number: '2', printed_title: 'Class Rules', openers: [] },
      { id: 'a', upload_order: 1, printed_page_number: '6', printed_unit_label: 'Unit 1: Numbers', openers: [] },
    ];
    const groups = proposeGroups(pages);
    expect(groups).toHaveLength(2);
    expect(groups[0].is_setup).toBe(true);
    expect(groups[0].pageIds).toEqual(['w1']);
    expect(groups[1].is_setup).toBe(false);
  });

  it('handles a spread opener: consecutive same-number openers stay one group', () => {
    const pages: UnitizePageInput[] = [
      { id: 'a', upload_order: 0, printed_page_number: '6', openers: [{ printed_unit_number: '1', printed_title: 'Farm' }] },
      { id: 'b', upload_order: 1, printed_page_number: '7', openers: [{ printed_unit_number: '1', printed_title: '' }] },
      { id: 'c', upload_order: 2, printed_page_number: '8', openers: [] },
    ];
    const groups = proposeGroups(pages);
    expect(groups).toHaveLength(1);
    expect(groups[0].pageIds).toHaveLength(3);
    expect(groups[0].title).toBe('Farm');
  });

  it('returns empty for empty input', () => {
    expect(proposeGroups([])).toEqual([]);
  });
});
