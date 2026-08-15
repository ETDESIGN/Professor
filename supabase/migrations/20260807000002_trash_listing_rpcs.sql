-- 20260807000002_trash_listing_rpcs.sql
-- Unit & Book Manager — trash listing.
--
-- The SELECT policies on units/books filter `deleted_at IS NULL`, so trashed
-- rows are invisible to normal client reads. The Trash tab needs to list them,
-- so we expose two SECURITY DEFINER RPCs scoped to the caller's own rows
-- (teacher_id = auth.uid() for units; owner_id = auth.uid() for books).
-- Admins see nothing extra here (trash is a personal recovery surface).

CREATE OR REPLACE FUNCTION list_trashed_units()
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  level text,
  topic text,
  cover_image text,
  book_id uuid,
  last_updated timestamptz,
  created_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.title, u.status, u.level, u.topic, u.cover_image,
         u.book_id, u.last_updated, u.created_at, u.deleted_at
  FROM units u
  WHERE u.deleted_at IS NOT NULL
    AND u.teacher_id = auth.uid()
  ORDER BY u.deleted_at DESC;
$$;

CREATE OR REPLACE FUNCTION list_trashed_books()
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  title text,
  cover_asset_id uuid,
  target_age_range text,
  cefr_level text,
  created_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.owner_id, b.title, b.cover_asset_id,
         b.target_age_range, b.cefr_level, b.created_at, b.deleted_at
  FROM books b
  WHERE b.deleted_at IS NOT NULL
    AND b.owner_id = auth.uid()
  ORDER BY b.deleted_at DESC;
$$;

GRANT EXECUTE ON FUNCTION list_trashed_units() TO authenticated;
GRANT EXECUTE ON FUNCTION list_trashed_books() TO authenticated;
