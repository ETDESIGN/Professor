-- =====================================================================
-- 20260820000001 — restore soft-delete (trash) visibility on units
-- ---------------------------------------------------------------------
-- Regression found 2026-08-20: after "Move to Trash" the unit stayed in
-- the teacher's library list (toast confirmed, row correctly flagged).
--
-- Cause: 20260817000007_student_sees_published_only rebuilt
-- units_select_policy (to add the status='Active' gate for students)
-- but DROPPED the `deleted_at IS NULL` filter that 20260807000001
-- (unit/book manager + trash) had put there. Teachers SELECT therefore
-- returned trashed rows again; the library list (which relies on RLS,
-- not a client-side filter) kept showing them.
--
-- Fix: recreate the policy with BOTH protections — trash filter AND the
-- published-only student gate. The student EXISTS-branches on
-- objectives/pool_items/assets/srs_items (20260817000005/7) consult
-- units through RLS, so they inherit the trash filter automatically.
-- get_unit_bundle is SECURITY DEFINER and bypasses RLS — it keeps its
-- own checks; hardening it for trashed units is a possible follow-up.
--
-- Symptom data note: no data repair needed — rows trashed while the
-- filter was missing are correctly flagged; they leave the library and
-- show up in the Trash tab the moment this policy lands.

DROP POLICY IF EXISTS "units_select_policy" ON public.units;
CREATE POLICY "units_select_policy"
  ON public.units FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_role('admin')
      OR (public.is_role('teacher') AND (units.teacher_id = auth.uid() OR units.teacher_id IS NULL))
      OR (public.is_role('student') AND units.status = 'Active' AND units.teacher_id = ANY(public.student_class_teacher_ids()))
    )
  );
