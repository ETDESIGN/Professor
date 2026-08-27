-- 20260828000003_dubbing_rls_fixes.sql
-- RLS hardening for the dubbing module (Task 1 review findings):
--   (a) storage dub-blob branch used substring LIKE matching (cross-match risk:
--       dubs/u/a.webm also matches ba.webm) and had no teacher/parent/published
--       gating. Replaced with an exact-path helper `dubbing_blob_visible(name)`
--       that mirrors the `dubbings_select` visibility rules; owners keep raw
--       prefix access to their own dubs/ folder so freshly uploaded
--       (not-yet-referenced) blobs remain readable/deletable.
--   (b) storage clips branch allowed ANY authenticated user to read any clip
--       video. Now an exact match on dubbing_clips.video_path, gated by
--       can_manage_class (teachers) / assigned-to-my-class (students).
--   (c) verified: class_enrollments has NO status column (id, class_id,
--       student_id, enrolled_at, role_in_class) — student_class_ids() needs no
--       is-active filter and matches how existing policies treat enrollment.
--   (d) dubbings_update let teachers modify ANY column (incl. student_id /
--       line_audio). Guard trigger now restricts teacher moderation updates to
--       is_published=false / published_at=null only.
--   (e) teachers couldn't delete their classes' clip video objects (only the
--       bucket-wide admin could) — deleting a clip row would orphan the blob.

-- (a) Exact-match dub-blob visibility helper (mirrors dubbings_select policy).
-- SECURITY DEFINER so storage.objects policies don't recurse into dubbings RLS.
CREATE OR REPLACE FUNCTION public.dubbing_blob_visible(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dubbings d
    JOIN public.dubbing_clips c ON c.id = d.clip_id
    WHERE EXISTS (SELECT 1 FROM jsonb_each(d.line_audio) e WHERE e.value #>> '{}' = p_name)
      AND ( d.student_id = auth.uid()
         OR public.is_role('admin')
         OR (public.is_role('teacher') AND public.can_manage_class(c.class_id, auth.uid()))
         OR (d.is_published AND c.status <> 'archived'
             AND c.class_id IN (SELECT public.student_class_ids()))
         OR (public.is_role('parent') AND public.is_parent_of(d.student_id, auth.uid())) )
  )
$$;

-- (d) Teacher moderation may only unpublish (is_published -> false, published_at -> null).
CREATE OR REPLACE FUNCTION public.dubbing_teacher_update_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_role('teacher') AND NOT public.is_role('admin') THEN
    -- Teachers may ONLY unpublish: every column must be unchanged except
    -- is_published/published_at, and the row must end up unpublished.
    IF NEW.clip_id         IS DISTINCT FROM OLD.clip_id
    OR NEW.student_id      IS DISTINCT FROM OLD.student_id
    OR NEW.line_audio      IS DISTINCT FROM OLD.line_audio
    OR NEW.per_line_scores IS DISTINCT FROM OLD.per_line_scores
    OR NEW.overall_band    IS DISTINCT FROM OLD.overall_band
    OR NEW.attempt_no      IS DISTINCT FROM OLD.attempt_no
    OR NEW.created_at      IS DISTINCT FROM OLD.created_at
    OR NEW.is_published
    OR NEW.published_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'teacher moderation may only unpublish a dubbing (is_published=false, published_at=null)';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_dubbing_teacher_update_guard ON public.dubbings;
CREATE TRIGGER trg_dubbing_teacher_update_guard
  BEFORE UPDATE ON public.dubbings
  FOR EACH ROW EXECUTE FUNCTION public.dubbing_teacher_update_guard();

-- (a)+(b) storage read: exact path matching, role/class gated.
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
  OR ( (storage.foldername(name))[1] = 'dubs'
       AND ( name LIKE 'dubs/' || auth.uid()::text || '/%'  -- own folder (incl. not-yet-referenced uploads)
             OR public.dubbing_blob_visible(name) ) )
) );

-- (e) teachers must be able to remove their classes' clip video objects
--     (deleting a clip row would otherwise orphan the blob; admins only before).
DROP POLICY IF EXISTS "dubbing_media_delete" ON storage.objects;
CREATE POLICY "dubbing_media_delete" ON storage.objects FOR DELETE TO authenticated
USING ( bucket_id = 'dubbing-media' AND (
  public.is_role('admin')
  OR name LIKE 'dubs/' || auth.uid()::text || '/%'
  OR ( public.is_role('teacher') AND EXISTS (
        SELECT 1 FROM public.dubbing_clips c
        WHERE c.video_path = name AND public.can_manage_class(c.class_id, auth.uid())) )
) );
