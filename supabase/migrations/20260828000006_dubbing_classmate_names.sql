-- =====================================================================
-- 20260828000006 — classmate first names for the student dubbing gallery
--
-- listClassDubs embeds profiles!dubbings_student_id_fkey(full_name), but
-- profiles RLS blocks students from reading other students' rows → the
-- gallery rendered "?" for every classmate. This SECURITY DEFINER RPC
-- exposes the FIRST NAME ONLY of students with a published dubbing on the
-- clip, scoped to classes the caller is enrolled in (same convention as
-- 20260817000002 join_class_by_code).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dubbing_classmate_first_names(p_clip uuid)
RETURNS TABLE(student_id uuid, first_name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT
      d.student_id,
      COALESCE(split_part(p.full_name, ' ', 1), '')
  FROM public.dubbings d
  JOIN public.profiles p ON p.id = d.student_id
  WHERE d.clip_id = p_clip
    AND d.is_published
    AND EXISTS (
      SELECT 1 FROM public.dubbing_clips c
      WHERE c.id = d.clip_id
        AND c.class_id IN (SELECT public.student_class_ids())
    )
$$;

REVOKE ALL ON FUNCTION public.dubbing_classmate_first_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dubbing_classmate_first_names(uuid) TO authenticated;
