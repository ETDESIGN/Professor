-- 20260828000004_dubbing_parent_read.sql
-- Task 10 (parent DubbingGallery): the parent app must be able to
--   (1) READ the dubbing_clips / dubbing_clip_lines rows behind the child's
--       dubs (titles + subtitle windows for DubPlayer),
--   (2) READ the clip source video from the dubbing-media bucket, and
--   (3) DELETE the child's dub line-audio blobs (GDPR erasure path — the
--       parent can already DELETE the dubbings row via `dubbings_delete`,
--       but `dubbing_media_delete` only allowed the uploader's own folder).
-- Scope is strictly parent-of-a-student-with-a-dubbing-on-that-clip.
-- Likes (`dubbing_likes_all`) are intentionally NOT widened: parents cannot
-- read like rows (accepted limitation; the parent UI shows stars/comment only).

-- Helper: does the current user parent a student who has a dubbing on this clip?
-- SECURITY DEFINER so table policies don't recurse into dubbings RLS
-- (same pattern as dubbing_blob_visible in 20260828000003).
CREATE OR REPLACE FUNCTION public.dubbing_clip_parent_visible(p_clip uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dubbings d
    WHERE d.clip_id = p_clip
      AND public.is_parent_of(d.student_id, auth.uid())
  )
$$;

-- Helper: may the current user (parent) delete blobs of their child's dub?
CREATE OR REPLACE FUNCTION public.dubbing_blob_parent_deletable(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dubbings d
    WHERE EXISTS (SELECT 1 FROM jsonb_each(d.line_audio) e WHERE e.value #>> '{}' = p_name)
      AND public.is_parent_of(d.student_id, auth.uid())
  )
$$;

-- (1a) clips: add parent read branch (FOR ALL policy; WITH CHECK below still
-- excludes parents from any write path).
DROP POLICY IF EXISTS "dubbing_clips_all" ON public.dubbing_clips;
CREATE POLICY "dubbing_clips_all" ON public.dubbing_clips FOR ALL TO authenticated
USING (
  public.is_role('admin')
  OR (public.is_role('teacher') AND public.can_manage_class(dubbing_clips.class_id, auth.uid()))
  OR (public.is_role('student') AND dubbing_clips.status = 'assigned'
      AND dubbing_clips.class_id IN (SELECT public.student_class_ids()))
  OR (public.is_role('parent') AND public.dubbing_clip_parent_visible(dubbing_clips.id))
)
WITH CHECK (
  public.is_role('admin')
  OR (public.is_role('teacher') AND public.can_manage_class(dubbing_clips.class_id, auth.uid()))
);

-- (1b) clip lines: add parent read branch.
DROP POLICY IF EXISTS "dubbing_clip_lines_select" ON public.dubbing_clip_lines;
CREATE POLICY "dubbing_clip_lines_select" ON public.dubbing_clip_lines FOR SELECT TO authenticated
USING ( EXISTS (
  SELECT 1 FROM public.dubbing_clips c WHERE c.id = dubbing_clip_lines.clip_id
    AND ( public.is_role('admin')
      OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid()))
      OR (public.is_role('student') AND c.status = 'assigned'
          AND c.class_id IN (SELECT public.student_class_ids()))
      OR (public.is_role('parent') AND public.dubbing_clip_parent_visible(c.id)) )
));

-- (2) storage: parents may read the clip source video when their child has a
-- dub on that clip (the dubs/... line-audio branch already allows parents via
-- dubbing_blob_visible in 20260828000003).
DROP POLICY IF EXISTS "dubbing_media_read" ON storage.objects;
CREATE POLICY "dubbing_media_read" ON storage.objects FOR SELECT TO authenticated
USING ( bucket_id = 'dubbing-media' AND (
  public.is_role('admin')
  OR ( public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.video_path = name AND public.can_manage_class(c.class_id, auth.uid())) )
  OR ( public.is_role('student') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.video_path = name AND c.status = 'assigned'
          AND c.class_id IN (SELECT public.student_class_ids())) )
  OR ( public.is_role('parent') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.video_path = name AND public.dubbing_clip_parent_visible(c.id)) )
  OR ( (storage.foldername(name))[1] = 'dubs'
       AND ( name LIKE 'dubs/' || auth.uid()::text || '/%'  -- own folder (incl. not-yet-referenced uploads)
             OR public.dubbing_blob_visible(name) ) )
) );

-- (3) storage delete: parents may delete their child's dub blobs (erasure).
DROP POLICY IF EXISTS "dubbing_media_delete" ON storage.objects;
CREATE POLICY "dubbing_media_delete" ON storage.objects FOR DELETE TO authenticated
USING ( bucket_id = 'dubbing-media' AND (
  public.is_role('admin')
  OR name LIKE 'dubs/' || auth.uid()::text || '/%'
  OR public.dubbing_blob_parent_deletable(name)
  OR ( public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.video_path = name AND public.can_manage_class(c.class_id, auth.uid())) )
) );
