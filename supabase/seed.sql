-- Seed data for Professor EdTech
-- All IDs are valid UUIDs (v4-style) to match post-migration column types

INSERT INTO public.student_progress (student_id, completed_unit_ids, current_unit_id, xp, streak)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  ARRAY[]::UUID[],
  NULL,
  0,
  0
) ON CONFLICT (student_id) DO NOTHING;

INSERT INTO public.srs_items (student_id, word, translation, interval, repetition, efactor, next_review)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Apple', 'Manzana', 1, 1, 2.5, NOW() - INTERVAL '1 day'),
  ('00000000-0000-0000-0000-000000000001', 'Dog', 'Perro', 6, 2, 2.6, NOW() - INTERVAL '2 days'),
  ('00000000-0000-0000-0000-000000000001', 'Cat', 'Gato', 0, 0, 2.5, NOW())
ON CONFLICT DO NOTHING;
