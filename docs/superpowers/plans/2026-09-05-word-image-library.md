# Word-Image Library (dedup + library classification + flashcard view) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One canonical AI image per vocabulary word per teacher, reused across all units, plus a cleaned-up library with category chips and a flashcard view.

**Architecture:** A new `word_images(owner_id, word_key → asset_id)` table is the per-teacher source of truth. All vocab-surface image generation routes through one server-side choke point (`_shared/wordImage.ts`) that consults the table before generating and generates with a canonical, unit-context-free prompt. A one-time script bootstraps the table from existing data and retires duplicates. The library UI derives categories from metadata and gains a flashcard browse mode over `word_images`.

**Tech Stack:** Supabase (Postgres 17, Edge Functions/Deno, PostgREST), Vite + React + TS frontend, vitest, tsx scripts. Spec: `docs/superpowers/specs/2026-09-05-word-image-dedup-and-library-design.md`.

## Global Constraints

- Spec is authoritative: read `docs/superpowers/specs/2026-09-05-word-image-dedup-and-library-design.md` before Task 1.
- `word_key` = `trim().toLowerCase().replace(/\s+/g, ' ')` — EXACT match, "leaf" ≠ "leaves". No lemma folding.
- Vocab `prompt_hash` MUST include `owner_id` in the hash input (the canonical prompt is identical cross-teacher; the global unique index `assets_prompt_hash_type_unq` would otherwise collide and cross-repoint). Non-vocab surfaces unchanged.
- Only vocab surface goes through the word library. Characters, covers, portraits, story scenes keep the existing per-unit prompt path.
- Image model default `bytedance-seed/seedream-4.5` (`IMAGE_GEN_MODEL` env override); region-safe models only.
- All commands run from repo root `professor-0.1 (1)/` unless stated. Edge functions do NOT auto-deploy — Task 8 deploys them.
- Tests: `npx vitest run <file>` (globals enabled, jsdom). Repo typecheck: `npm run lint` (does NOT cover `supabase/functions/`). Functions sweep (syntax-level, per AGENTS.md convention):
  `npx tsc --noEmit --noResolve --skipLibCheck --target es2022 --module esnext --lib es2023,dom <files>`
- Never commit secrets. Scripts read env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Frontend files live at repo ROOT (`apps/…`, `hooks/…`, `services/…`) — `src/` contains only CSS.
- DB writes from edge functions use the service-role client (bypasses RLS) — RLS policies exist for client-side reads.
- Commit after every green step, `feat:`/`fix:` conventional messages, never push except in Task 8.

---

### Task 1: Pure word-image core + tests

**Files:**
- Create: `supabase/functions/_shared/wordImageCore.ts`
- Test: `tests/wordImageCore.test.ts`

**Interfaces:**
- Consumes: `composePrompt`, `promptHashFor`, `HOUSE_STYLE` from `supabase/functions/_shared/illustrationCore.ts` (exists; pure, no Deno imports).
- Produces (later tasks rely on these exact names):
  - `canonicalWordKey(word: string): string`
  - `canonicalVocabContent(word: string): string`
  - `vocabPromptHashFor(model: string, word: string, ownerId: string): Promise<string>`
  - `NEUTRAL_VOCAB_CONTEXT: { title: string; topic: null; artDirection: null }`
  - `planWordDedupe(vocabRows: VocabRefRow[], assetsByUrl: Map<string, AssetLike>): { plans: WordDedupePlan[]; skippedNoOwner: number; repointSqlStatements: string[] }`
  - `VocabRefRow = { id: string; unit_id: string; owner_id: string | null; word: string; image_url: string | null }`
  - `AssetLike = { id: string; public_url: string; created_at: string }`
  - `WordDedupePlan = { owner_id: string; word_key: string; winnerUrl: string; winnerAssetId: string; repoint: { rowId: string; unit_id: string; word: string; from_url: string }[]; retireAssetIds: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `tests/wordImageCore.test.ts`:

```ts
// tests/wordImageCore.test.ts
import { describe, it, expect } from 'vitest';
import {
  canonicalWordKey,
  canonicalVocabContent,
  vocabPromptHashFor,
  NEUTRAL_VOCAB_CONTEXT,
  planWordDedupe,
} from '../supabase/functions/_shared/wordImageCore';
import { composePrompt } from '../supabase/functions/_shared/illustrationCore';

const realUrl = (n: number) => `https://x.supabase.co/storage/v1/object/public/generated-media/images/u1/${n}.png`;
const asset = (n: number, created: string) => ({ id: `a${n}`, public_url: realUrl(n), created_at: created });

describe('canonicalWordKey', () => {
  it('trims, lowercases, collapses internal whitespace', () => {
    expect(canonicalWordKey('  Ice   Cream ')).toBe('ice cream');
    expect(canonicalWordKey('Rock')).toBe('rock');
  });
  it('keeps distinct words distinct (no plural folding)', () => {
    expect(canonicalWordKey('leaf')).not.toBe(canonicalWordKey('leaves'));
  });
  it('empty/null-safe', () => {
    expect(canonicalWordKey('')).toBe('');
    expect(canonicalWordKey(null as any)).toBe('');
  });
});

describe('canonicalVocabContent / neutral context', () => {
  it('embeds the word, not the unit', () => {
    expect(canonicalVocabContent('rock')).toContain('rock');
    const p = composePrompt('vocab', NEUTRAL_VOCAB_CONTEXT, canonicalVocabContent('rock'));
    expect(p).toContain('rock');
    expect(p).not.toContain('Unit context');
    expect(p).not.toContain('Art direction');
    expect(p).toMatch(/no text/i);
  });
});

describe('vocabPromptHashFor', () => {
  it('differs per owner for the same word (unique-index safety)', async () => {
    const a = await vocabPromptHashFor('m', 'rock', 'owner-1');
    const b = await vocabPromptHashFor('m', 'rock', 'owner-2');
    expect(a).not.toBe(b);
  });
  it('is deterministic for the same triple', async () => {
    expect(await vocabPromptHashFor('m', 'rock', 'o')).toBe(await vocabPromptHashFor('m', 'rock', 'o'));
  });
});

