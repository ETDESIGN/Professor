-- Supabase Schema Definition

-- Table: units
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE student_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT NOT NULL UNIQUE, -- For simplicity, assuming a single student for now or using a generic ID
  completed_unit_ids TEXT[] DEFAULT '{}',
  current_unit_id TEXT,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0
);

-- Insert initial mock data for student progress
INSERT INTO student_progress (student_id, completed_unit_ids, current_unit_id, xp, streak)
VALUES ('default_student', ARRAY['u0'], 'u1', 1250, 12);

-- Table: students
CREATE TABLE students (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  avatar TEXT,
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  team TEXT
);

-- Insert mock students
INSERT INTO students (id, name, avatar, points, level, team) VALUES
  ('s1', 'Leo', '🦁', 1250, 5, 'red'),
  ('s2', 'Mia', '🐱', 980, 4, 'blue'),
  ('s3', 'Sam', '🐶', 1420, 6, 'red'),
  ('s4', 'Zoe', '🐰', 850, 3, 'blue'),
  ('s5', 'Max', '🦊', 1100, 4, 'red'),
  ('s6', 'Lily', '🐼', 1300, 5, 'blue');

-- Table: srs_items
CREATE TABLE srs_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT NOT NULL,
  word TEXT NOT NULL,
  translation TEXT,
  interval INTEGER DEFAULT 0,
  repetition INTEGER DEFAULT 0,
  efactor REAL DEFAULT 2.5,
  next_review TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert mock SRS items
INSERT INTO srs_items (student_id, word, translation, interval, repetition, efactor, next_review) VALUES
  ('default_student', 'Apple', 'Manzana', 1, 1, 2.5, NOW() - INTERVAL '1 day'),
  ('default_student', 'Dog', 'Perro', 6, 2, 2.6, NOW() - INTERVAL '2 days'),
  ('default_student', 'Cat', 'Gato', 0, 0, 2.5, NOW());

-- Note: You will need to run this SQL in your Supabase SQL Editor to create the tables.
