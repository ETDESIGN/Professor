-- 20260829000001_empty_trash.sql
-- "Empty trash" button (Trash tab) — permanent, cascading delete of everything
-- the current teacher owns in the trash, in one atomic transaction.
--
-- Reuses delete_unit_full / delete_book_full per item (each keeps its own
-- ownership check and cascade). Units go first so books whose only remaining
-- units were trashed become deletable. Books that still have live (non-trashed)
-- units attached cannot be permanently deleted (delete_book_full refuses) —
-- they are skipped and reported in books_skipped instead of failing the batch.

CREATE OR REPLACE FUNCTION empty_trash()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u record;
  b record;
  v_units integer := 0;
  v_books integer := 0;
  v_books_skipped integer := 0;
  v_live_units integer;
BEGIN
  FOR u IN
    SELECT id FROM units
    WHERE deleted_at IS NOT NULL
      AND (teacher_id = auth.uid() OR is_role('admin'))
    ORDER BY deleted_at
  LOOP
    PERFORM delete_unit_full(u.id);
    v_units := v_units + 1;
  END LOOP;

  FOR b IN
    SELECT id FROM books
    WHERE deleted_at IS NOT NULL
      AND (owner_id = auth.uid() OR is_role('admin'))
    ORDER BY deleted_at
  LOOP
    SELECT COUNT(*) INTO v_live_units
    FROM units
    WHERE book_id = b.id AND deleted_at IS NULL;
    IF v_live_units > 0 THEN
      v_books_skipped := v_books_skipped + 1;
    ELSE
      PERFORM delete_book_full(b.id);
      v_books := v_books + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'units', v_units,
    'books', v_books,
    'books_skipped', v_books_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION empty_trash() TO authenticated;
