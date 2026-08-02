-- =====================================================================
-- 20260803000003 — Fix assets.owner_id FK: ON DELETE SET NULL
-- ---------------------------------------------------------------------
-- P1-10: assets.owner_id references auth.users(id) with no ON DELETE
-- clause (20260730000006_unit_media_and_assets.sql:82). Deleting a
-- teacher who owns assets raises an FK violation, blocking user deletion
-- via manage-school-members.
--
-- Fix: ON DELETE SET NULL — the asset is retained (vault soft-delete
-- model) but the owner link is cleared, allowing user deletion to proceed.
-- =====================================================================

ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_owner_id_fkey;
ALTER TABLE public.assets
    ADD CONSTRAINT assets_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
