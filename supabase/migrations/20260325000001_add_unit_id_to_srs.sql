-- Migration: Add unit_id to srs_items
-- Created: 2026-03-25
-- Description: AI generated flashcards need to be linked to the unit.

ALTER TABLE public.srs_items
ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE;

-- Allow null student_id if it's just a generated flashcard template for the unit?
-- Or we just set student_id to some default or let it be null.
ALTER TABLE public.srs_items ALTER COLUMN student_id DROP NOT NULL;
