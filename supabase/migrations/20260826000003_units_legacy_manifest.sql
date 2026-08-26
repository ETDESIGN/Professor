-- =====================================================================
-- 20260826000003 — legacy manifest archive target (F P4.1)
--
-- rebuild-unit 'fresh' mode moves the pre-book-fidelity manifest here
-- before nulling it, so nothing is ever lost and the old content stays
-- inspectable (doc 10 §5 old-units decision).
-- =====================================================================

ALTER TABLE public.units
    ADD COLUMN IF NOT EXISTS legacy_manifest JSONB;
