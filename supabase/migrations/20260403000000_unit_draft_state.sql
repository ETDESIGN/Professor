-- Migration: 20260403000000_unit_draft_state.sql
-- Add scanned_assets to hold the page-by-page extractions (vocab lists, comic dialogues)
-- while the unit is in the draft status in the Multi-Stage Workspace.

ALTER TABLE units ADD COLUMN IF NOT EXISTS scanned_assets JSONB DEFAULT '[]'::jsonb;
ALTER TABLE units ADD COLUMN IF NOT EXISTS draft_state JSONB DEFAULT '{}'::jsonb;
