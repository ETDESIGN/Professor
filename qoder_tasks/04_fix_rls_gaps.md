# Task 04 — Close the RLS gap on content tables (defense-in-depth)

## Context
The new content tables (`vocabulary_items`, `story_pages`, `dialogue_lines`, `grammar_rules`) SELECT policies omit the `auth.role() = 'authenticated'` clause that `objectives`/`pool_items` have. Today this is papered over because `get_unit_bundle` is `SECURITY DEFINER` (bypasses RLS), but any future direct student read of these tables will 403. This is a defense-in-depth fix — small, safe, prevents a future footgun. Found in `docs/brainstorming/QODER_AUDIT.md` §4 (item 5) and the generation-pipeline audit §4.

## Scope
- `supabase/migrations/` (one NEW migration that drops+recreates the SELECT policies)

**Do NOT touch:** any app code, edge functions, the RPC. Pure SQL.

## What to change

Write `supabase/migrations/20260802000003_content_tables_rls_authenticated.sql`. For EACH of these tables — `vocabulary_items`, `story_pages`, `dialogue_lines`, `grammar_rules`:

1. `DROP POLICY IF EXISTS "<table>_select_policy" ON public.<table>;`
2. `CREATE POLICY "<table>_select_policy" ON public.<table> FOR SELECT TO authenticated USING ( <existing clauses> OR auth.role() = 'authenticated' );`

**Mirror the EXISTING clause structure** (teacher owns unit OR teacher_id IS NULL OR is_teacher_or_admin()) and ADD `OR auth.role() = 'authenticated'`. Read each table's current policy from its migration file to copy the exact existing clauses — do not invent new ones.

The intent: any authenticated user can SELECT (RLS still governs writes strictly). This matches `objectives`/`pool_items` (`supabase/migrations/20260628000000_objectives_table.sql`, `.../20260628000001_pool_items_table.sql`) which include that clause.

Also: while you're here, revoke the over-broad `GRANT ALL ON <table> TO anon` on these four tables (replace with `GRANT SELECT ON <table> TO anon;` — anon should read but not write). The current `GRANT ALL ... TO anon` is wider than necessary (RLS still governs, but defense-in-depth). Only do this for the four content tables; don't touch other tables.

Apply via the Management API, register version `20260802000003`.

## Acceptance Criteria
- [ ] Migration `20260802000003` exists, idempotent (DROP IF EXISTS + CREATE), applied on cloud
- [ ] All 4 content tables' SELECT policies include `OR auth.role() = 'authenticated'` (verify via the query below)
- [ ] `anon` grant is SELECT-only on these 4 tables (verify)
- [ ] No app code changes (the build/typecheck are unaffected — this is DB-only)

**Verify query:**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -A "supabase-cli/2.78.1" \
  --data-binary @<(python3 -c "
import json
q = \"SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('vocabulary_items','story_pages','dialogue_lines','grammar_rules') AND cmd='SELECT';\"
print(json.dumps({'query': q}))
") | python3 -m json.tool
```
Each `qual` should now contain `auth.role() = 'authenticated'`.

## Don't
- Do NOT change INSERT/UPDATE/DELETE policies (only SELECT).
- Do NOT touch `unit_media`, `content_review_status`, `characters`, `unit_characters` (different decisions apply; out of scope).
- Do NOT touch the `get_unit_bundle` RPC or any edge function.
- Do NOT change the app.

## References
- `docs/brainstorming/QODER_AUDIT.md` §4 (item 5)
- `supabase/migrations/20260730000009_vocabulary_items.sql`, `20260729000004_story_tables.sql`, `20260730000001_dialogue_lines.sql`, `20260730000003_grammar_rules.sql` (current policies to copy+extend)
- `supabase/migrations/20260628000000_objectives_table.sql` (the reference pattern with the `authenticated` clause)
