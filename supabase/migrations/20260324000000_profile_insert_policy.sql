-- Migration: Allow users to insert their own profile
-- This enables the "Self-Healing" fallback in the frontend
-- when the Postgres trigger fails to create a profile on signup

-- Add INSERT policy for profiles table
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Add comment for documentation
COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS 
'Allows authenticated users to insert their own profile row. This enables the self-healing fallback in the frontend when the database trigger fails to create a profile on signup.';
