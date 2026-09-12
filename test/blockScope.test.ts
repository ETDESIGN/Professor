// blockScope — group-tagged blocks play only their group's pool items
// (spec 2026-09-13). Untagged blocks keep unit-wide behavior; a tag matching
// nothing (legacy pre-stamp pool) falls back to the full list.
import { describe, it, expect } from 'vitest';
import { filterPoolByGroup, blockGroupIds, blockStructureIds } from '../apps/board/blockScope';

const pool = [
  { content: { group_id: 'g1', word: 'monday' } },
  { content: { group_id: 'g1', word: 'tuesday' } },
  { content: { group_id: 'g2', word: 'swim' } },
  { content: { word: 'legacy-untagged' } },
];

describe('filterPoolByGroup', () => {
  it('passes everything through without a groupId (untagged block)', () => {
    expect(filterPoolByGroup(pool, null)).toHaveLength(4);
    expect(filterPoolByGroup(pool, undefined)).toHaveLength(4);
  });

  it('keeps only the group\'s items', () => {
    const out = filterPoolByGroup(pool, 'g1');
    expect(out.map((i) => i.content.word)).toEqual(['monday', 'tuesday']);
  });

  it('falls back to the full list when the tag matches nothing (pre-stamp pool)', () => {
    expect(filterPoolByGroup(pool, 'g-unknown')).toHaveLength(4);
  });

  it('handles items without content', () => {
    expect(filterPoolByGroup([{ content: null }, {}] as any, 'g1')).toHaveLength(2);
  });
});

describe('blockGroupIds / blockStructureIds', () => {
  it('extracts the group ids (single + multi) and structure ids from tagged block data', () => {
    expect(blockGroupIds({ group_id: 'g1' })).toEqual(['g1']);
    expect(blockGroupIds({ group_ids: ['g1', 'g2'] })).toEqual(['g1', 'g2']);
    expect(blockGroupIds({ group_ids: ['g1'], group_id: 'g2' })).toEqual(['g1']); // multi wins
    expect(blockStructureIds({ group_id: 'g1', structure_ids: ['s1', 's2'] })).toEqual(['s1', 's2']);
  });

  it('returns empties/nulls for untagged / malformed block data', () => {
    expect(blockGroupIds(undefined)).toEqual([]);
    expect(blockGroupIds({})).toEqual([]);
    expect(blockGroupIds({ group_id: '' })).toEqual([]);
    expect(blockStructureIds({ group_id: 'g1' })).toBeNull();
    expect(blockStructureIds({ structure_ids: [] })).toBeNull();
  });
});

describe('filterPoolByGroup (multi-select)', () => {
  it('accepts an array of group ids (PlanComposer multi-series selection)', () => {
    const out = filterPoolByGroup(pool, ['g1', 'g2']);
    expect(out.map((i) => i.content.word)).toEqual(['monday', 'tuesday', 'swim']);
  });
});
