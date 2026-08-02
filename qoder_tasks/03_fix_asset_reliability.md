# Task 03 — Fix asset recording reliability (B-DEDUP + B-ASSET-SWALLOW)

## Context
The `assets` table has only 26 rows despite heavy image generation, because (a) the dedup-by-`prompt_hash` has **no unique constraint** so concurrent runs double-insert and double-spend, and (b) asset-insert **errors are silently swallowed** (`.catch(() => {})`) so failures are invisible. Found in `docs/brainstorming/QODER_AUDIT.md` §1 (B-DEDUP, B-ASSET-SWALLOW) and §1 of the generation-pipeline audit.

## Scope
- `supabase/migrations/` (one NEW migration for the unique index)
- `supabase/functions/_shared/imageGen.ts` (stop swallowing; dedup-safe insert)

**Do NOT touch:** `tts.ts`, the generation functions, the client. The fix is one migration + one shared helper.

## What to change

### Part A — Add the unique constraint on `assets(prompt_hash, type)`
Write `supabase/migrations/20260802000002_assets_prompt_hash_unique.sql`:
- `CREATE UNIQUE INDEX IF NOT EXISTS assets_prompt_hash_type_uniq ON public.assets(prompt_hash, type) WHERE prompt_hash IS NOT NULL;`
- Why partial (`WHERE prompt_hash IS NOT NULL`): legacy rows + audio-without-prompt rows have null `prompt_hash`; they must not violate the constraint. The `type` discriminator keeps image/audio/video dedup independent.
- Add a header comment explaining the dedup race this closes (concurrent fire-and-forget generate-exercises runs).

Apply via the Management API (`--data-binary @<(python3 ...)`), register version `20260802000002`. **Watch for a conflict on apply** — if duplicate `(prompt_hash, type)` rows already exist (likely, given the race), the index creation will fail. If it does, first dedupe with `DELETE FROM assets a USING assets b WHERE a.id > b.id AND a.prompt_hash IS NOT NULL AND a.prompt_hash = b.prompt_hash AND a.type = b.type;` then create the index. Include that dedupe step in the migration (idempotent).

### Part B — Stop swallowing asset-insert errors in `imageGen.ts`
`supabase/functions/_shared/imageGen.ts:100` currently: `fetch(...POST /rest/v1/assets...).catch(() => {})`. Change so:
- The insert is still best-effort (a failed asset row must NOT fail image generation — the URL is already returned to the caller).
- BUT errors are LOGGED, not swallowed. Replace `.catch(() => {})` with `.then(({ error }) => { if (error) console.error('assets insert failed:', error.message); })`. Keep it non-throwing.
- Also: the dedup READ at `imageGen.ts:58-73` is now protected by the unique index, so concurrent runs that both miss the read will have one insert succeed and the other fail with a 409/unique-violation — that's the correct behavior (one wins, the other re-reads). Handle the unique-violation gracefully in the insert path: on 23505 (unique_violation), re-read the existing row's `public_url` and return it instead of erroring. (Supabase REST returns 409 — check `error.code === '23505'` or the 409 status.)

## Acceptance Criteria
- [ ] Migration `20260802000002` exists, idempotent, applied on cloud (verify the index exists via the query below)
- [ ] `_shared/imageGen.ts` logs insert errors instead of swallowing them (grep shows no `.catch(() => {})` on the assets insert)
- [ ] On a unique-violation (409/23505) the function re-reads and returns the existing asset URL (no error surfaced to caller)
- [ ] `npx tsc --noEmit -p tsconfig.json` clean
- [ ] Re-deploy `generate-exercises` AND `generate-media` (both import imageGen) — `supabase functions deploy <name> --no-verify-jwt`

**Verify query:** `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='assets' AND indexname LIKE '%prompt_hash%';`

## Don't
- Do NOT make asset-insert failures throw (generation must still succeed without an asset row).
- Do NOT change the dedup read logic at `imageGen.ts:58-73` (it's correct; it just lacked the constraint).
- Do NOT add a UI or telemetry table.

## References
- `docs/brainstorming/QODER_AUDIT.md` §1 (B-DEDUP, B-ASSET-SWALLOW)
- `supabase/functions/_shared/imageGen.ts:58-101`
- `supabase/migrations/20260502000001_asset_dedup.sql` (the existing non-unique index, to understand current state)

---

## STATUS

- [x] Migration `20260802000002` exists, idempotent, applied on cloud (verified: `assets_prompt_hash_type_uniq` UNIQUE index confirmed via pg_indexes query)
- [x] `_shared/imageGen.ts` logs insert errors instead of swallowing them (grep confirms no `.catch(() => {})` remains)
- [x] On a unique-violation (409/23505) the function re-reads and returns the existing asset URL (no error surfaced to caller)
- [x] `npx tsc --noEmit -p tsconfig.json` clean (only Deno/esm noise)
- [x] Re-deployed `generate-exercises` AND `generate-media` (both import imageGen) via `supabase functions deploy <name> --no-verify-jwt`
- **Commit:** (see below)
- **Notes:** The dedupe DELETE in the migration ran cleanly (no error), meaning either no duplicates existed or they were removed. Both indexes now coexist: the old non-unique `idx_assets_prompt_hash` (for fast lookups) and the new unique `assets_prompt_hash_type_uniq` (for constraint). The insert now uses `Prefer: return=representation` header for richer error context.
- **Questions for reviewer:** none
