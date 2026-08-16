-- Migration: get_class_leaderboard RPC
-- Audit P0-4 (docs/audit/STUDENT_APP_AUDIT_2026-08-17.md): the student
-- leaderboard read class_roster_analytics_view, which inherits RLS from
-- roster_students/point_transactions (teacher/manager/admin only) — students
-- got 0 rows and an empty podium. SECURITY DEFINER exposes the same roster
-- ranking (class points + home XP, including unclaimed roster kids) scoped to
-- the caller's enrolled classes. profile_id lets the client highlight "(You)".

CREATE OR REPLACE FUNCTION public.get_class_leaderboard(p_limit INT DEFAULT 50)
RETURNS TABLE (
    roster_student_id UUID,
    class_id UUID,
    student_name TEXT,
    avatar_url TEXT,
    total_points BIGINT,
    streak INT,
    gems INT,
    is_claimed BOOLEAN,
    profile_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.roster_student_id,
        v.class_id,
        v.student_name,
        v.avatar_url,
        v.total_points,
        v.streak,
        v.gems,
        v.is_claimed,
        v.claimed_profile_id
    FROM public.class_roster_analytics_view v
    WHERE v.is_archived = false
      AND v.class_id IN (
          SELECT e.class_id
          FROM public.class_enrollments e
          WHERE e.student_id = auth.uid()
      )
    ORDER BY v.total_points DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_leaderboard(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_leaderboard(INT) TO authenticated;
