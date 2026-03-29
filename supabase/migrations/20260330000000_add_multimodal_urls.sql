-- Migration: Add multi-modal URLs to units
-- Created: 2026-03-30

ALTER TABLE public.units
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;
