-- =====================================================================
-- 20260726000002 — archive_roster_student cascade RPC (workstream C1)
-- ---------------------------------------------------------------------
-- WHY: services/ManagementService.ts archiveRosterStudent() only does
--   UPDATE roster_students SET is_archived = true
-- and nothing else. The board then hides the student (roster query filters
-- is_archived=false), but EVERY OTHER screen still shows them because they
-- read class_enrollments / parent_roster_links / parent_student_links /
-- point_transactions — none of which are touched.
--
-- So a "removed" student keeps appearing in Reports, DashboardHome,
-- TeacherMessages, the leaderboard, class_analytics_view, and the parent's
-- own dashboard. This RPC fixes that by cascading the archive server-side.
--
-- Verified-against-cloud facts used here:
--   * roster_students: class_id NULLABLE, teacher_id NOT NULL,
--     claimed_profile_id NULLABLE (null = unclaimed), is_archived NOT NULL.
--   * parent_roster_links.status / parent_student_links.status are the
--     `membership_status` enum: pending | active | rejected | revoked.
--     There is NO 'archived' value, so we use 'revoked' (the link is being
--     withdrawn because the student left the class) — semantically correct
--     and valid against the enum.
--   * point_transactions are KEPT as historical record (they feed aggregate
--     analytics); archiving the roster row hides the student from future
--     board interactions, which is the intent.
--
-- SECURITY: SECURITY DEFINER + SET search_path='public'. Authorized for
-- admin / class teacher / active school manager on the class's school,
-- mirroring the create_roster_student authorization (migration
-- 20260726000001). Idempotent: archiving an already-archived row is safe.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.archive_roster_student(p_roster_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class_id    uuid;
  v_profile_id  uuid;
  v_teacher_id  uuid;
  v_caller      uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Snapshot the row we're acting on.
  SELECT class_id, claimed_profile_id, teacher_id
    INTO v_class_id, v_profile_id, v_teacher_id
    FROM roster_students
    WHERE id = p_roster_id;
  IF NOT FOUND THEN
    -- Already deleted or never existed — treat as success (idempotent).
    RETURN;
  END IF;

  -- Authorization: admin OR class teacher OR active school manager on the
  -- class's school. Same matrix as create_roster_student.
  IF NOT (
    EXISTS (SELECT 1 FROM profiles WHERE id = v_caller AND role = 'admin')
    OR v_teacher_id = v_caller
    OR (
      v_class_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM classes c
        JOIN school_memberships sm ON sm.school_id = c.school_id
        WHERE c.id = v_class_id
          AND c.school_id IS NOT NULL
          AND sm.user_id = v_caller
          AND sm.role = 'manager'
          AND sm.status = 'active'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to archive this roster student';
  END IF;

  -- 1. Soft-archive the roster row (board hides it via is_archived=false filter).
  UPDATE roster_students SET is_archived = true WHERE id = p_roster_id;

  -- 2. Unlink the legacy enrollment so Reports / Dashboard / Messages /
  --    leaderboard / class_analytics_view hide the student too. Only when the
  --    roster row was actually claimed (had a profile to unlink).
  IF v_profile_id IS NOT NULL AND v_class_id IS NOT NULL THEN
    DELETE FROM class_enrollments
      WHERE class_id = v_class_id AND student_id = v_profile_id;
  END IF;

  -- 3. Revoke parent links (new + legacy). 'revoked' is a valid
  --    membership_status enum value; it tells the parent app the link is no
  --    longer active without losing the audit trail. Only touch rows that
  --    were pending or active (don't resurrect already-rejected links).
  UPDATE parent_roster_links
    SET status = 'revoked'
    WHERE roster_student_id = p_roster_id
      AND status IN ('pending', 'active');

  IF v_profile_id IS NOT NULL THEN
    UPDATE parent_student_links
      SET status = 'revoked'
      WHERE student_id = v_profile_id
        AND status IN ('pending', 'active');
  END IF;

  -- 4. point_transactions are intentionally NOT deleted: they're the
  --    historical class-points ledger and feed aggregate analytics. The
  --    roster row being archived already excludes the student from future
  --    board interactions; the ledger rows are read-only history.
END;
$function$;

GRANT EXECUTE ON FUNCTION public.archive_roster_student(uuid) TO authenticated;
