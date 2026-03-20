-- Add created_at column to units table if it doesn't exist
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
