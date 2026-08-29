-- 20260829000000_trash_units_bulk.sql
-- Bulk variant of trash_unit for the Curriculum Library multi-select delete.
--
-- Same RLS rationale as 20260807000003_trash_restore_rpcs.sql: the units
-- SELECT policy filters deleted_at IS NULL, so a direct PostgREST multi-row
-- UPDATE can never work — trashing must run in a SECURITY DEFINER RPC with an
-- explicit ownership check. All ids are verified up front so the batch is
-- atomic: either every selected unit is trashed or none is. Rows already in
-- the trash (e.g. trashed from another tab in the meantime) are skipped and
-- excluded from the returned count instead of failing the whole batch.

CREATE OR REPLACE FUNCTION trash_units(p_unit_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested integer;
  v_owned integer;
  v_trashed integer;
BEGIN
  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no unit ids provided';
  END IF;

  SELECT COUNT(DISTINCT x) INTO v_requested FROM unnest(p_unit_ids) AS x;

  SELECT COUNT(*) INTO v_owned
  FROM units
  WHERE id = ANY(p_unit_ids)
    AND (teacher_id = auth.uid() OR is_role('admin'));

  IF v_owned <> v_requested THEN
    RAISE EXCEPTION 'not authorized to trash some of these units';
  END IF;

  UPDATE units SET deleted_at = now()
  WHERE id = ANY(p_unit_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_trashed = ROW_COUNT;
  RETURN v_trashed;
END;
$$;

GRANT EXECUTE ON FUNCTION trash_units(uuid[]) TO authenticated;
