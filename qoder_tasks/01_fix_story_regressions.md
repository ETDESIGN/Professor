# Task 01 — Fix the two story-content regressions (R1 + R2)

## Context
The read-path retirement layer switched `getStory()` to prefer relational `story_pages`, but the mapper drops two fields consumers render: `comprehension_questions` (R1) and the page image URL (R2). Result: for any unit reading relationally (all migrated units), the **student reading quiz silently empties to 0 questions** and **story art degrades to a gradient placeholder**. Both are silent user-facing regressions. Found in `docs/brainstorming/QODER_AUDIT.md` §1 (R1, R2).

## Scope
- `services/manifest.ts` (the `getStory()` mapper, ~lines 194-211)
- `supabase/migrations/` (one NEW migration to fix `get_unit_bundle`)

**Do NOT touch:** `apps/student/ReadingReader.tsx`, `apps/board/templates/BoardStoryStage.tsx`, edge functions, anything else. The fix is in the mapper + the RPC only.

## What to change

### Part A — `getStory()` must surface comprehension questions + image URL
`services/manifest.ts:203-208` currently maps relational pages to only `{ text, speaker, image_prompt }`. Replace the mapper so each page also carries:
- `comprehension_questions` — sourced from `manifest?._relational?.story_questions` matched by `story_page_id` (the bundle returns them as a separate `story_questions` array; group them by `story_page_id` and attach to the matching page; questions with null `story_page_id` attach by order_index fallback).
- `imageUrl` (and a lowercased `image_url` alias for safety) — sourced from `manifest?._relational?.story_pages[i].image_url` IF the bundle resolves it (see Part B), else leave undefined (don't synthesize).

Keep the manifest fallback path (`return base` at the end) unchanged — it already works for unmigrated units.

### Part B — `get_unit_bundle` must resolve image URLs
The RPC (migration `20260730000012_get_unit_bundle_student_auth.sql`) returns `story_pages` via `to_jsonb(sp)` — only the FK `image_asset_id`, never the URL. Add a LEFT JOIN to `assets` so each story page row also carries `image_url` (= `assets.public_url`) and `audio_url`. Mirror the same for `dialogue_lines` (they have `audio_asset_id`).

Write a NEW migration `supabase/migrations/20260802000001_get_unit_bundle_resolve_assets.sql` that `CREATE OR REPLACE FUNCTION get_unit_bundle(...)` with the joins. **Copy the existing function body exactly** (same auth check, same SECURITY DEFINER, same SET search_path) and only add the asset joins to the story_pages and dialogue_lines sub-selects. Do NOT change the function signature or authorization logic.

Apply it via the Management API (see `QODER_WORKFLOW.md` conventions #5 — use `--data-binary @<(python3 ...)`), then register version `20260802000001`.

## Acceptance Criteria
- [ ] `services/manifest.ts` `getStory()` returns pages that include `comprehension_questions` (array) when the bundle has `story_questions`
- [ ] `services/manifest.ts` `getStory()` returns pages that include `imageUrl` when the bundle resolves it
- [ ] New migration `20260802000001` exists, is idempotent (`CREATE OR REPLACE FUNCTION`), and is applied on cloud
- [ ] `get_unit_bundle` now returns story_pages with `image_url` and dialogue_lines with `audio_url` (verify with a query — see below)
- [ ] `npx tsc --noEmit -p tsconfig.json` clean (ignoring Deno/esm noise)
- [ ] `npx vite build` succeeds

**Verify query** (run after applying the migration): pick a unit with story_pages, call the RPC shape — confirm story_pages rows now carry `image_url`:
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -A "supabase-cli/2.78.1" \
  --data-binary @<(python3 -c "
import json
q = \"SELECT (get_unit_bundle((SELECT id FROM units WHERE jsonb_array_length(manifest#>'{enriched_content,story,pages}')>0 LIMIT 1)))->'story_pages'->0 AS first_page;\"
print(json.dumps({'query': q}))
") | python3 -m json.tool
```

## Don't
- Do NOT change `ReadingReader.tsx` or `BoardStoryStage.tsx` — they already read the fields correctly once the mapper provides them.
- Do NOT alter the function signature / auth of `get_unit_bundle`.
- Do NOT touch the manifest-write path.
- Do NOT add a UI.

## References
- `docs/brainstorming/QODER_AUDIT.md` §1 (R1, R2 — verified)
- `services/manifest.ts:194-211`
- `supabase/migrations/20260730000012_get_unit_bundle_student_auth.sql` (the function to copy + extend)

---

## STATUS

- [x] `services/manifest.ts` `getStory()` returns pages that include `comprehension_questions` (array) when the bundle has `story_questions`
- [x] `services/manifest.ts` `getStory()` returns pages that include `imageUrl` when the bundle resolves it
- [x] New migration `20260802000001` exists, is idempotent (`CREATE OR REPLACE FUNCTION`), and is applied on cloud
- [x] `get_unit_bundle` now returns story_pages with `image_url` and dialogue_lines with `audio_url` (verified — fields present; currently NULL because no story_pages have image_asset_id set yet, but the JOIN is correct and will resolve once assets are linked)
- [x] `npx tsc --noEmit -p tsconfig.json` clean (only Deno/esm noise from edge functions)
- [x] `npx vite build` succeeds
- **Commit:** `3ce6e7b`
- **Notes:** 101 story_comprehension_questions all have story_page_id set, so the primary lookup path (qByPageId) covers all existing data. The order_index fallback is a safety net for future null-page-id questions. 86 story_pages exist, 0 currently have image_asset_id (Phase 3 vault FK not yet populated) — the join returns null gracefully.
- **Questions for reviewer:** none
