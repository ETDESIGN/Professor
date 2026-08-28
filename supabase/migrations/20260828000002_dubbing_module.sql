-- 20260828000002_dubbing_module.sql
-- Video dubbing module: teacher clips + student dubs + class feed (spec 2026-08-28).
-- NOTE: version bumped from the brief's 20260828000001 — that version is already
-- recorded in cloud schema_migrations by a cloud-only "illustration_v2" migration.

-- Helper: class ids of the current auth.uid() student (mirror of student_class_teacher_ids pattern)
CREATE OR REPLACE FUNCTION public.student_class_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT class_id FROM public.class_enrollments WHERE student_id = auth.uid()
$$;

-- Helper: is p_parent an APPROVED parent of p_student?
-- (Real linkage table: public.parent_student_links(parent_id, student_id, status), status='active' = approved)
CREATE OR REPLACE FUNCTION public.is_parent_of(p_student uuid, p_parent uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.parent_student_links
                     WHERE parent_id = p_parent AND student_id = p_student
                       AND status = 'active') $$;

CREATE TABLE public.dubbing_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  title text NOT NULL,
  video_path text NOT NULL,
  video_duration_ms integer NOT NULL,
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','assigned','archived')),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.dubbing_clip_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.dubbing_clips(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  text text NOT NULL,
  start_ms integer NOT NULL CHECK (start_ms >= 0),
  end_ms integer NOT NULL CHECK (end_ms > start_ms),
  character_name text,
  UNIQUE (clip_id, "order")
);

-- One continuous pass records all lines; each line's audio is its own blob.
CREATE TABLE public.dubbings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.dubbing_clips(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  line_audio jsonb NOT NULL DEFAULT '{}', -- { [clip_line_id]: storagePath }
  per_line_scores jsonb NOT NULL DEFAULT '{}', -- { [clip_line_id]: { band, wordMatch, transcript, method } }
  overall_band text CHECK (overall_band IN ('great','almost','try_again')),
  attempt_no integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clip_id, student_id, attempt_no)
);

CREATE TABLE public.dubbing_likes (
  dubbing_id uuid NOT NULL REFERENCES public.dubbings(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dubbing_id, student_id)
);

CREATE TABLE public.dubbing_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dubbing_id uuid NOT NULL REFERENCES public.dubbings(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id),
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 3),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dubbing_clips_class_idx ON public.dubbing_clips(class_id) WHERE status = 'assigned';
CREATE INDEX dubbings_clip_student_idx ON public.dubbings(clip_id, student_id);
CREATE INDEX dubbings_published_idx ON public.dubbings(clip_id) WHERE is_published;

-- === RLS ===
ALTER TABLE public.dubbing_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dubbing_clip_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dubbings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dubbing_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dubbing_feedback ENABLE ROW LEVEL SECURITY;

-- Clips: teachers manage their classes' clips; students see ASSIGNED clips of their classes.
DROP POLICY IF EXISTS "dubbing_clips_all" ON public.dubbing_clips;
CREATE POLICY "dubbing_clips_all" ON public.dubbing_clips FOR ALL TO authenticated
USING (
  public.is_role('admin')
  OR (public.is_role('teacher') AND public.can_manage_class(dubbing_clips.class_id, auth.uid()))
  OR (public.is_role('student') AND dubbing_clips.status = 'assigned'
      AND dubbing_clips.class_id IN (SELECT public.student_class_ids()))
)
WITH CHECK (
  public.is_role('admin')
  OR (public.is_role('teacher') AND public.can_manage_class(dubbing_clips.class_id, auth.uid()))
);

DROP POLICY IF EXISTS "dubbing_clip_lines_select" ON public.dubbing_clip_lines;
CREATE POLICY "dubbing_clip_lines_select" ON public.dubbing_clip_lines FOR SELECT TO authenticated
USING ( EXISTS (
  SELECT 1 FROM public.dubbing_clips c WHERE c.id = dubbing_clip_lines.clip_id
    AND ( public.is_role('admin')
      OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid()))
      OR (public.is_role('student') AND c.status = 'assigned'
          AND c.class_id IN (SELECT public.student_class_ids())) )
));

DROP POLICY IF EXISTS "dubbing_clip_lines_write" ON public.dubbing_clip_lines;
CREATE POLICY "dubbing_clip_lines_write" ON public.dubbing_clip_lines FOR ALL TO authenticated
USING ( EXISTS (
  SELECT 1 FROM public.dubbing_clips c WHERE c.id = dubbing_clip_lines.clip_id
    AND ( public.is_role('admin')
      OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid())) )
))
WITH CHECK ( EXISTS (
  SELECT 1 FROM public.dubbing_clips c WHERE c.id = dubbing_clip_lines.clip_id
    AND ( public.is_role('admin')
      OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid())) )
));

-- Dubbings: owner student full access; classmates read PUBLISHED same-class only; teachers read their classes.
DROP POLICY IF EXISTS "dubbings_select" ON public.dubbings;
CREATE POLICY "dubbings_select" ON public.dubbings FOR SELECT TO authenticated
USING (
  dubbings.student_id = auth.uid()
  OR public.is_role('admin')
  OR (public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.id = dubbings.clip_id AND public.can_manage_class(c.class_id, auth.uid())))
  OR (dubbings.is_published AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.id = dubbings.clip_id AND c.status <> 'archived'
          AND c.class_id IN (SELECT public.student_class_ids())))
  OR (public.is_role('parent') AND public.is_parent_of(dubbings.student_id, auth.uid()))
);

