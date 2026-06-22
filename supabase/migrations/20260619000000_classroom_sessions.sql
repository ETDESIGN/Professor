-- ============================================
-- Classroom Sessions: authoritative live-session state (Phase 1, audit P0-1)
-- --------------------------------------------
-- The Classroom Board (/board), Teacher Remote (/remote) and Live Commander
-- (/teacher/live) run in SEPARATE browser tabs / on separate devices, each with
-- its own in-memory React state. Previously slide navigation only updated local
-- state and was never broadcast, so the projector could never follow the
-- teacher (audit P0-1).
--
-- This table is the single source of truth. All surfaces subscribe to their
-- teacher's row via Supabase Realtime (postgres_changes); the commander writes
-- unit_id / current_index / status on navigation; the board converges.
--
-- Model: one active session row per teacher. The projector and remote are
-- expected to be signed in as the same teacher account. Multi-teacher / class
-- codes are a future enhancement (documented in the architecture changelog).
-- ============================================

CREATE TABLE IF NOT EXISTS public.classroom_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  current_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'LIVE', 'PAUSED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_teacher ON public.classroom_sessions(teacher_id);

-- At most one active session row per teacher.
CREATE UNIQUE INDEX IF NOT EXISTS uq_classroom_sessions_teacher
  ON public.classroom_sessions(teacher_id);

ALTER TABLE public.classroom_sessions ENABLE ROW LEVEL SECURITY;

-- Projector / remote / commander all run as the teacher and read their own row.
DROP POLICY IF EXISTS "classroom_sessions_select_policy" ON public.classroom_sessions;
CREATE POLICY "classroom_sessions_select_policy"
  ON public.classroom_sessions FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_teacher_or_admin());

-- Only the owning teacher (or an admin) drives the session.
DROP POLICY IF EXISTS "classroom_sessions_insert_policy" ON public.classroom_sessions;
CREATE POLICY "classroom_sessions_insert_policy"
  ON public.classroom_sessions FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid() OR public.is_teacher_or_admin());

DROP POLICY IF EXISTS "classroom_sessions_update_policy" ON public.classroom_sessions;
CREATE POLICY "classroom_sessions_update_policy"
  ON public.classroom_sessions FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_teacher_or_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_teacher_or_admin());

DROP POLICY IF EXISTS "classroom_sessions_delete_policy" ON public.classroom_sessions;
CREATE POLICY "classroom_sessions_delete_policy"
  ON public.classroom_sessions FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_teacher_or_admin());

-- Ensure the table participates in the realtime publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'classroom_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.classroom_sessions;
  END IF;
END $$;
