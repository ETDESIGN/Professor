-- =====================================================================
-- 20260723000003 — session occurrences + per-session attendance
--
-- Attendance is anchored to a discrete teaching-session OCCURRENCE (one row
-- per "go live"), not a calendar day. A student can attend two sessions in a
-- day → two independent attendance sets. Absent students are excluded from
-- live-board participation but stay visible (greyed) on the leaderboard.
--
-- RLS reuses the recursion-safe can_manage_class(class_id, auth.uid()) helper.
-- =====================================================================

-- Discrete teaching-session occurrences (the durable session history the
-- singleton classroom_sessions row never kept).
CREATE TABLE IF NOT EXISTS public.class_session_occurrences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES public.classes(id)   ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  unit_id     uuid REFERENCES public.units(id)              ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_occurrences_class_started
  ON public.class_session_occurrences (class_id, started_at DESC);

ALTER TABLE public.class_session_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS occurrences_select_policy ON public.class_session_occurrences;
CREATE POLICY occurrences_select_policy ON public.class_session_occurrences
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  );

DROP POLICY IF EXISTS occurrences_write_policy ON public.class_session_occurrences;
CREATE POLICY occurrences_write_policy ON public.class_session_occurrences
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(class_session_occurrences.class_id, auth.uid())
  );

-- Per-(occurrence, student) attendance. Binary present/absent in the app;
-- CHECK keeps late/excused reserved for the future.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id     uuid NOT NULL REFERENCES public.class_session_occurrences(id) ON DELETE CASCADE,
  class_id          uuid NOT NULL REFERENCES public.classes(id)         ON DELETE CASCADE,
  teacher_id        uuid NOT NULL REFERENCES public.profiles(id)        ON DELETE CASCADE,
  roster_student_id uuid NOT NULL REFERENCES public.roster_students(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present', 'absent', 'late', 'excused')),
  marked_at         timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One record per student per occurrence; re-taking upserts the row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_occurrence_student
  ON public.attendance_records (occurrence_id, roster_student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_occurrence
  ON public.attendance_records (occurrence_id);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select_policy ON public.attendance_records;
CREATE POLICY attendance_select_policy ON public.attendance_records
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(attendance_records.class_id, auth.uid())
  );

DROP POLICY IF EXISTS attendance_write_policy ON public.attendance_records;
CREATE POLICY attendance_write_policy ON public.attendance_records
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR public.can_manage_class(attendance_records.class_id, auth.uid())
  ) WITH CHECK (
    teacher_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      OR public.can_manage_class(attendance_records.class_id, auth.uid())
    )
  );

-- Realtime so the board reflects mid-session attendance changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_records') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='class_session_occurrences') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.class_session_occurrences;
  END IF;
END $$;
