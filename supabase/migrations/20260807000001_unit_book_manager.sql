-- 20260807000001_unit_book_manager.sql
-- Unit & Book Manager (docs/brainstorming/UNIT_BOOK_MANAGER_BRAINSTORM_AND_DECISIONS.md)
--
-- 1. Soft delete + ordering columns on units/books.
-- 2. book_grants table (schema-only foundation for the future sharing phase).
-- 3. RLS ownership fixes: units DELETE/UPDATE now require ownership (the old
--    is_teacher_or_admin() policies let ANY teacher delete/modify ANY unit);
--    books policies tightened to owner-or-admin; SELECT policies hide trashed rows.
-- 4. Status normalization ('published' -> 'Active').
-- 5. RPC delete_unit_full: permanent delete with content cascade while
--    PRESERVING history rows (classroom_sessions kept by nulling unit_id first;
--    assignments / class_session_occurrences / llm_telemetry / student_progress
--    are SET NULL by their FKs automatically).
-- 6. RPC delete_book_full: permanent book delete, only when no live units remain.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Schema additions
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE units ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE units ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- 2. book_grants (future sharing foundation — no UI yet)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user', 'school')),
  grantee_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('view', 'teach', 'edit', 'manage')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- One ACTIVE grant per (book, grantee).
CREATE UNIQUE INDEX IF NOT EXISTS book_grants_active_uniq
  ON book_grants (book_id, grantee_type, grantee_id)
  WHERE revoked_at IS NULL;

-- RLS helper: owner check without policy recursion.
CREATE OR REPLACE FUNCTION is_book_owner(p_book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM books b
    WHERE b.id = p_book_id
      AND (b.owner_id = auth.uid() OR is_role('admin'))
  );
$$;

ALTER TABLE book_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_grants_select_policy ON book_grants;
CREATE POLICY book_grants_select_policy ON book_grants
  FOR SELECT USING (is_book_owner(book_id));

DROP POLICY IF EXISTS book_grants_insert_policy ON book_grants;
CREATE POLICY book_grants_insert_policy ON book_grants
  FOR INSERT WITH CHECK (is_book_owner(book_id));

DROP POLICY IF EXISTS book_grants_update_policy ON book_grants;
CREATE POLICY book_grants_update_policy ON book_grants
  FOR UPDATE USING (is_book_owner(book_id)) WITH CHECK (is_book_owner(book_id));

DROP POLICY IF EXISTS book_grants_delete_policy ON book_grants;
CREATE POLICY book_grants_delete_policy ON book_grants
  FOR DELETE USING (is_book_owner(book_id));

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS ownership fixes
-- ─────────────────────────────────────────────────────────────────────
-- units: DELETE/UPDATE now scoped to the owner (or admin). SELECT keeps the
-- existing role logic but hides trashed rows from every reader.
DROP POLICY IF EXISTS units_delete_policy ON units;
CREATE POLICY units_delete_policy ON units
  FOR DELETE USING (teacher_id = auth.uid() OR is_role('admin'));

DROP POLICY IF EXISTS units_update_policy ON units;
CREATE POLICY units_update_policy ON units
  FOR UPDATE USING (teacher_id = auth.uid() OR is_role('admin'))
  WITH CHECK (teacher_id = auth.uid() OR is_role('admin'));

DROP POLICY IF EXISTS units_select_policy ON units;
CREATE POLICY units_select_policy ON units
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      is_role('admin')
      OR (is_role('teacher') AND (teacher_id = auth.uid() OR teacher_id IS NULL))
      OR (is_role('student') AND teacher_id = ANY (student_class_teacher_ids()))
    )
  );

-- books: owner-or-admin only (removes the is_teacher_or_admin() teacher leak).
-- owner_id IS NULL keeps the legacy catch-all book visible.
DROP POLICY IF EXISTS books_select_policy ON books;
CREATE POLICY books_select_policy ON books
  FOR SELECT USING (
    deleted_at IS NULL
    AND (owner_id = auth.uid() OR owner_id IS NULL OR is_role('admin'))
  );

