-- =====================================================================
-- 20260726000001 — Codify roster/attendance SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------
-- WHY: The TypeScript service layer calls four RPCs
--   (create_roster_student, create_session_occurrence, save_attendance_records,
--    end_session_occurrence)
-- that have been running in the CLOUD database (created directly via the
-- SQL editor during the attendance/roster work) but were NEVER committed
-- to a local migration file. Verified absent from disk via:
--   grep -rn "CREATE FUNCTION.*<name>" supabase/   ->  (no matches)
--
-- That means a fresh `supabase db push` (new env, CI reset, disaster
-- recovery) would silently LOSE them, and adding a student / saving
-- attendance would throw at runtime.
--
-- This migration captures the EXACT definitions currently live on the
-- `xsdnzijketjnzhakqtit` (Professor 1.0) cloud DB, pulled verbatim via the
-- Management API on 2026-07-26. They are all:
--   * SECURITY DEFINER  — run as the function owner (postgres), bypassing RLS
--     so the inner profile/class lookups don't recurse.
--   * SET search_path TO 'public' — schema-injection hardening.
--   * Authorized by: admin (profiles.role='admin') OR class owner
--     (classes.teacher_id = auth.uid()). `create_roster_student` additionally
--     allows an active school manager on the class's school.
--
-- Idempotent: CREATE OR REPLACE. Re-running on a DB that already has these
-- (like the current cloud) is a no-op behaviorally.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) create_roster_student
--    Caller: services/ManagementService.ts:151  (useCreateRosterStudent)
--            apps/teacher/AttendanceModal.tsx:49 (Add walk-in)
--    Inserts one roster_students row. Returns the new row as JSON.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_roster_student(
    p_class_id      uuid,
    p_teacher_id    uuid,
    p_display_name  text,
    p_avatar        text DEFAULT NULL,
    p_team          text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_row   roster_students;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND role = 'admin')
    OR EXISTS (SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = caller_id)
    OR EXISTS (
      SELECT 1 FROM classes c
      JOIN school_memberships sm ON sm.school_id = c.school_id
      WHERE c.id = p_class_id AND c.school_id IS NOT NULL
        AND sm.user_id = caller_id AND sm.role = 'manager' AND sm.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to add students to this class';
  END IF;

  INSERT INTO roster_students (class_id, teacher_id, display_name, avatar, team)
  VALUES (p_class_id, p_teacher_id, trim(p_display_name), p_avatar, p_team)
  RETURNING * INTO new_row;

  RETURN to_json(new_row);
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) create_session_occurrence
--    Caller: services/AttendanceService.ts:41  (getOrCreateActiveOccurrence)
--            store/SessionContext.tsx:506      (go-live)
--    Opens a new class_session_occurrences row for a live session.
--    Returns its id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_session_occurrence(
    p_class_id    uuid,
    p_teacher_id  uuid,
    p_unit_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_id    uuid;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND role = 'admin')
    OR EXISTS (SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = caller_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO class_session_occurrences (class_id, teacher_id, unit_id)
  VALUES (p_class_id, p_teacher_id, p_unit_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) save_attendance_records
--    Caller: services/AttendanceService.ts:83  (useSaveAttendance)
--    Upserts an array of {roster_student_id, status, marked_at} for one
--    occurrence. Conflicts on (occurrence_id, roster_student_id) — see
--    migration 20260723000003 uq_attendance_occurrence_student.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_attendance_records(
    p_occurrence_id  uuid,
    p_class_id       uuid,
    p_teacher_id     uuid,
    p_records        jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_id uuid;
  rec       jsonb;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND role = 'admin')
    OR EXISTS (SELECT 1 FROM classes c WHERE c.id = p_class_id AND c.teacher_id = caller_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    INSERT INTO attendance_records (occurrence_id, class_id, teacher_id, roster_student_id, status, marked_at)
    VALUES (
      p_occurrence_id,
      p_class_id,
      p_teacher_id,
      (rec->>'roster_student_id')::uuid,
      rec->>'status',
      COALESCE((rec->>'marked_at')::timestamptz, now())
    )
    ON CONFLICT (occurrence_id, roster_student_id)
    DO UPDATE SET status = EXCLUDED.status, marked_at = EXCLUDED.marked_at;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------
-- 4) end_session_occurrence
--    Caller: services/AttendanceService.ts:50  (endOccurrence)
--            store/SessionContext.tsx:541      (session end)
--    Sets ended_at = now() on an open occurrence owned by the caller.
--    No-op (not an error) if the occurrence is already ended or not owned.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_session_occurrence(
    p_occurrence_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE class_session_occurrences
  SET ended_at = now()
  WHERE id = p_occurrence_id AND ended_at IS NULL
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = caller_id AND role = 'admin')
      OR EXISTS (SELECT 1 FROM classes c WHERE c.id = class_session_occurrences.class_id AND c.teacher_id = caller_id)
    );
END;
$function$;

-- Execution grants for the client roles.
GRANT EXECUTE ON FUNCTION public.create_roster_student(uuid, uuid, text, text, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_session_occurrence(uuid, uuid, uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_attendance_records(uuid, uuid, uuid, jsonb)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_session_occurrence(uuid)                                 TO authenticated;
