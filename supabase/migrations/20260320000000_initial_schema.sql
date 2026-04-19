-- Supabase Schema Definition

-- Table: units
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Draft', 'Locked', 'Completed', 'Processing')),
  lessons INTEGER DEFAULT 0,
  cover_image TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  flow JSONB DEFAULT '[]'::jsonb,
  scanned_assets JSONB DEFAULT '[]'::jsonb,
  manifest JSONB,
  topic TEXT
);

-- Table: student_progress
CREATE TABLE IF NOT EXISTS public.student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL UNIQUE,
  completed_unit_ids TEXT[] DEFAULT '{}',
  current_unit_id TEXT,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0
);

-- Table: students
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  avatar TEXT,
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  team TEXT
);

-- Table: srs_items
CREATE TABLE IF NOT EXISTS public.srs_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT NOT NULL,
  word TEXT NOT NULL,
  translation TEXT,
  interval INTEGER DEFAULT 0,
  repetition INTEGER DEFAULT 0,
  efactor REAL DEFAULT 2.5,
  next_review TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
