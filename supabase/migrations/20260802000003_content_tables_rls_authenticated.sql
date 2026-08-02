-- =====================================================================
-- Content tables: add auth.role()='authenticated' to SELECT policies
-- ---------------------------------------------------------------------
-- Defense-in-depth (audit §4.5): vocabulary_items, story_pages,
-- dialogue_lines, grammar_rules SELECT policies omit the authenticated
-- clause that objectives/pool_items have. Today get_unit_bundle is
-- SECURITY DEFINER (bypasses RLS), but any future direct student read
-- of these tables would 403. Adding the clause makes SELECT available
-- to any authenticated user (writes remain strictly governed by the
-- INSERT/UPDATE/DELETE policies).
--
-- Also: revoke over-broad GRANT ALL ... TO anon on these 4 tables;
-- replace with GRANT SELECT (anon should read but not write).
-- =====================================================================

-- ── 1. vocabulary_items ─────────────────────────────────────────────
DROP POLICY IF EXISTS "vocabulary_items_select_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_select_policy"
    ON public.vocabulary_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

-- ── 2. story_pages ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "story_pages_select_policy" ON public.story_pages;
CREATE POLICY "story_pages_select_policy"
    ON public.story_pages FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

-- ── 3. dialogue_lines ───────────────────────────────────────────────
DROP POLICY IF EXISTS "dialogue_lines_select_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_select_policy"
    ON public.dialogue_lines FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

-- ── 4. grammar_rules ────────────────────────────────────────────────
DROP POLICY IF EXISTS "grammar_rules_select_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_select_policy"
    ON public.grammar_rules FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR auth.role() = 'authenticated'
    );

-- ── 5. Tighten anon grants (SELECT only, not ALL) ───────────────────
REVOKE ALL ON public.vocabulary_items FROM anon;
GRANT SELECT ON public.vocabulary_items TO anon;

REVOKE ALL ON public.story_pages FROM anon;
GRANT SELECT ON public.story_pages TO anon;

REVOKE ALL ON public.dialogue_lines FROM anon;
GRANT SELECT ON public.dialogue_lines TO anon;

REVOKE ALL ON public.grammar_rules FROM anon;
GRANT SELECT ON public.grammar_rules TO anon;