DROP POLICY IF EXISTS "dubbings_insert" ON public.dubbings;
CREATE POLICY "dubbings_insert" ON public.dubbings FOR INSERT TO authenticated
WITH CHECK (
  dubbings.student_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.dubbing_clips c
              WHERE c.id = dubbings.clip_id AND c.status = 'assigned'
                AND c.class_id IN (SELECT public.student_class_ids()))
);

DROP POLICY IF EXISTS "dubbings_update" ON public.dubbings;
CREATE POLICY "dubbings_update" ON public.dubbings FOR UPDATE TO authenticated
USING (
  dubbings.student_id = auth.uid()
  OR public.is_role('admin')
  OR (public.is_role('teacher') AND EXISTS (  -- moderation unpublish
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.id = dubbings.clip_id AND public.can_manage_class(c.class_id, auth.uid())))
)
WITH CHECK (
  dubbings.student_id = auth.uid()
  OR public.is_role('admin')
  OR (public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.id = dubbings.clip_id AND public.can_manage_class(c.class_id, auth.uid())))
);

DROP POLICY IF EXISTS "dubbings_delete" ON public.dubbings;
CREATE POLICY "dubbings_delete" ON public.dubbings FOR DELETE TO authenticated
USING (
  dubbings.student_id = auth.uid()
  OR public.is_role('admin')
  OR (public.is_role('parent') AND public.is_parent_of(dubbings.student_id, auth.uid()))
  OR (public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.id = dubbings.clip_id AND public.can_manage_class(c.class_id, auth.uid())))
);

-- Likes: students like published dubs in their class; only their own rows.
DROP POLICY IF EXISTS "dubbing_likes_all" ON public.dubbing_likes;
CREATE POLICY "dubbing_likes_all" ON public.dubbing_likes FOR ALL TO authenticated
USING (
  dubbing_likes.student_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.dubbings d JOIN public.dubbing_clips c ON c.id = d.clip_id
             WHERE d.id = dubbing_likes.dubbing_id AND d.is_published
               AND c.class_id IN (SELECT public.student_class_ids()))
)
WITH CHECK (
  dubbing_likes.student_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.dubbings d JOIN public.dubbing_clips c ON c.id = d.clip_id
              WHERE d.id = dubbing_likes.dubbing_id AND d.is_published
                AND c.class_id IN (SELECT public.student_class_ids()))
);

-- Feedback: teachers write for their classes; dub owner + that teacher's class students read.
DROP POLICY IF EXISTS "dubbing_feedback_all" ON public.dubbing_feedback;
CREATE POLICY "dubbing_feedback_all" ON public.dubbing_feedback FOR ALL TO authenticated
USING ( EXISTS (
  SELECT 1 FROM public.dubbings d JOIN public.dubbing_clips c ON c.id = d.clip_id
  WHERE d.id = dubbing_feedback.dubbing_id
    AND ( public.is_role('admin')
      OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid()))
      OR d.student_id = auth.uid()
      OR (public.is_role('parent') AND public.is_parent_of(d.student_id, auth.uid())) )
))
WITH CHECK (
  dubbing_feedback.teacher_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.dubbings d JOIN public.dubbing_clips c ON c.id = d.clip_id
              WHERE d.id = dubbing_feedback.dubbing_id
                AND public.can_manage_class(c.class_id, auth.uid()))
);

-- === Storage: private bucket ===
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dubbing-media', 'dubbing-media', false, 52428800,
        ARRAY['video/mp4','video/webm','audio/webm','audio/ogg','audio/mp4'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "dubbing_media_teacher_upload" ON storage.objects;
CREATE POLICY "dubbing_media_teacher_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK ( bucket_id = 'dubbing-media' AND public.is_role('teacher')
             AND (storage.foldername(name))[1] = 'clips' );

DROP POLICY IF EXISTS "dubbing_media_student_upload" ON storage.objects;
CREATE POLICY "dubbing_media_student_upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK ( bucket_id = 'dubbing-media' AND public.is_role('student')
             AND name LIKE 'dubs/' || auth.uid()::text || '/%' );

DROP POLICY IF EXISTS "dubbing_media_read" ON storage.objects;
CREATE POLICY "dubbing_media_read" ON storage.objects FOR SELECT TO authenticated
USING ( bucket_id = 'dubbing-media' AND (
  public.is_role('admin')
  OR (storage.foldername(name))[1] = 'clips'  -- clips: any authenticated member of the class (table RLS gates which)
  OR ( (storage.foldername(name))[1] = 'dubs' AND name LIKE 'dubs/' || auth.uid()::text || '/%' )
  OR EXISTS ( -- teacher of the dub's student's class: allow via teacher read on all dubs paths
        SELECT 1 FROM public.dubbings d
        WHERE d.line_audio::text LIKE '%' || name || '%' )
) );

DROP POLICY IF EXISTS "dubbing_media_delete" ON storage.objects;
CREATE POLICY "dubbing_media_delete" ON storage.objects FOR DELETE TO authenticated
USING ( bucket_id = 'dubbing-media' AND (
  public.is_role('admin')
  OR name LIKE 'dubs/' || auth.uid()::text || '/%'
) );
