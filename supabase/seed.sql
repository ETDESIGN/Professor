INSERT INTO public.student_progress (student_id, completed_unit_ids, current_unit_id, xp, streak)
VALUES ('default_student', ARRAY['u0'], 'u1', 1250, 12);

INSERT INTO public.students (id, name, avatar, points, level, team) VALUES
  ('s1', 'Leo', '🦁', 1250, 5, 'red'),
  ('s2', 'Mia', '🐱', 980, 4, 'blue'),
  ('s3', 'Sam', '🐶', 1420, 6, 'red'),
  ('s4', 'Zoe', '🐰', 850, 3, 'blue'),
  ('s5', 'Max', '🦊', 1100, 4, 'red'),
  ('s6', 'Lily', '🐼', 1300, 5, 'blue');

INSERT INTO public.srs_items (student_id, word, translation, interval, repetition, efactor, next_review) VALUES
  ('default_student', 'Apple', 'Manzana', 1, 1, 2.5, NOW() - INTERVAL '1 day'),
  ('default_student', 'Dog', 'Perro', 6, 2, 2.6, NOW() - INTERVAL '2 days'),
  ('default_student', 'Cat', 'Gato', 0, 0, 2.5, NOW());
