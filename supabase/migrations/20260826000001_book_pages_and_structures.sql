-- =====================================================================
-- 20260826000001 — book-fidelity extraction: pages & structures (F P1.1)
--
-- Greenfield per-page persistence (fixes R7: pages previously existed
-- only inside units.scanned_assets JSONB — no identity, no
-- classification, no geometry).
--
--   * book_pages      — one row per scanned page image. Belongs to a
--     teacher and (optionally) a book; `unit_id` is the teacher's
--     page→unit ASSIGNMENT (doc 10 §5: printed unit labels are metadata
--     only, never authority; unassigning never deletes the page).
--   * page_structures — one row per detected structure on a page (doc 10
--     §7 contracts), with normalized bbox geometry for the P3 cropper,
--     verification flags from the deterministic pass, and the teacher's
--     review decisions (✕ removed / ➕ teacher-added / edited).
--
-- units.scanned_assets is NOT touched — the legacy extract-page pipeline
-- keeps working unchanged until P4 rebuild.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.book_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    original_filename TEXT,
    pdf_page_number INTEGER,
    upload_order INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    -- Printed labels read from the page during scan. METADATA ONLY — the
    -- teacher's unit assignment is authoritative (doc 10 §5).
    printed_page_number TEXT,
    printed_unit_label TEXT,
    printed_title TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'scanning', 'scanned', 'reviewed', 'failed')),
    error TEXT,
    inventory JSONB,
    extractor_version TEXT,
    deskew_status TEXT NOT NULL DEFAULT 'none'
        CHECK (deskew_status IN ('none', 'applied', 'flagged', 'unsupported')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_book_pages_unit ON public.book_pages (unit_id);
CREATE INDEX IF NOT EXISTS idx_book_pages_teacher ON public.book_pages (teacher_id);
CREATE INDEX IF NOT EXISTS idx_book_pages_book ON public.book_pages (book_id);

CREATE TABLE IF NOT EXISTS public.page_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.book_pages(id) ON DELETE CASCADE,
    structure_type TEXT NOT NULL
        CHECK (structure_type IN (
            'vocab_set', 'comic', 'grammar_box', 'song_sheet',
            'reading_passage', 'printed_activity', 'review_statements',
            'mission_opener', 'character_appearance', 'clil_passage',
            'dialogue_sequence'
        )),
    order_index INTEGER NOT NULL DEFAULT 0,
    -- Normalized [x, y, w, h], origin top-left, values in [0, 1] relative
    -- to the FULL page image. Light shape check here; numeric validation
    -- lives in the scan-page verification pass.
    bbox JSONB
        CHECK (bbox IS NULL OR (jsonb_typeof(bbox) = 'array' AND jsonb_array_length(bbox) = 4)),
    confidence REAL,
    verification_flags TEXT[] NOT NULL DEFAULT '{}',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    set_label TEXT,
    grammar_tier TEXT CHECK (grammar_tier IN ('BOX', 'INFERRED')),
    review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'confirmed', 'removed', 'edited')),
    source TEXT NOT NULL DEFAULT 'ai'
        CHECK (source IN ('ai', 'teacher')),
    extractor_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_structures_page ON public.page_structures (page_id);
CREATE INDEX IF NOT EXISTS idx_page_structures_type ON public.page_structures (structure_type);

-- Keep updated_at current on edit (used by P2/P3 review + crop editing).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_page_structures_updated_at ON public.page_structures;
CREATE TRIGGER trg_page_structures_updated_at
    BEFORE UPDATE ON public.page_structures
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS — mirrors the content-table pattern (vocabulary_items et al.):
-- owner / teacher-admin read-write; enrolled students read pages of
-- Active units (needed later for comics/panels in the student app).
-- ---------------------------------------------------------------------
ALTER TABLE public.book_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_structures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_pages_select ON public.book_pages;
CREATE POLICY book_pages_select ON public.book_pages
    FOR SELECT USING (
        teacher_id = auth.uid()
        OR public.is_teacher_or_admin()
        OR EXISTS (
            SELECT 1 FROM public.units u
            WHERE u.id = book_pages.unit_id
              AND u.status = 'Active'
              AND u.deleted_at IS NULL
              AND u.teacher_id = ANY (public.student_class_teacher_ids())
        )
    );

DROP POLICY IF EXISTS book_pages_insert ON public.book_pages;
CREATE POLICY book_pages_insert ON public.book_pages
    FOR INSERT WITH CHECK (
        teacher_id = auth.uid() OR public.is_teacher_or_admin()
    );

DROP POLICY IF EXISTS book_pages_update ON public.book_pages;
CREATE POLICY book_pages_update ON public.book_pages
    FOR UPDATE USING (
        teacher_id = auth.uid() OR public.is_teacher_or_admin()
    );

DROP POLICY IF EXISTS book_pages_delete ON public.book_pages;
CREATE POLICY book_pages_delete ON public.book_pages
    FOR DELETE USING (
        teacher_id = auth.uid() OR public.is_teacher_or_admin()
    );

DROP POLICY IF EXISTS page_structures_select ON public.page_structures;
CREATE POLICY page_structures_select ON public.page_structures
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.book_pages bp
            WHERE bp.id = page_structures.page_id
              AND (
                  bp.teacher_id = auth.uid()
                  OR public.is_teacher_or_admin()
                  OR EXISTS (
                      SELECT 1 FROM public.units u
                      WHERE u.id = bp.unit_id
                        AND u.status = 'Active'
                        AND u.deleted_at IS NULL
                        AND u.teacher_id = ANY (public.student_class_teacher_ids())
                  )
              )
        )
    );

DROP POLICY IF EXISTS page_structures_insert ON public.page_structures;
CREATE POLICY page_structures_insert ON public.page_structures
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.book_pages bp
            WHERE bp.id = page_structures.page_id
              AND (bp.teacher_id = auth.uid() OR public.is_teacher_or_admin())
        )
    );

DROP POLICY IF EXISTS page_structures_update ON public.page_structures;
CREATE POLICY page_structures_update ON public.page_structures
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.book_pages bp
            WHERE bp.id = page_structures.page_id
              AND (bp.teacher_id = auth.uid() OR public.is_teacher_or_admin())
        )
    );

DROP POLICY IF EXISTS page_structures_delete ON public.page_structures;
CREATE POLICY page_structures_delete ON public.page_structures
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.book_pages bp
            WHERE bp.id = page_structures.page_id
              AND (bp.teacher_id = auth.uid() OR public.is_teacher_or_admin())
        )
    );
