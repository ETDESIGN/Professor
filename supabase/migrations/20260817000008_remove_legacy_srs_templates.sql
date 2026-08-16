-- =====================================================================
-- 20260817000008 — remove the legacy SM-2 template deck
-- ---------------------------------------------------------------------
-- Owner-approved cleanup (2026-08-17). The SM-2 word-template clone
-- (Engine.ensureStudentSRSItems) was removed in Phase 2; these template
-- rows (student_id NULL, objective_id NULL) are its leftover source deck.
-- Nothing reads them anymore — the FSRS engine is objective-based
-- (srs_items.objective_id NOT NULL, seeded by ensureStudentLearnerState).
-- Verified before deletion: 0 student-owned NULL-objective rows remained;
-- only the 84 orphan templates existed.

DELETE FROM public.srs_items
 WHERE student_id IS NULL
   AND objective_id IS NULL;
