-- =====================================================================
-- 20260803000001 — Fix content-tables RLS regression (P0-3)
-- ---------------------------------------------------------------------
-- Migration 20260802000003_content_tables_rls_authenticated.sql re-added
-- `OR auth.role() = 'authenticated'` to the SELECT policies of
-- vocabulary_items, story_pages, dialogue_lines, grammar_rules. This
-- lets ANY authenticated student read every unit's answer-bearing content
-- (distractors, grammar_rules.error_examples[].correct, comprehension
-- answers) — undoing the enrollment-scoped hardening from 20260628000005.
--
-- Fix: drop the blanket `authenticated` clause and restore the
-- owner-OR-admin-OR-enrolled pattern (same as objectives/pool_items).
-- The `teacher_id IS NULL` branch is KEPT (textbook-template case,
-- intentional — units created without an owner during upload).
--
-- Also: revoke the anon SELECT grants added by 20260802000003 (anon
-- should NOT read answer-bearing content directly; the student read path
-- is get_unit_bundle which is SECURITY DEFINER).
-- =====================================================================

-- ── 1. vocabulary_items ─────────────────────────────────────────────
DROP POLICY IF EXISTS "vocabulary_items_select_policy" ON public.vocabulary_items;
CREATE POLICY "vocabulary_items_select_policy"
    ON public.vocabulary_items FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = vocabulary_items.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = vocabulary_items.unit_id
        )
    );

-- ── 2. story_pages ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "story_pages_select_policy" ON public.story_pages;
CREATE POLICY "story_pages_select_policy"
    ON public.story_pages FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = story_pages.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = story_pages.unit_id
        )
    );

-- ── 3. dialogue_lines ───────────────────────────────────────────────
DROP POLICY IF EXISTS "dialogue_lines_select_policy" ON public.dialogue_lines;
CREATE POLICY "dialogue_lines_select_policy"
    ON public.dialogue_lines FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = dialogue_lines.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = dialogue_lines.unit_id
        )
    );

-- ── 4. grammar_rules ────────────────────────────────────────────────
DROP POLICY IF EXISTS "grammar_rules_select_policy" ON public.grammar_rules;
CREATE POLICY "grammar_rules_select_policy"
    ON public.grammar_rules FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.units u WHERE u.id = grammar_rules.unit_id AND u.teacher_id IS NULL)
        OR (SELECT public.is_teacher_or_admin())
        OR EXISTS (
            SELECT 1 FROM public.class_enrollments ce
            JOIN public.assignments a ON a.class_id = ce.class_id
            WHERE ce.student_id = auth.uid() AND a.unit_id = grammar_rules.unit_id
        )
    );

-- ── 5. Revoke anon SELECT (answer-bearing content must not be public) ──
REVOKE SELECT ON public.vocabulary_items FROM anon;
REVOKE SELECT ON public.story_pages FROM anon;
REVOKE SELECT ON public.dialogue_lines FROM anon;
REVOKE SELECT ON public.grammar_rules FROM anon;
