// supabase/functions/_shared/wordImageCore.ts
// Pure, runtime-agnostic core for the per-teacher word-image library (spec
// 2026-09-05). Same constraints as illustrationCore.ts: only fetch +
// crypto.subtle, NEVER Deno/Node-specific APIs — imported by the edge (Deno),
// tsx scripts (Node) and vitest.
import { composePrompt, promptHashFor, UnitArtContext } from './illustrationCore.ts';

/** Lowercase / trim / collapse-whitespace key. EXACT match: 'leaf' ≠ 'leaves'. */
export function canonicalWordKey(word: string): string {
  return String(word || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Unit-context-free content for the canonical vocab prompt (by design). */
export function canonicalVocabContent(word: string): string {
  return `children's flashcard illustration of "${String(word || '').trim()}"`;
}

/** The neutral art context: composes WITHOUT unit title/topic/art direction. */
export const NEUTRAL_VOCAB_CONTEXT: UnitArtContext = { title: '', topic: null, artDirection: null };

/**
 * Owner-bound dedup hash. The canonical prompt is IDENTICAL for the same word
 * across all teachers, so the global unique index assets_prompt_hash_type_unq
 * would collide cross-owner (and the 409 repoint path would overwrite another
 * teacher's image). Binding owner_id via the refs slot keeps one row per
 * (owner, word, model).
 */
export function vocabPromptHashFor(model: string, word: string, ownerId: string): Promise<string> {
  return promptHashFor(model, composePrompt('vocab', NEUTRAL_VOCAB_CONTEXT, canonicalVocabContent(word)), [ownerId]);
}

// ── cleanup planning (pure — consumed by scripts/testing/word-image-dedupe.ts) ──

export interface VocabRefRow {
  id: string;
  unit_id: string;
  owner_id: string | null;
  word: string;
  image_url: string | null;
}
export interface AssetLike { id: string; public_url: string; created_at: string }
export interface WordDedupePlan {
  owner_id: string;
  word_key: string;
  winnerUrl: string;
  winnerAssetId: string;
  repoint: { rowId: string; unit_id: string; word: string; from_url: string }[];
  retireAssetIds: string[];
}

const isRealImageUrl = (url: string | null | undefined): boolean =>
  !!url && !/dicebear\.com|pollinations\.ai/i.test(url);

export function planWordDedupe(
  vocabRows: VocabRefRow[],
  assetsByUrl: Map<string, AssetLike>,
): { plans: WordDedupePlan[]; skippedNoOwner: number; repointSqlStatements: string[] } {
  // Group real-image rows by (owner, word_key); NULL-owner rows are skipped
  // (runtime handles them via the caller fallback, the script reports them).
  const groups = new Map<string, VocabRefRow[]>();
  let skippedNoOwner = 0;
  for (const r of vocabRows) {
    if (!isRealImageUrl(r.image_url)) continue;
    if (!r.owner_id) { skippedNoOwner++; continue; }
    const key = `${r.owner_id}\u0000${canonicalWordKey(r.word)}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  }

  // First pass: pick winners (newest asset-backed URL; ties → most references;
  // URLs without an asset row rank last but can still win by URL).
  const winnerUrlByGroup = new Map<string, string>();
  const plans: WordDedupePlan[] = [];
  for (const [key, rows] of groups) {
    const [ownerId, wordKey] = key.split('\u0000');
    const byUrl = new Map<string, VocabRefRow[]>();
    for (const r of rows) {
      const list = byUrl.get(r.image_url!) || [];
      list.push(r);
      byUrl.set(r.image_url!, list);
    }
    const ranked = [...byUrl.entries()].sort((a, b) => {
      const assetA = assetsByUrl.get(a[0]);
      const assetB = assetsByUrl.get(b[0]);
      const timeA = assetA?.created_at || '';
      const timeB = assetB?.created_at || '';
      if (timeA !== timeB) return timeA < timeB ? 1 : -1; // newest first
      return b[1].length - a[1].length; // most references first
    });
    const [winnerUrl, winnerRows] = ranked[0];
    winnerUrlByGroup.set(key, winnerUrl);
    plans.push({
      owner_id: ownerId,
      word_key: wordKey,
      winnerUrl,
      winnerAssetId: assetsByUrl.get(winnerUrl)?.id || '',
      repoint: rows.filter((r) => r.image_url !== winnerUrl).map((r) => ({
        rowId: r.id, unit_id: r.unit_id, word: r.word, from_url: r.image_url!,
      })),
      retireAssetIds: [],
    });
  }

  // Second pass: retire losers — a URL is safe to retire iff it is not the
  // winner of ANY group (its vocabulary references are all repointed away).
  const allWinnerUrls = new Set(winnerUrlByGroup.values());
  for (const [key, rows] of groups) {
    const plan = plans.find((p) => p.owner_id === key.split('\u0000')[0] && p.word_key === key.split('\u0000')[1])!;
    for (const url of new Set(rows.map((r) => r.image_url!))) {
      if (url === plan.winnerUrl || allWinnerUrls.has(url)) continue;
      const asset = assetsByUrl.get(url);
      if (asset) plan.retireAssetIds.push(asset.id);
    }
  }

  // Pool-content repair SQL (one guarded statement per distinct old→new pair).
  // Applied separately via the Management API — kept as reviewable SQL, not
  // silent REST writes. Single-quoted strings are escaped for literal SQL.
  const sqlEscape = (s: string) => s.replace(/'/g, "''");
  const pairs = new Map<string, string>();
  for (const plan of plans) {
    for (const r of plan.repoint) pairs.set(r.from_url, plan.winnerUrl);
  }
  // URLs are wrapped in their JSON double quotes so a partial substring can
  // never match (…/1.png must not hit …/12.png inside content::text).
  const repointSqlStatements = [...pairs.entries()].map(([oldUrl, newUrl]) =>
    `update pool_items set content = replace(content::text, '"${sqlEscape(oldUrl)}"', '"${sqlEscape(newUrl)}"')::jsonb where content::text like '%"${sqlEscape(oldUrl)}"%';`,
  );

  return { plans, skippedNoOwner, repointSqlStatements };
}
