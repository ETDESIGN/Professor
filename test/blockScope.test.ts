// blockScope — group-tagged blocks play only their group's pool items
// (spec 2026-09-13). Untagged blocks keep unit-wide behavior; a tag matching
// nothing (legacy pre-stamp pool) falls back to the full list.
import { describe, it, expect } from 'vitest';
import { filterPoolByGroup, blockGroupId, blockStructureIds } from '../apps/board/blockScope';

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

describe('blockGroupId / blockStructureIds', () => {
  it('extracts the group id and structure ids from tagged block data', () => {
    const data = { group_id: 'g1', structure_ids: ['s1', 's2'] };
    expect(blockGroupId(data)).toBe('g1');
    expect(blockStructureIds(data)).toEqual(['s1', 's2']);
  });

  it('returns nulls for untagged / malformed block data', () => {
    expect(blockGroupId(undefined)).toBeNull();
    expect(blockGroupId({})).toBeNull();
    expect(blockGroupId({ group_id: '' })).toBeNull();
    expect(blockStructureIds({ group_id: 'g1' })).toBeNull();
    expect(blockStructureIds({ structure_ids: [] })).toBeNull();
  });
});
