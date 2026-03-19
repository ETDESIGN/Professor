-- ============================================
-- Task 1: Profiles Table & Role Mapping
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'student', 'parent');
    END IF;
END $$;

-- Create profiles table linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    role user_role DEFAULT 'student',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ============================================
-- Task 2: Trigger for Auto Profile Creation
-- ============================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        COALESCE(NEW.raw_user_meta_data->>'role', 'student')::user_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Task 3: Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Profiles: Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Profiles: Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- RLS for student_progress
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

-- Students can read their own progress
CREATE POLICY "Students can view own progress"
    ON public.student_progress FOR SELECT
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- Students can update their own progress
CREATE POLICY "Students can update own progress"
    ON public.student_progress FOR UPDATE
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- Teachers/Admins can insert student progress
CREATE POLICY "Teachers can insert student progress"
    ON public.student_progress FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- RLS for students table
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read students
CREATE POLICY "Authenticated users can view students"
    ON public.students FOR SELECT
    USING (auth.role() = 'authenticated');

-- Teachers/Admins can modify students
CREATE POLICY "Teachers can manage students"
    ON public.students FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- RLS for srs_items
ALTER TABLE public.srs_items ENABLE ROW LEVEL SECURITY;

-- Students can only see their own SRS items
CREATE POLICY "Students can view own SRS items"
    ON public.srs_items FOR SELECT
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- Students can CRUD their own SRS items
CREATE POLICY "Students can manage own SRS items"
    ON public.srs_items FOR ALL
    USING (
        student_id = auth.uid()::text
        OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- RLS for units table
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view units
CREATE POLICY "Authenticated users can view units"
    ON public.units FOR SELECT
    USING (auth.role() = 'authenticated');

-- Teachers/Admins can manage units
CREATE POLICY "Teachers can manage units"
    ON public.units FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin', 'teacher')
        )
    );

-- ============================================
-- Create helper function for role checking
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant necessary permissions
GRANT ALL ON public.profiles TO authenticated, anon, service_role;
GRANT ALL ON public.student_progress TO authenticated, anon, service_role;
GRANT ALL ON public.students TO authenticated, anon, service_role;
GRANT ALL ON public.srs_items TO authenticated, anon, service_role;
GRANT ALL ON public.units TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role TO authenticated;
