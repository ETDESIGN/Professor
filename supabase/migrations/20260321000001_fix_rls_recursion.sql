-- ============================================
-- Fix Infinite Recursion in RLS Policies
-- ============================================

-- Drop ALL existing policies on profiles (the recursive ones)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON public.profiles;

-- Drop all policies on student_progress
DROP POLICY IF EXISTS "Students can view own progress" ON public.student_progress;
DROP POLICY IF EXISTS "Students can update own progress" ON public.student_progress;
DROP POLICY IF EXISTS "Teachers can insert student progress" ON public.student_progress;
DROP POLICY IF EXISTS "Teachers can update student progress" ON public.student_progress;

-- Drop all policies on students
DROP POLICY IF EXISTS "Authenticated users can view students" ON public.students;
DROP POLICY IF EXISTS "Teachers can manage students" ON public.students;

-- Drop all policies on srs_items
DROP POLICY IF EXISTS "Students can view own SRS items" ON public.srs_items;
DROP POLICY IF EXISTS "Students can manage own SRS items" ON public.srs_items;

-- Drop all policies on units
DROP POLICY IF EXISTS "Authenticated users can view units" ON public.units;
DROP POLICY IF EXISTS "Teachers can manage units" ON public.units;

-- Drop the recursive get_user_role function if exists
DROP FUNCTION IF EXISTS public.get_user_role();

-- ============================================
-- Create SAFE Policies (no recursion)
-- ============================================

-- Profiles: Anyone authenticated can read profiles
CREATE POLICY "profiles_select_policy"
    ON public.profiles FOR SELECT
    USING (auth.role() = 'authenticated');

-- Profiles: Users can update their own profile
CREATE POLICY "profiles_update_own_policy"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- Student Progress: Safe policies without recursion
-- ============================================

CREATE POLICY "student_progress_select_policy"
    ON public.student_progress FOR SELECT
    USING (student_id = auth.uid()::text);

CREATE POLICY "student_progress_update_policy"
    ON public.student_progress FOR UPDATE
    USING (student_id = auth.uid()::text)
    WITH CHECK (student_id = auth.uid()::text);

CREATE POLICY "student_progress_insert_policy"
    ON public.student_progress FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- Students Table: Safe policies
-- ============================================

CREATE POLICY "students_select_policy"
    ON public.students FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "students_all_policy"
    ON public.students FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- SRS Items: Safe policies
-- ============================================

CREATE POLICY "srs_items_select_policy"
    ON public.srs_items FOR SELECT
    USING (student_id = auth.uid()::text);

CREATE POLICY "srs_items_all_policy"
    ON public.srs_items FOR ALL
    USING (student_id = auth.uid()::text)
    WITH CHECK (student_id = auth.uid()::text);

-- ============================================
-- Units Table: Safe policies
-- ============================================

CREATE POLICY "units_select_policy"
    ON public.units FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "units_all_policy"
    ON public.units FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- Classes & Enrollments: Safe policies
-- ============================================

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated users can view enrollments" ON public.class_enrollments;

CREATE POLICY "classes_select_policy"
    ON public.classes FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "enrollments_select_policy"
    ON public.class_enrollments FOR SELECT
    USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON public.profiles TO authenticated, anon, service_role;
GRANT ALL ON public.student_progress TO authenticated, anon, service_role;
GRANT ALL ON public.students TO authenticated, anon, service_role;
GRANT ALL ON public.srs_items TO authenticated, anon, service_role;
GRANT ALL ON public.units TO authenticated, anon, service_role;
GRANT ALL ON public.classes TO authenticated, anon, service_role;
GRANT ALL ON public.class_enrollments TO authenticated, anon, service_role;
