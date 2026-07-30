-- =====================================================================
-- Diagnostics — add duration_ms to llm_telemetry
-- ---------------------------------------------------------------------
-- Used to confirm/iterate on the enrich-unit vocab/grammar timeout issue:
-- records how long each enrichment call took so we can see whether the
-- large-output categories (vocabulary/grammar) exceed the upstream timeout.
-- =====================================================================

ALTER TABLE public.llm_telemetry ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
