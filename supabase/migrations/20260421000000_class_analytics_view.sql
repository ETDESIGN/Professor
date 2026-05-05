CREATE OR REPLACE VIEW public.class_analytics_view AS
SELECT 
  c.id as class_id,
  c.teacher_id,
  COUNT(ce.student_id) as total_students,
  COALESCE(SUM(sp.xp), 0) as total_xp,
  ROUND(COALESCE(AVG(sp.xp), 0)) as avg_xp_per_student,
  -- mastery proxy (assuming ~10 units max for 100%)
  ROUND(COALESCE(AVG(array_length(sp.completed_unit_ids, 1)), 0) / 10.0 * 100) as mastery_percent,
  -- engagement: max 100 from streak
  LEAST(100, ROUND(COALESCE(AVG(sp.streak), 0) * 3.33)) as engagement_percent,
  -- completion proxy
  ROUND((COUNT(sp.current_unit_id)::float / GREATEST(COUNT(ce.student_id), 1)) * 100) as completion_percent
FROM public.classes c
LEFT JOIN public.class_enrollments ce ON c.id = ce.class_id
LEFT JOIN public.student_progress sp ON ce.student_id = sp.student_id
GROUP BY c.id, c.teacher_id;

GRANT SELECT ON public.class_analytics_view TO authenticated, service_role;