DROP POLICY IF EXISTS books_insert_policy ON books;
CREATE POLICY books_insert_policy ON books
  FOR INSERT WITH CHECK (owner_id = auth.uid() OR is_role('admin'));

DROP POLICY IF EXISTS books_update_policy ON books;
CREATE POLICY books_update_policy ON books
  FOR UPDATE USING (owner_id = auth.uid() OR is_role('admin'))
  WITH CHECK (owner_id = auth.uid() OR is_role('admin'));

DROP POLICY IF EXISTS books_delete_policy ON books;
CREATE POLICY books_delete_policy ON books
  FOR DELETE USING (owner_id = auth.uid() OR is_role('admin'));

-- ─────────────────────────────────────────────────────────────────────
-- 4. Status normalization
-- ─────────────────────────────────────────────────────────────────────
UPDATE units SET status = 'Active' WHERE status = 'published';

-- ─────────────────────────────────────────────────────────────────────
-- 5. delete_unit_full — permanent unit delete with content cascade.
--    Content tables cascade via FKs on the final DELETE; history is preserved:
--      classroom_sessions  → unit_id nulled FIRST (its FK is CASCADE, so we
--                            null it explicitly to keep the session history)
--      assignments / class_session_occurrences / llm_telemetry /
--      student_progress    → SET NULL by their FKs automatically
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_unit_full(p_unit_id uuid)
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
    RAISE EXCEPTION 'not authorized to delete this unit';
  END IF;

  -- Preserve live-session history (FK would cascade otherwise).
  UPDATE classroom_sessions SET unit_id = NULL WHERE unit_id = p_unit_id;

  -- Content cascade (explicit order; FKs are CASCADE so this is belt & braces):
  DELETE FROM srs_items WHERE unit_id = p_unit_id;
  DELETE FROM pool_items WHERE unit_id = p_unit_id;
  DELETE FROM objectives WHERE unit_id = p_unit_id;
  DELETE FROM story_comprehension_questions WHERE unit_id = p_unit_id;
  DELETE FROM story_pages WHERE unit_id = p_unit_id;
  DELETE FROM dialogue_lines WHERE unit_id = p_unit_id;
  DELETE FROM vocabulary_items WHERE unit_id = p_unit_id;
  DELETE FROM grammar_rules WHERE unit_id = p_unit_id;
  DELETE FROM unit_characters WHERE unit_id = p_unit_id;
  DELETE FROM character_ledger WHERE unit_id = p_unit_id;
  DELETE FROM unit_media WHERE unit_id = p_unit_id;
  DELETE FROM content_review_status WHERE unit_id = p_unit_id;
  DELETE FROM generation_jobs WHERE unit_id = p_unit_id;
  DELETE FROM assets WHERE unit_id = p_unit_id;

  DELETE FROM units WHERE id = p_unit_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6. delete_book_full — permanent book delete. Refuses while the book
--    still contains live (non-trashed) units; trashed units are unlinked
--    (units.book_id → books is SET NULL anyway).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_book_full(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live_units integer;
BEGIN
  IF NOT is_book_owner(p_book_id) THEN
    RAISE EXCEPTION 'not authorized to delete this book';
  END IF;

  SELECT COUNT(*) INTO v_live_units
  FROM units
  WHERE book_id = p_book_id AND deleted_at IS NULL;

  IF v_live_units > 0 THEN
    RAISE EXCEPTION 'book still contains % unit(s) — move or delete them first', v_live_units;
  END IF;

  -- Unlink trashed units (they keep existing in the trash).
  UPDATE units SET book_id = NULL WHERE book_id = p_book_id;

  DELETE FROM books WHERE id = p_book_id;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_unit_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_book_full(uuid) TO authenticated;