describe('planWordDedupe', () => {
  const rows = (owner: string | null, word: string, urls: string[]) =>
    urls.map((u, i) => ({ id: `${word}-${owner}-${i}`, unit_id: `u-${i}`, owner_id: owner, word, image_url: u }));

  it('picks the newest asset-backed URL as winner and plans repoints', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1), realUrl(2), realUrl(2)]), // 2 units on newest URL 2
      ...rows('t1', 'tree', [realUrl(3)]),
    ];
    const assets = new Map([realUrl(1), realUrl(2), realUrl(3)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans, skippedNoOwner } = planWordDedupe(input, assets);
    expect(skippedNoOwner).toBe(0);
    const rock = plans.find((p) => p.word_key === 'rock')!;
    expect(rock.winnerUrl).toBe(realUrl(2));
    expect(rock.winnerAssetId).toBe('a2');
    expect(rock.repoint).toHaveLength(1); // only the row still on URL 1
    expect(rock.repoint[0].from_url).toBe(realUrl(1));
    expect(rock.retireAssetIds).toEqual(['a1']); // loser with no remaining references
    expect(plans.find((p) => p.word_key === 'tree')!.retireAssetIds).toEqual([]);
  });

  it('isolates owners and skips NULL-owner rows', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1)]),
      ...rows('t2', 'rock', [realUrl(2)]),
      ...rows(null, 'rock', [realUrl(3)]),
    ];
    const assets = new Map([realUrl(1), realUrl(2), realUrl(3)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans, skippedNoOwner } = planWordDedupe(input, assets);
    expect(skippedNoOwner).toBe(1);
    expect(plans.map((p) => p.owner_id).sort()).toEqual(['t1', 't2']);
    // URL 3 is only referenced by the skipped NULL-owner row: never retired.
    expect(plans.flatMap((p) => p.retireAssetIds)).not.toContain('a3');
  });

  it('never retires a URL that wins for another word of the same owner', () => {
    const input = [
      ...rows('t1', 'rock', [realUrl(1), realUrl(2)]),
      ...rows('t1', 'pebble', [realUrl(2)]), // same URL reused by a second word
    ];
    const assets = new Map([realUrl(1), realUrl(2)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { plans } = planWordDedupe(input, assets);
    expect(plans.flatMap((p) => p.retireAssetIds)).not.toContain('a2'); // a2 wins 'pebble'
  });

  it('ignores placeholder URLs entirely', () => {
    const input = rows('t1', 'rock', ['https://api.dicebear.com/7.x/shapes/svg?seed=x', '']);
    const { plans } = planWordDedupe(input, new Map());
    expect(plans).toHaveLength(0);
  });

  it('emits one guarded replace statement per repoint pair', () => {
    const input = [...rows('t1', 'rock', [realUrl(1), realUrl(2)])];
    const assets = new Map([realUrl(1), realUrl(2)].map((u, i) => [u, asset(i + 1, `2026-09-0${i + 1}`)]));
    const { repointSqlStatements } = planWordDedupe(input, assets);
    expect(repointSqlStatements).toHaveLength(1);
    expect(repointSqlStatements[0]).toContain(`replace(content::text, '"${realUrl(1)}"', '"${realUrl(2)}"')`);
    expect(repointSqlStatements[0]).toContain('where content::text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/wordImageCore.test.ts`
Expected: FAIL — `Cannot find module '../supabase/functions/_shared/wordImageCore'`

- [ ] **Step 3: Write `supabase/functions/_shared/wordImageCore.ts`**

```ts
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
      repoint: winnerRows.filter((r) => r.image_url !== winnerUrl).map((r) => ({
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
  const repointSqlStatements = [...pairs.entries()].map(([oldUrl, newUrl]) =>
    `update pool_items set content = replace(content::text, '${sqlEscape(oldUrl)}', '${sqlEscape(newUrl)}')::jsonb where content::text like '%${sqlEscape(oldUrl)}%';`,
  );

  return { plans, skippedNoOwner, repointSqlStatements };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/wordImageCore.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/wordImageCore.ts tests/wordImageCore.test.ts
git commit -m "feat: pure word-image core (canonical keys, owner-bound hash, dedup planner)"
```

---

### Task 2: Migration + runtime choke point

**Files:**
- Create: `supabase/migrations/20260905000001_word_images.sql` (file only — cloud apply happens in Task 8)
- Modify: `supabase/functions/_shared/illustrationCore.ts` (`AssetRowInput` + `insertAssetRow`)
- Modify: `supabase/functions/_shared/illustration.ts` (`generateIllustration` opts)
- Create: `supabase/functions/_shared/wordImage.ts`

**Interfaces:**
- Consumes: `canonicalWordKey`, `canonicalVocabContent`, `NEUTRAL_VOCAB_CONTEXT` from Task 1.
- Produces:
  - `ensureWordImage(opts: { sb: SupabaseClient; unitId: string; word: string; ownerId: string; regenerate?: boolean }): Promise<{ url: string; assetId?: string; cached?: boolean; error?: string }>` — Task 3 + Task 6 call this.
  - `generateIllustration` gains `ownerId?: string | null` and `metadata?: Record<string, unknown>` opts (backward compatible — all existing callers unchanged).

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260905000001_word_images.sql`:

```sql
-- 20260905000001_word_images.sql
-- Per-teacher canonical word-image library (spec 2026-09-05
-- docs/superpowers/specs/2026-09-05-word-image-dedup-and-library-design.md):
-- ONE image per (owner, word_key), reused across ALL of that teacher's units.
-- Vocab-surface generation consults this before spending; a manual regenerate
-- replaces the pointer globally (the superseded asset is soft-deleted).
create table public.word_images (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  word_key   text not null,
  asset_id   uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, word_key)
);

comment on table public.word_images is 'Canonical per-teacher vocab image: word_key (lowercased/trimmed) -> asset. Consulted by generate-media/generate-exercises vocab paths before generation.';

alter table public.word_images enable row level security;

create policy word_images_owner_select on public.word_images
  for select to authenticated using (auth.uid() = owner_id);
create policy word_images_owner_insert on public.word_images
  for insert to authenticated with check (auth.uid() = owner_id);
create policy word_images_owner_update on public.word_images
  for update to authenticated using (auth.uid() = owner_id);

-- reverse lookups during cleanup + flashcard joins
create index word_images_asset_idx on public.word_images(asset_id);
```

- [ ] **Step 2: Extend `illustrationCore.ts` asset rows with `owner_id`**

In `supabase/functions/_shared/illustrationCore.ts`, add `owner_id` to `AssetRowInput` (line ~136):

```ts
export interface AssetRowInput {
  owner_id?: string | null;
  unit_id?: string | null;
  type?: string;
  kind?: string;
  prompt: string;
  prompt_hash: string;
  model?: string | null;
  storage_path?: string;
  public_url: string;
  metadata?: Record<string, unknown>;
}
```

(`insertAssetRow` body already spreads `...row` — no other change needed.)

- [ ] **Step 3: Extend `generateIllustration` with `ownerId` + `metadata`**

In `supabase/functions/_shared/illustration.ts`, change the signature (line ~83) and three spots:

```ts
export async function generateIllustration(opts: {
  sb: SupabaseClient; unitId: string; surface: Surface; content: string;
  context: UnitArtContext; inputReferences?: string[]; regenerate?: boolean;
  ownerId?: string | null; metadata?: Record<string, unknown>;
}): Promise<{ url: string; assetId?: string; cached?: boolean; error?: string }> {
```

At the hash construction (line ~91-92), bind the owner into the hash so the same canonical prompt never collides cross-teacher on `assets_prompt_hash_type_unq`:

```ts
  const finalPrompt = composePrompt(opts.surface, opts.context, opts.content);
  const refs = (opts.inputReferences || []).filter(Boolean);
  // Word-library safety: the owner lives in the hash input (refs slot). Vocab
  // prompts are unit-context-free and identical cross-teacher — without this
  // the unique (prompt_hash, type) index would 409 across owners and the
  // repoint path would overwrite another teacher's image.
  const hash = await promptHashFor(cfg.model, finalPrompt, opts.ownerId ? [opts.ownerId, ...refs] : refs);
```

At the asset insert (line ~114-121), stamp ownership + metadata:

```ts
  const { id: assetId, conflict } = await insertAssetRow(cfg.rest, {
    unit_id: opts.unitId || null,
    owner_id: opts.ownerId || null,
    prompt: finalPrompt,
    prompt_hash: hash,
    model: gen.model,
    storage_path: `images/${opts.unitId || 'default'}`,
    public_url: publicUrl,
    metadata: opts.metadata,
  });
```

- [ ] **Step 4: Write `_shared/wordImage.ts` (the choke point)**

```ts
// supabase/functions/_shared/wordImage.ts
// Per-teacher word-image library (spec 2026-09-05). ALL vocab-surface image
// generation routes through ensureWordImage: consult word_images first; on a
// miss generate with the canonical unit-context-free prompt; upsert the
// pointer. A regenerate replaces the teacher's image for that word GLOBALLY
// (superseded asset is soft-deleted — reversible, hidden from the library).
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { canonicalWordKey, canonicalVocabContent, NEUTRAL_VOCAB_CONTEXT } from './wordImageCore.ts';
import { generateIllustration } from './illustration.ts';

export interface WordImageResult { url: string; assetId?: string; cached?: boolean; error?: string }

export async function resolveWordImage(
  sb: SupabaseClient, ownerId: string, wordKey: string,
): Promise<{ assetId: string; url: string } | null> {
  const { data } = await sb
    .from('word_images')
    .select('asset_id, assets(public_url)')
    .eq('owner_id', ownerId)
    .eq('word_key', wordKey)
    .maybeSingle();
  const url = (data as any)?.assets?.public_url;
  if (data?.asset_id && url) return { assetId: data.asset_id, url };
  return null;
}

export async function ensureWordImage(opts: {
  sb: SupabaseClient; unitId: string; word: string; ownerId: string; regenerate?: boolean;
}): Promise<WordImageResult> {
  const wordKey = canonicalWordKey(opts.word);
  if (!wordKey) return { url: '', error: 'word is required for the vocab library path' };
  if (!opts.ownerId) return { url: '', error: 'ownerId is required for the vocab library path' };

  if (!opts.regenerate) {
    const hit = await resolveWordImage(opts.sb, opts.ownerId, wordKey);
    if (hit) return { url: hit.url, assetId: hit.assetId, cached: true };
  }
  const prev = await resolveWordImage(opts.sb, opts.ownerId, wordKey);

  const r = await generateIllustration({
    sb: opts.sb, unitId: opts.unitId, surface: 'vocab',
    content: canonicalVocabContent(opts.word),
    context: NEUTRAL_VOCAB_CONTEXT, // unit-context-free BY DESIGN (spec §3.2)
    regenerate: opts.regenerate,
    ownerId: opts.ownerId,
    metadata: { surface: 'vocab', word_key: wordKey },
  });
  if (r.error || !r.assetId) return r; // dicebear fallback + error, as before

  // Upsert the canonical pointer (last-write-wins on a concurrent race; the
  // loser asset becomes an orphan for a later cleanup sweep). Best-effort per
  // spec §4: dedup bookkeeping must never fail an otherwise-successful
  // generation — the next call retries the upsert.
  try {
    await opts.sb.from('word_images').upsert(
      { owner_id: opts.ownerId, word_key: wordKey, asset_id: r.assetId },
      { onConflict: 'owner_id,word_key' },
    );
    if (prev && prev.assetId !== r.assetId) {
      // Regenerate replaced the image globally: retire the superseded row.
      // (When generateIllustration repointed the SAME row on a 409, the ids
      // match and there is nothing to retire.)
      await opts.sb.from('assets').update({ is_deleted: true }).eq('id', prev.assetId);
    }
  } catch (err) {
    console.error('word_images upsert failed (non-fatal):', err);
  }
  return r;
}
```

- [ ] **Step 5: Sweep + regression**

Run:
```bash
npx tsc --noEmit --noResolve --skipLibCheck --target es2022 --module esnext --lib es2023,dom supabase/functions/_shared/wordImageCore.ts supabase/functions/_shared/wordImage.ts supabase/functions/_shared/illustration.ts
npx vitest run tests/illustrationCore.test.ts tests/wordImageCore.test.ts
```
Expected: tsc clean; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260905000001_word_images.sql supabase/functions/_shared/illustrationCore.ts supabase/functions/_shared/illustration.ts supabase/functions/_shared/wordImage.ts
git commit -m "feat: word_images table + ensureWordImage choke point (owner-bound vocab dedup)"
```

---

### Task 3: Wire the edge callers

**Files:**
- Modify: `supabase/functions/_shared/imageGen.ts`
- Modify: `supabase/functions/generate-media/index.ts` (generate-image action ~142-161, `generateImage` helper ~29-31, batch action ~191-212)
- Modify: `supabase/functions/generate-exercises/index.ts` (publish-time loop ~465-479)

**Interfaces:**
- Consumes: `ensureWordImage` from Task 2; `fetchUnitArtContext` (exists) for owner resolution.
- Produces: `generate-media` `generate-image` and `batch` accept `word` (and per-image `word`) in their payloads; `generateAndStoreImage(prompt, unitId, word?)` new optional third arg.

Context note for the implementer: the central gate in `generate-media` (`index.ts:126-139`) ALREADY enforces strict unit ownership for every action that carries a `unitId` (admin bypasses). The extra per-surface check at `:147-155` exists only for non-vocab surfaces / regenerate. Owner resolution for the word library: `ctx?.teacherId || auth?.userId` (admins backfilling a unit fill the unit's real teacher library, not their own).

- [ ] **Step 1: Route `imageGen.ts` through the word library when `word` is present**

Replace the body of `generateAndStoreImage` in `supabase/functions/_shared/imageGen.ts`:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateIllustration, fetchUnitArtContext } from './illustration.ts';
import { ensureWordImage } from './wordImage.ts';

export interface GeneratedAsset { url: string; provider?: string; error?: string }

export async function generateAndStoreImage(prompt: string, unitId: string, word?: string): Promise<GeneratedAsset> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const sb = createClient(supabaseUrl, serviceKey);
  const ctx = await fetchUnitArtContext(sb, unitId).catch(() => null);

  // Word-library path (spec 2026-09-05): one canonical image per (owner,
  // word), reused across ALL units. Only when we know BOTH the word and the
  // owner — otherwise fall through to the legacy prompt path (characters,
  // ownerless legacy units).
  if (word && ctx?.teacherId) {
    const r = await ensureWordImage({ sb, unitId: unitId || 'default', word, ownerId: ctx.teacherId });
    if (r.error) return { url: '', provider: 'openrouter', error: r.error };
    return { url: r.url, provider: r.cached ? 'word-library' : 'openrouter' };
  }

  const r = await generateIllustration({
    sb, unitId: unitId || 'default', surface: 'vocab', content: prompt,
    context: ctx || { title: 'Unit', topic: null, artDirection: null },
  });
  // On failure generateIllustration returns a dicebear fallback WITH an error
  // — machine consumers (generate-exercises) treat a truthy url as success and
  // would persist the placeholder as image_status:'ready', permanently hiding
  // the item from regeneration. Surface failure as an empty url.
  if (r.error) return { url: '', provider: 'openrouter', error: r.error };
  return { url: r.url, provider: r.cached ? 'dedup' : 'openrouter' };
}

export const dicebearPlaceholder = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed || 'item')}`;
```

- [ ] **Step 2: `generate-media` — generate-image + batch pass `word`**

In `supabase/functions/generate-media/index.ts`:

Helper (line ~29):

```ts
async function generateImage(unitId: string, prompt: string, word?: string): Promise<{ url: string; provider?: string; error?: string }> {
  return generateAndStoreImage(prompt, unitId, word);
}
```

`generate-image` case (line ~142) — insert the word-library branch before the legacy `return generateIllustration(...)`:

```ts
      case 'generate-image': {
        // v2: surface-aware; server composes style + does dedup + records the asset.
        const surface = ['vocab', 'cover', 'story_scene', 'portrait'].includes(body.surface) ? body.surface : 'vocab';
        const sb = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey());
        const ctx = await fetchUnitArtContext(sb, unitId);
        if (surface !== 'vocab' || body.regenerate) {
          // ownership check for non-vocab surfaces (vocab is world-deduped by prompt).
          // Deny-unless-claimed: ownerless legacy units (teacher_id NULL) are
          // admin-only — otherwise ANY authenticated user could spend money on them.
          const ownerOk = ctx?.teacherId
            ? (ctx.teacherId === auth?.userId || auth?.role === 'admin')
            : (auth?.role === 'admin');
          if (!ownerOk) throw new Error('You do not own this unit');
        }
        // Word library (spec 2026-09-05): vocab + word → per-teacher canonical
        // image, reused across units. Owner = unit's teacher (admins backfill
        // the unit owner's library); unitId-less staff calls own their own.
        if (surface === 'vocab' && body.word && (ctx?.teacherId || auth?.userId)) {
          return ensureWordImage({
            sb, unitId: unitId || 'default', word: String(body.word),
            ownerId: String(ctx?.teacherId || auth?.userId),
            regenerate: Boolean(body.regenerate),
          });
        }
        return generateIllustration({
          sb, unitId: unitId || 'default', surface, content: prompt || 'Educational item',
          context: ctx || { title: 'Unit', topic: null, artDirection: null },
          regenerate: Boolean(body.regenerate),
        });
      }
```

Add `ensureWordImage` to the imports from `../_shared/wordImage.ts`.

`batch` case (line ~198) — pass the word through (batch images carry `key` = the word from MediaService):

```ts
        if (Array.isArray(images)) {
          const imgOut = await mapWithConcurrency(images, 4, (img) => generateImage(unitId, img.prompt, img.word || img.key));
          images.forEach((img: any, i: number) => {
            if (imgOut[i]?.url) results.images[img.key] = imgOut[i].url;
          });
        }
```

- [ ] **Step 3: `generate-exercises` — publish-time generation passes the word**

In `supabase/functions/generate-exercises/index.ts` (~line 469-471), change only the call:

```ts
      const imgResults = await mapWithConcurrency(needImage, 3, (v) =>
        generateAndStoreImage(v.image_prompt || `Illustration of ${v.word} for children`, unitId, v.word).then((r) => ({ word: v.word, url: r.url })),
      );
```

(The prompt argument stays as the legacy fallback; the word-library path inside `generateAndStoreImage` ignores it when a word + owner resolve.)

- [ ] **Step 4: Sweep + commit**

Run:
```bash
npx tsc --noEmit --noResolve --skipLibCheck --target es2022 --module esnext --lib es2023,dom supabase/functions/_shared/imageGen.ts supabase/functions/_shared/wordImage.ts supabase/functions/generate-media/index.ts supabase/functions/generate-exercises/index.ts
```
Expected: clean.

```bash
git add supabase/functions/_shared/imageGen.ts supabase/functions/generate-media/index.ts supabase/functions/generate-exercises/index.ts
git commit -m "feat: route all vocab image generation through the word library"
```

---

### Task 4: Client callers

**Files:**
- Modify: `hooks/useEnrichment.ts` (heal-loop invoke ~315-320)
- Modify: `services/MediaService.ts` (`getVocabImage` ~34-53, `generateBatch` ~93-124, `preloadUnitAssets` ~126-149)
- Modify: `apps/student/SoloLessonPlayer.tsx` (preload effect ~101-114)

**Interfaces:**
- Consumes: `generate-media` payloads `{ action:'generate-image', unitId, word, prompt? }` and `{ action:'batch', unitId, images:[{ key, word, prompt }] }` from Task 3.
- Produces: `preloadUnitAssets(unitId, vocabulary: { word: string; context_sentence?: string; image_url?: string }[])` — new optional `image_url` field; words with a real `image_url` are not queued for image generation.

Context note: today the student-side image preload fires a batch for ALL words on every lesson open AND those calls bounce off the strict ownership gate (students don't own the unit — see `assertOwnership.ts`). The filter below makes the intent correct and silences the noise; audio preloading behavior is unchanged (runtime audio uses `resolve-speech`, out of scope).

- [ ] **Step 1: `useEnrichment` heal loop sends `word` for vocabulary**

In `hooks/useEnrichment.ts` (~line 315-320), change the invoke body — vocabulary items join the word library; character items keep the prompt path:

```ts
      const item = category === 'vocabulary' ? enriched.vocabulary[index] : enriched.characters[index];
      const prompt = item.image_prompt || item.word || item.name;

      try {
        const { data, error } = await supabase.functions.invoke('generate-media', {
          body: {
            action: 'generate-image', unitId, prompt,
            // Word library (spec 2026-09-05): vocabulary dedups per (owner,
            // word) across units; characters stay unit-scoped via prompt.
            ...(category === 'vocabulary' && item.word ? { word: item.word } : {}),
          }
        });
```

- [ ] **Step 2: `MediaService` passes `word`, preload filters real images**

In `services/MediaService.ts`:

`getVocabImage` — add `word` to the payload:

```ts
    const result = await callGenerateMedia({
      action: 'generate-image',
      unitId,
      prompt,
      surface: 'vocab',
      word,
    });
```

`generateBatch` — accept and forward `word`, skip words that already have a real image:

```ts
  async generateBatch(
    unitId: string,
    items: { key: string; word?: string; imageUrl?: string; imagePrompt?: string; audioText?: string }[]
  ): Promise<{ images: Record<string, string>; audios: Record<string, string> }> {
    // Words that already point at a real image are never re-queued (spec
    // §3.2: the student preload used to re-batch every word on every open).
    const needsImage = (i: { imageUrl?: string }) => !i.imageUrl || /dicebear\.com|pollinations\.ai/i.test(i.imageUrl);
    const images = items.filter(i => i.imagePrompt && needsImage(i)).map(i => ({ key: i.key, word: i.word || i.key, prompt: i.imagePrompt }));
    const audios = items.filter(i => i.audioText).map(i => ({ key: i.key, text: i.audioText }));
```

(the rest of the method is unchanged — including the `if (images.length === 0 && audios.length === 0)` early return, which now also fires when every word already has an image).

`preloadUnitAssets` — accept and forward `image_url`:

```ts
  async preloadUnitAssets(unitId: string, vocabulary: { word: string; context_sentence?: string; image_url?: string }[]): Promise<void> {
    ...
    try {
      const items = vocabulary.map(v => ({
        key: v.word,
        word: v.word,
        imageUrl: v.image_url,
        imagePrompt: `Illustration of "${v.word}" for children's English lesson`,
        audioText: v.context_sentence || v.word,
      }));
