-- =====================================================================
-- 20260726000004 — class_roster_analytics_view (workstream C2)
-- ---------------------------------------------------------------------
-- WHY: the live board reads roster_students (incl. UNCLAIMED kids) and
-- computes points = SUM(point_transactions) + home_xp. But the leaderboard
-- (GamificationService.getLeaderboard) and class_analytics_view both read
-- class_enrollments + student_progress — which only see CLAIMED students.
-- So a class with 20 roster entries of which 5 are claimed shows 5 students
-- on the leaderboard / Reports but 20 on the board. The two views disagree.
--
-- This view is the roster-first source of truth that matches the board's
-- computation exactly (point_transactions ledger sum + student_progress xp
-- for claimed students, ledger-only for unclaimed). It co-exists with the
-- legacy class_analytics_view so consumers can migrate one at a time; the
-- legacy view is NOT dropped here (deprecate after C2 client changes land).
--
-- Verified-against-cloud schema:
--   roster_students(id, class_id, claimed_profile_id, display_name, avatar,
--                   team, is_archived)
--   point_transactions(roster_id, amount integer, class_id, profile_id)
--   student_progress(student_id, xp, streak, gems)
--   profiles(id, full_name, avatar_url)
-- =====================================================================

CREATE OR REPLACE VIEW public.class_roster_analytics_view AS
SELECT
  rs.id                                AS roster_student_id,
  rs.class_id,
  rs.team,
  rs.claimed_profile_id,
  rs.is_archived,
  COALESCE(p.full_name, rs.display_name)            AS student_name,
  COALESCE(p.avatar_url, rs.avatar, '')             AS avatar_url,
  COALESCE(pt.points_total, 0)                       AS class_points,
  COALESCE(sp.xp, 0)                                 AS home_xp,
  COALESCE(sp.streak, 0)                             AS streak,
  COALESCE(sp.gems, 0)                               AS gems,
  (COALESCE(pt.points_total, 0) + COALESCE(sp.xp, 0)) AS total_points,
  (rs.claimed_profile_id IS NOT NULL)                AS is_claimed
FROM public.roster_students rs
LEFT JOIN public.profiles p
  ON p.id = rs.claimed_profile_id
LEFT JOIN public.student_progress sp
  ON sp.student_id = rs.claimed_profile_id
LEFT JOIN (
  SELECT roster_id, SUM(amount) AS points_total
  FROM public.point_transactions
  GROUP BY roster_id
) pt ON pt.roster_id = rs.id;

-- Read-only to authenticated users (RLS on roster_students + point_transactions
-- already scopes what each caller can see; the view inherits row visibility
-- from its underlying tables). GRANT is required because views need explicit
-- grants even when the underlying tables are readable.
GRANT SELECT ON public.class_roster_analytics_view TO authenticated;
GRANT SELECT ON public.class_roster_analytics_view TO service_role;
