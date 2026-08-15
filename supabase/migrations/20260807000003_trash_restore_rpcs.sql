-- 20260807000003_trash_restore_rpcs.sql
-- Unit & Book Manager — trash/restore RPCs.
--
-- Discovered via browser verification (2026-08-07): soft-deleting a unit via a
-- direct PostgREST UPDATE fails with "new row violates row-level security
-- policy" because the SELECT policies on units/books filter deleted_at IS NULL:
--   • trash:  the moment deleted_at is set, the updated row no longer passes
--             the SELECT policy that PostgREST's RETURNING applies → error;
--   • restore: the trashed row is invisible to the UPDATE entirely.
-- Fix: route trash/restore through SECURITY DEFINER RPCs (same pattern as
-- delete_unit_full / list_trashed_*), with explicit ownership checks.

CREATE OR REPLACE FUNCTION trash_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT teacher_id INTO v_owner FROM units WHERE id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit not found';
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT is_role('admin') THEN
    RAISE EXCEPTION 'not authorized to trash this unit';
  END IF;
  UPDATE units SET deleted_at = now() WHERE id = p_unit_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_unit(p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT teacher_id INTO v_owner FROM units WHERE id = p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit not found';
  END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT is_role('admin') THEN
    RAISE EXCEPTION 'not authorized to restore this unit';
  END IF;
  UPDATE units SET deleted_at = NULL WHERE id = p_unit_id;
END;
$$;

CREATE OR REPLACE FUNCTION trash_book(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'not authorized to trash this book';
  END IF;
  UPDATE books SET deleted_at = now() WHERE id = p_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION restore_book(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'not authorized to restore this book';
  END IF;
  UPDATE books SET deleted_at = NULL WHERE id = p_book_id;
END;
$$;

GRANT EXECUTE ON FUNCTION trash_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION trash_book(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_book(uuid) TO authenticated;