```

- [ ] **Step 3: `SoloLessonPlayer` forwards `image_url`**

In `apps/student/SoloLessonPlayer.tsx` (~line 105-108):

```ts
      const vocab = getVocabulary(unit.manifest).map(v => ({
        word: v.word,
        context_sentence: v.example_sentence,
        image_url: (v as any).image_url,
      }));
```

- [ ] **Step 4: Typecheck + tests + commit**

Run: `npm run lint && npx vitest run`
Expected: lint clean; full suite PASS.

```bash
git add hooks/useEnrichment.ts services/MediaService.ts apps/student/SoloLessonPlayer.tsx
git commit -m "feat: client callers pass word + skip already-imaged words in preloads"
```

---

### Task 5: Library category derivation + filter chips

**Files:**
- Create: `services/assetCategory.ts`
- Test: `test/assetCategory.test.ts`
- Modify: `apps/teacher/ResourceLibrary.tsx`

**Interfaces:**
- Consumes: asset rows from `assets` (needs `metadata` added to the select).
- Produces: `deriveAssetCategory(asset: { type: string; kind?: string | null; metadata?: Record<string, any> | null }): AssetCategory`; `ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[]`; `type AssetCategory = 'vocabulary' | 'comics' | 'story' | 'characters' | 'audio' | 'video' | 'links' | 'other'`.

- [ ] **Step 1: Write the failing tests**

`test/assetCategory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveAssetCategory, ASSET_CATEGORIES } from '../services/assetCategory';

