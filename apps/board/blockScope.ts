// blockScope — content-group scoping for pool-driven board games
// (spec 2026-09-13 docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md).
//
// A flow block tagged with data.group_id plays ONLY its group's pool items
// (vocab series / story / comic). Untagged blocks keep the unit-wide
// behavior. Pure TS — vitest covers it from test/blockScope.test.ts.

export interface GroupScopedItem {
  content?: Record<string, any> | null;
}

/**
 * Filter pool items to the block's group. No groupId (untagged block / whole
 * unit) passes everything through. When the groupId matches NOTHING we fall
 * back to the full list: a series block on a unit whose pool was generated
 * before group stamping (legacy data) must not render an empty game.
 */
export function filterPoolByGroup<T extends GroupScopedItem>(items: T[], groupId?: string | null): T[] {
  if (!groupId) return items;
  const scoped = items.filter((i) => String(i?.content?.group_id ?? '') === groupId);
  return scoped.length > 0 ? scoped : items;
}

/**
 * Derive the scope key from a flow block's data (the block currently being
 * played). Returns null for untagged blocks.
 */
export function blockGroupId(blockData?: Record<string, any> | null): string | null {
  const gid = blockData?.group_id;
  return typeof gid === 'string' && gid.length > 0 ? gid : null;
}

/**
 * Member structure ids of a tagged block (data.structure_ids), or null.
 * Used to scope OBJECTIVES (objectives.source_structure_id) for hooks that
 * deal at the objective level (useEscalatingPool / buildRound).
 */
export function blockStructureIds(blockData?: Record<string, any> | null): string[] | null {
  const sids = blockData?.structure_ids;
  if (!Array.isArray(sids) || sids.length === 0) return null;
  return sids.map(String);
}
