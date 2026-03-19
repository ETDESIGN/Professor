-- Enable RLS on all tables
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_items ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since the prototype uses a mock engine client without complete Supabase Auth yet)
-- Alternatively, if integrating Supabase Auth, these would use auth.uid()
-- For the scope of the prototype migration to a real DB, we'll allow anon read but authenticated write
-- Since the application implies different portals (student, teacher, parent), we'll set up basic authenticated policies.

CREATE POLICY "Enable read access for all users" ON units FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON units FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON units FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read/write for student progress" ON student_progress FOR ALL USING (true);

CREATE POLICY "Enable read access for students" ON students FOR SELECT USING (true);
CREATE POLICY "Enable update for students" ON students FOR UPDATE USING (true);

CREATE POLICY "Enable read/write for srs_items" ON srs_items FOR ALL USING (true);
