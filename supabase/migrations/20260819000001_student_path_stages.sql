-- =====================================================================
-- 20260819000001 — Student Path: teacher-planned, lockable unit stages
-- ---------------------------------------------------------------------
-- Duolingo-style split of a unit into playable nodes (stages). The unit's
-- solo lesson stops being one monolithic run of units.flow: the teacher
-- composes an ordered list of stages (each = optional lead-in blocks + one
-- scored round), and the student map (HomeMap) renders them as real
-- lockable nodes with per-stage progress.
--
--   units.student_path JSONB — the plan itself. Shape (mirrors the flow
--   block contract so both surfaces can share builders):
--     [{ "id": <uuid>,            -- stable across reorders (progress key)
--        "title": "Vocabulary",
--        "icon": "star",          -- icon key resolved client-side
--        "kind": "lesson",        -- 'lesson' | 'review'
--        "lock": "auto",          -- 'auto' | 'locked' | 'open'
--        "xpReward": 10,
--        "blocks": [ {id,type,title,duration,data,phase} ] }]
--
--   student_stage_progress — per-student completion of one stage. The only
--   relational addition: it is the per-student state that must be queried
--   (teacher dashboards, parent reporting). Unlock evaluation itself is
--   client-side (sequential + teacher override), see
--   services/stageProgressService.ts computeNodeStates.
--
-- The live session path (units.flow, classroom_sessions) is untouched.
-- =====================================================================

-- (1) the plan column
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS student_path JSONB NOT NULL DEFAULT '[]'::jsonb;

-- (2) per-student stage progress
CREATE TABLE IF NOT EXISTS public.student_stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  stars INT NOT NULL DEFAULT 0 CHECK (stars >= 0 AND stars <= 3),
  best_accuracy INT NOT NULL DEFAULT 0 CHECK (best_accuracy >= 0 AND best_accuracy <= 100),
  attempts INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_student_stage_progress_student_unit
  ON public.student_stage_progress (student_id, unit_id);

ALTER TABLE public.student_stage_progress ENABLE ROW LEVEL SECURITY;

-- Students read/write only their own rows. Completion writes come from the
-- solo player (client-side upsert), so INSERT/UPDATE policies are required
-- (the player never writes another student's row: WITH CHECK enforces it).
DROP POLICY IF EXISTS "student_stage_progress_own_select" ON public.student_stage_progress;
CREATE POLICY "student_stage_progress_own_select"
  ON public.student_stage_progress FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "student_stage_progress_own_insert" ON public.student_stage_progress;
CREATE POLICY "student_stage_progress_own_insert"
  ON public.student_stage_progress FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "student_stage_progress_own_update" ON public.student_stage_progress;
CREATE POLICY "student_stage_progress_own_update"
  ON public.student_stage_progress FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers read progress for stages of units they own (dashboard /
-- per-student path view). Same tenant rule as pool access
-- (20260817000005): the unit's teacher, or teacher/admin staff.
DROP POLICY IF EXISTS "student_stage_progress_teacher_select" ON public.student_stage_progress;
CREATE POLICY "student_stage_progress_teacher_select"
  ON public.student_stage_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = student_stage_progress.unit_id
        AND u.teacher_id = auth.uid()
    )
    OR (SELECT public.is_teacher_or_admin())
  );

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_student_stage_progress()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_student_stage_progress ON public.student_stage_progress;
CREATE TRIGGER trg_touch_student_stage_progress
  BEFORE UPDATE ON public.student_stage_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_student_stage_progress();