describe('deriveAssetCategory', () => {
  it('vocab surface → vocabulary (incl. word_key-tagged)', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'vocab', word_key: 'rock' } })).toBe('vocabulary');
  });
  it('panel pool / book_extract → comics', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { pool: 'panel' } })).toBe('comics');
    expect(deriveAssetCategory({ type: 'image', kind: 'book_extract', metadata: { pool: 'snapshot' } })).toBe('comics');
  });
  it('scene pool wins over book_extract kind → story', () => {
    expect(deriveAssetCategory({ type: 'image', kind: 'book_extract', metadata: { pool: 'scene' } })).toBe('story');
  });
  it('portrait/cover surfaces → characters', () => {
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'portrait' } })).toBe('characters');
    expect(deriveAssetCategory({ type: 'image', metadata: { surface: 'cover' } })).toBe('characters');
  });
  it('audio/video types and external links', () => {
    expect(deriveAssetCategory({ type: 'audio' })).toBe('audio');
    expect(deriveAssetCategory({ type: 'video' })).toBe('video');
    expect(deriveAssetCategory({ type: 'image', kind: 'external_url' })).toBe('links');
  });
  it('untagged generated images fall back to other', () => {
    expect(deriveAssetCategory({ type: 'image', kind: 'generated' })).toBe('other');
  });
  it('category list covers every derivable id plus all', () => {
    const ids = ASSET_CATEGORIES.map((c) => c.id);
    for (const id of ['vocabulary', 'comics', 'story', 'characters', 'audio', 'video', 'links', 'other'] as const) {
      expect(ids).toContain(id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/assetCategory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `services/assetCategory.ts`**

```ts
// services/assetCategory.ts
// Library classification (spec 2026-09-05 §3.3): categories are DERIVED from
// signals already stamped on assets — no new writes, no schema. Vocab assets
// get metadata {surface:'vocab', word_key} at generation + via the cleanup
// backfill; comics/panels/story carry metadata.pool; book extracts carry kind.
export type AssetCategory = 'vocabulary' | 'comics' | 'story' | 'characters' | 'audio' | 'video' | 'links' | 'other';

export const ASSET_CATEGORIES: readonly { id: AssetCategory; label: string }[] = [
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'comics', label: 'Comics & book art' },
  { id: 'story', label: 'Story art' },
  { id: 'characters', label: 'Portraits & covers' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'links', label: 'Links' },
  { id: 'other', label: 'Other' },
];

export function deriveAssetCategory(asset: {
  type: string;
  kind?: string | null;
  metadata?: Record<string, any> | null;
}): AssetCategory {
  const meta = asset.metadata || {};
  if (meta.surface === 'vocab') return 'vocabulary';
  if (meta.pool === 'scene') return 'story';
  if (meta.pool === 'panel' || asset.kind === 'book_extract') return 'comics';
  if (meta.surface === 'portrait' || meta.surface === 'cover') return 'characters';
  if (asset.type === 'audio') return 'audio';
  if (asset.type === 'video') return 'video';
  if (asset.kind === 'external_url') return 'links';
  return 'other';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/assetCategory.test.ts`
Expected: PASS.

- [ ] **Step 5: ResourceLibrary — add `metadata` to the query, replace type buttons with category chips**

In `apps/teacher/ResourceLibrary.tsx`:

1. `AssetRow` interface: add `metadata: Record<string, any> | null;` and to the select string (line ~89): `'id, type, kind, prompt, public_url, source_url, tags, created_at, metadata'`.
2. Replace the state `const [filter, setFilter] = useState('all')` with `const [filter, setFilter] = useState<AssetCategory | 'all'>('all')`.
3. Replace the `filtered` useMemo filter line `if (filter !== 'all') list = list.filter((a) => a.type === filter);` with:

```ts
    if (filter !== 'all') list = list.filter((a) => deriveAssetCategory(a) === filter);
```

4. Extend the search to include the word key:

```ts
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((a) =>
        (a.prompt || '').toLowerCase().includes(q) ||
        String(a.metadata?.word_key || '').toLowerCase().includes(q) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
```

5. Add the import: `import { deriveAssetCategory, ASSET_CATEGORIES } from '../../services/assetCategory';`
6. Replace the type-button row (`['all', 'image', 'audio', 'video'].map(...)`, lines ~139-148) with:

```tsx
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            All
          </button>
          {ASSET_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === c.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
```

7. Badge the category on the card: in `AssetCard`, under the title row, replace the plain type span (`<span className="uppercase font-bold tracking-wider">{asset.type}</span>`) with the category label:

```tsx
          <span className="uppercase font-bold tracking-wider">
            {ASSET_CATEGORIES.find((c) => c.id === deriveAssetCategory(asset))?.label || asset.type}
          </span>
```

- [ ] **Step 6: Verify + commit**

Run: `npm run lint && npx vitest run`
Expected: clean + PASS. Manual smoke (optional, dev server): `/teacher/library` shows chips; Comics filter shows panel crops if any exist.

```bash
git add services/assetCategory.ts test/assetCategory.test.ts apps/teacher/ResourceLibrary.tsx
git commit -m "feat: library category chips derived from asset metadata"
```

---

### Task 6: Flashcard view mode

**Files:**
- Modify: `apps/teacher/ResourceLibrary.tsx`

**Interfaces:**
- Consumes: `word_images` table via the supabase client (RLS owner-scoped from Task 2's migration); `MediaService.getVocabAudio(unitId, word)` (exists — pass `''` as unitId so the edge call skips unit ownership); `generate-media` `{ action:'generate-image', word, regenerate: true }` (unitId-less staff call — Task 3 path, owner = caller).
- Produces: none (leaf UI).

Payload/edge notes for the implementer:
- Data query: `supabase.from('word_images').select('word_key, updated_at, assets(id, public_url, created_at)').order('updated_at', { ascending: false })` — embedded `assets` respects assets RLS; entries whose asset row is not readable are silently omitted (acceptable: soft-deleted/regenerated-away).
- Regenerate: `supabase.functions.invoke('generate-media', { body: { action: 'generate-image', word, regenerate: true } })` — no `unitId` (the central gate then requires staff, which a teacher session satisfies; storage lands under `images/default/`; owner = the caller).
- Audio: `MediaService.getVocabAudio('', word_key)` — empty unitId keeps the edge call unitId-less (staff-gated) and the global TTS cache returns instantly for published words.

- [ ] **Step 1: Add the flashcard deck state + query**

Inside `ResourceLibrary`, add:

```tsx
import { supabase } from '../../services/supabaseClient';
import { MediaService } from '../../services/MediaService';
import { Volume2, RefreshCw, LayoutGrid, Rows3 } from 'lucide-react';

interface WordImageRow {
  word_key: string;
  updated_at: string;
  assets: { id: string; public_url: string; created_at: string } | null;
}
```

```tsx
  const [viewMode, setViewMode] = useState<'grid' | 'flashcards'>('grid');
  const [wordImages, setWordImages] = useState<WordImageRow[]>([]);

  useEffect(() => {
    if (viewMode !== 'flashcards' || wordImages.length > 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('word_images')
        .select('word_key, updated_at, assets(id, public_url, created_at)')
        .order('updated_at', { ascending: false });
      if (!cancelled) setWordImages((Array.isArray(data) ? data : []).filter((r: any) => r?.assets?.public_url));
    })();
    return () => { cancelled = true; };
  }, [viewMode]);
```

- [ ] **Step 2: Add the `Flashcard` component (file-local, above `ResourceLibrary`)**

```tsx
const Flashcard: React.FC<{
  wordKey: string; url: string; onRegenerated: (wordKey: string, url: string) => void;
}> = ({ wordKey, url, onRegenerated }) => {
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState<'' | 'audio' | 'regen'>('');

  const playAudio = async () => {
    setBusy('audio');
    try {
      const audioUrl = await MediaService.getVocabAudio('', wordKey);
      if (audioUrl) void new Audio(audioUrl).play().catch(() => undefined);
    } finally { setBusy(''); }
  };

  const regenerate = async () => {
    setBusy('regen');
    try {
      const { data, error } = await supabase.functions.invoke('generate-media', {
        body: { action: 'generate-image', word: wordKey, regenerate: true },
      });
      if (!error && data?.url && !String(data.url).includes('dicebear')) onRegenerated(wordKey, data.url);
    } finally { setBusy(''); }
  };

  return (
    <div
      onClick={() => setFlipped((f) => !f)}
      className="cursor-pointer select-none aspect-square rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition-all relative"
    >
      {!flipped ? (
        <img src={url} alt={wordKey} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 bg-emerald-50">
          <span className="text-2xl font-extrabold text-slate-800 capitalize text-center break-words">{wordKey}</span>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={playAudio}
              disabled={busy !== ''}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <Volume2 size={16} /> {busy === 'audio' ? '…' : 'Audio'}
            </button>
            <button
              onClick={regenerate}
              disabled={busy !== ''}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw size={16} className={busy === 'regen' ? 'animate-spin' : ''} /> New image
            </button>
          </div>
          <p className="text-[10px] text-slate-400">tap the card to flip back</p>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Wire the mode toggle + deck into the page**

In the toolbar, after the chip row, add the toggle (visible when the Vocabulary filter is active):

```tsx
        {filter === 'vocabulary' && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold ${viewMode === 'grid' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            ><Rows3 size={16} /> Grid</button>
            <button
              onClick={() => setViewMode('flashcards')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold ${viewMode === 'flashcards' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            ><LayoutGrid size={16} /> Flashcards</button>
          </div>
        )}
```

In the body, branch on the mode (keep the existing loading/empty states for grid):

```tsx
      {viewMode === 'flashcards' && filter === 'vocabulary' ? (
        wordImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <LayoutGrid size={48} className="mb-3 opacity-40" />
            <p className="font-medium text-slate-500">No word images yet</p>
            <p className="text-sm mt-1">They appear as units generate vocabulary media.</p>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {wordImages
              .filter((w) => !search.trim() || w.word_key.includes(search.trim().toLowerCase()))
              .map((w) => (
                <Flashcard
                  key={`${w.word_key}`}
                  wordKey={w.word_key}
                  url={w.assets!.public_url}
                  onRegenerated={(wordKey, url) =>
                    setWordImages((prev) => prev.map((r) => r.word_key === wordKey
                      ? { ...r, assets: r.assets ? { ...r.assets, public_url: url } : r.assets, updated_at: new Date().toISOString() }
                      : r))}
                />
              ))}
          </motion.div>
        )
      ) : loading ? (
        /* …existing grid loading/empty/grid JSX unchanged… */
```

(Reuse the existing three grid branches verbatim in the else side of the ternary.)

- [ ] **Step 4: Verify + commit**

Run: `npm run lint && npx vitest run`
Expected: clean + PASS. Manual smoke (needs the Task 8 migration applied): `/teacher/library` → Vocabulary → Flashcards shows the deck once word_images has rows.

```bash
git add apps/teacher/ResourceLibrary.tsx
git commit -m "feat: flashcard view mode over word_images in the resource library"
```

---

### Task 7: Cleanup + bootstrap script

**Files:**
- Create: `scripts/testing/word-image-dedupe.ts`

**Interfaces:**
- Consumes: `planWordDedupe`, `canonicalWordKey` from Task 1 (`../../supabase/functions/_shared/wordImageCore` — relative import without extension, matching `illustration-backfill.ts`).
- Produces: an operator-run script; exit code 0. Emits `word-repoint-pool.sql` next to the plan for the pool-content repair (applied in Task 8 via the Management API after owner review).

Behavior (spec §3.4): dry-run by default; `--yes` executes; `--owner <uuid>` scopes; `--purge-storage` hard-deletes storage objects of retired assets (default OFF — retired URLs stay renderable for stale flows/manifests).

- [ ] **Step 1: Write the script**

```ts
// scripts/testing/word-image-dedupe.ts — run with:
//   SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   npx tsx scripts/testing/word-image-dedupe.ts              # DRY-RUN (default)
//   ... word-image-dedupe.ts --owner <uuid>                   # scoped dry-run
//   ... word-image-dedupe.ts --yes                            # execute (REST only)
//   ... word-image-dedupe.ts --yes --purge-storage            # + hard-delete objects
//                                                                   (needs SVC_ROLE_JWT)
// Emits word-repoint-pool.sql (pool_items content URL repair) in BOTH modes —
// that SQL is applied separately via the Management API after review.
// Idempotent: winners are upserted; losers retire only when unreferenced.
import { writeFileSync } from 'fs';
import { planWordDedupe, canonicalWordKey } from '../../supabase/functions/_shared/wordImageCore';
import type { VocabRefRow, AssetLike } from '../../supabase/functions/_shared/wordImageCore';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEGACY_KEY = process.env.SVC_ROLE_JWT; // legacy JWT needed for Storage deletes

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const dryRun = !args.includes('--yes');
const onlyOwner = flag('--owner');
const purgeStorage = args.includes('--purge-storage');
if (purgeStorage && !LEGACY_KEY) {
  console.error('--purge-storage requires SVC_ROLE_JWT (legacy service key — the new-style key is rejected by Storage)');
  process.exit(1);
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as T;
}

/** Paginated GET — PostgREST clamps to max-rows; walk with Range headers. */
async function getAll<T = any>(path: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await api<T[]>(`${path}&limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

async function main() {
  console.log(`word-image-dedupe ${dryRun ? 'DRY-RUN' : 'EXECUTE'}${onlyOwner ? ` owner=${onlyOwner}` : ''}${purgeStorage ? ' +purge-storage' : ''}`);

  // 1. Vocabulary references with owners (units embed for teacher_id).
  const vocabRaw = await getAll<any>(`/rest/v1/vocabulary_items?select=id,unit_id,word,image_url,units(teacher_id)&order=created_at.asc`);
  const vocabRows: VocabRefRow[] = vocabRaw.map((r) => ({
    id: r.id, unit_id: r.unit_id, word: r.word,
    image_url: r.image_url,
    owner_id: r.units?.teacher_id ?? null,
  }));
  console.log(`vocabulary_items: ${vocabRows.length} rows (${vocabRows.filter((r) => !r.owner_id).length} without owner — skipped)`);

  // 2. Assets indexed by URL — only image assets whose URL is referenced as a
  //    vocab image can ever be planned (story/portrait/cover crops excluded
  //    by construction: their URLs never appear in vocabulary_items).
  const vocabUrls = new Set(vocabRows.filter((r) => r.image_url).map((r) => r.image_url!));
  const assetRows = await getAll<any>(`/rest/v1/assets?select=id,public_url,created_at,metadata,is_deleted&type=eq.image&order=created_at.asc`);
  const assetsByUrl = new Map<string, AssetLike>();
  const assetById = new Map<string, any>();
  for (const a of assetRows) {
    if (a.public_url && vocabUrls.has(a.public_url) && !a.is_deleted) {
      assetsByUrl.set(a.public_url, { id: a.id, public_url: a.public_url, created_at: a.created_at });
      assetById.set(a.id, a);
    }
  }
  console.log(`assets matching vocab URLs: ${assetsByUrl.size}`);

  // 3. Plan.
  const { plans, skippedNoOwner, repointSqlStatements } = planWordDedupe(
    onlyOwner ? vocabRows.filter((r) => r.owner_id === onlyOwner) : vocabRows,
    assetsByUrl,
  );
  const repointCount = plans.reduce((n, p) => n + p.repoint.length, 0);
  const retireCount = plans.reduce((n, p) => n + p.retireAssetIds.length, 0);
  console.log(`plan: ${plans.length} words | repoint ${repointCount} vocabulary rows | retire ${retireCount} assets | skippedNoOwner ${skippedNoOwner}`);
  writeFileSync('word-repoint-pool.sql', repointSqlStatements.join('\n') + '\n');
  console.log(`wrote word-repoint-pool.sql (${repointSqlStatements.length} pool_items repair statements — apply via Management API after review)`);

  if (dryRun) {
    for (const p of plans.slice(0, 40)) {
      console.log(`  ${p.owner_id.slice(0, 8)}… "${p.word_key}" → ${p.winnerUrl.slice(-24)} (repoint ${p.repoint.length}, retire ${p.retireAssetIds.length})`);
    }
    if (plans.length > 40) console.log(`  … +${plans.length - 40} more`);
    console.log('DRY-RUN complete. Re-run with --yes to execute.');
    return;
  }

  // 4. Execute — winners upsert into word_images (+stamp metadata/owner so the
  //    library + flashcard view can classify them; RLS needs owner_id for
  //    client reads too).
  const retiredIds = new Set(plans.flatMap((p) => p.retireAssetIds));

  for (const p of plans) {
    if (p.winnerAssetId) {
      await api('/rest/v1/word_images?on_conflict=owner_id,word_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ owner_id: p.owner_id, word_key: p.word_key, asset_id: p.winnerAssetId }),
      });
      const winner = assetById.get(p.winnerAssetId);
      const metadata = { ...((winner as any)?.metadata || {}), surface: 'vocab', word_key: p.word_key };
      await api(`/rest/v1/assets?id=eq.${p.winnerAssetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ metadata, owner_id: p.owner_id }),
      });
    }
    for (const r of p.repoint) {
      await api(`/rest/v1/vocabulary_items?id=eq.${r.rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ image_url: p.winnerUrl, image_status: 'ready' }),
      });
    }
    for (const assetId of p.retireAssetIds) {
      await api(`/rest/v1/assets?id=eq.${assetId}`, { method: 'PATCH', body: JSON.stringify({ is_deleted: true }) });
    }
  }

  // --purge-storage: hard-delete the retired assets' storage objects. The
  // storage_path column holds only a directory prefix — derive the object
  // path from the public URL instead. Retired URLs then STOP rendering
  // (stale flows/manifests would show broken images) — hence opt-in.
  if (purgeStorage) {
    for (const [url, a] of assetsByUrl) {
      if (!retiredIds.has(a.id)) continue;
      const marker = '/object/public/';
      const idx = url.indexOf(marker);
      if (idx < 0) continue;
      const [bucket, ...pathParts] = url.slice(idx + marker.length).split('/');
      const objectPath = pathParts.join('/');
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
        method: 'DELETE',
        headers: { apikey: LEGACY_KEY!, Authorization: `Bearer ${LEGACY_KEY!}` },
      });
      console.log(`  purge ${bucket}/${objectPath} → ${resp.status}`);
    }
  }

  console.log(`DONE: ${plans.length} words bootstrapped, ${repointCount} rows repointed, ${retireCount} assets retired.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Syntax/entry check (no env → clean guard exit)**

Run: `npx tsx scripts/testing/word-image-dedupe.ts; echo "exit=$?"`
Expected: stderr `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required`, `exit=1` — proves the module parses and the env guard runs (no DB contact).

- [ ] **Step 3: Commit**

```bash
git add scripts/testing/word-image-dedupe.ts
git commit -m "feat: word-image dedupe cleanup script (bootstrap word_images, repoint, retire)"
```

---

### Task 8: Deploy, live verification, cleanup dry-run

**Files:**
- Modify: `AGENTS.md` (cloud-state rows after deployment)

This task touches PRODUCTION. Env prerequisites (already set in this workspace): `SUPABASE_ACCESS_TOKEN` (PAT). Fetch the service key fresh: `curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/api-keys | python3 -c "import sys,json; print([k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'][0])"`.

- [ ] **Step 1: Apply the migration via the Management API**

```bash
PAT="$SUPABASE_ACCESS_TOKEN"
SQL=$(cat supabase/migrations/20260905000001_word_images.sql)
python3 - "$SQL" <<'PY' > /tmp/word_images_payload.json
import json, sys
print(json.dumps({"query": sys.argv[1]}))
PY
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d @/tmp/word_images_payload.json
```
Then record it in `schema_migrations` (keeps disk ↔ cloud parity — the whole file as one statements element):
```bash
python3 - <<'PY' > /tmp/mig_rec.json
import json
sql = open('supabase/migrations/20260905000001_word_images.sql').read()
print(json.dumps({"query": "insert into supabase_migrations.schema_migrations(version, name, statements) values ('20260905000001', 'word_images', array[" + json.dumps(sql) + "]) on conflict (version) do nothing;"}))
PY
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d @/tmp/mig_rec.json
```
Verify: `curl -s -H "apikey: $ANON" "https://xsdnzijketjnzhakqtit.supabase.co/rest/v1/word_images?select=owner_id" -H "Authorization: Bearer $ANON"` → expect 401/empty (table exists, RLS on) — NOT 404 (relation missing). Then verify the migration record: query `schema_migrations` for version `20260905000001`.

- [ ] **Step 2: Deploy the two edge functions**

```bash
npx supabase functions deploy generate-media generate-exercises --project-ref xsdnzijketjnzhakqtit --no-verify-jwt
```
Probe: `curl -s -X POST "https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/generate-media" -H "apikey: $ANON" -d '{}'` → expect 401 from the function, NOT 404.

- [ ] **Step 3: Push the frontend**

```bash
git push origin master
```
Verify per AGENTS.md §7: `curl -sI https://professor-ruby.vercel.app/teacher` → `last-modified` matches; `curl -s https://professor-ruby.vercel.app/sw.js | grep -oE '[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js' | head` shows fresh chunks.

- [ ] **Step 4: Live dedup verification (two units, same word, one asset)**

Costs ONE real image generation (~$0.04). Using the pipeline account (`avatar-pipeline@professor.internal`, password in `.env.local`):
```bash
# 1. Sign in and resolve the account's user id (teacher_id is stamped
#    EXPLICITLY below — do not rely on DB defaults).
TOKEN=$(curl -s -X POST "https://xsdnzijketjnzhakqtit.supabase.co/auth/v1/token?password=" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"avatar-pipeline@professor.internal","password":"<FROM .env.local>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
UID=$(curl -s "https://xsdnzijketjnzhakqtit.supabase.co/auth/v1/user" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Two throwaway units owned by the pipeline account.
mkunit() { curl -s -X POST "https://xsdnzijketjnzhakqtit.supabase.co/rest/v1/units" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Prefer: return=representation" -H "Content-Type: application/json" \
  -d "{\"title\":\"word-lib verify $1\",\"teacher_id\":\"$UID\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"; }
U1=$(mkunit A); U2=$(mkunit B); echo "U1=$U1 U2=$U2"

# 3. Same word from both units.
for U in $U1 $U2; do
  curl -s -X POST "https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/generate-media" \
    -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"action\":\"generate-image\",\"unitId\":\"$U\",\"word\":\"verify-rock\",\"surface\":\"vocab\"}"; echo
done
```
Expected: first response carries `assetId` with no `cached` flag (the one paid generation); second response `"cached":true` with the SAME `assetId`. Verify the table (service key): `curl -s "https://xsdnzijketjnzhakqtit.supabase.co/rest/v1/word_images?word_key=eq.verify-rock&select=*" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"` → exactly ONE row, owner = `$UID`.
Cleanup: soft-delete both units (`PATCH /rest/v1/units?id=eq.<id>` body `{"deleted_at":"now()"}` with the user token), delete the `word_images` row and soft-delete the asset (service key).

- [ ] **Step 5: Cleanup dry-run + OWNER GATE**

```bash
export SUPABASE_SERVICE_ROLE_KEY=<from Step 0>
SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co npx tsx scripts/testing/word-image-dedupe.ts
```
**STOP. Present the dry-run report + `word-repoint-pool.sql` to the owner.** Do NOT run `--yes` or apply the SQL without explicit owner approval (this is the destructive step of the spec).

- [ ] **Step 6 (only after owner approval): execute cleanup + apply pool SQL**

```bash
SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co npx tsx scripts/testing/word-image-dedupe.ts --yes
# then apply the emitted SQL via the Management API (same pattern as Step 1)
```
Post-verify: `word_images` row count matches the plan; retired assets no longer appear in `/teacher/library`; Vocabulary chip + Flashcards view render.

- [ ] **Step 7: Update AGENTS.md + final commit**

Update: migrations count (119 on disk), edge functions unchanged in count, add a §9 row summarizing the word-image library (dedup design, owner-bound vocab hash, cleanup script, flashcard view) and the deploy date. Commit + push:

```bash
git add AGENTS.md && git commit -m "docs: word-image library deployed (dedup + cleanup + flashcard view)" && git push origin master
```
