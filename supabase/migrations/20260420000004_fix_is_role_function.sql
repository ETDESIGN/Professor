-- Fix RLS infinite recursion on classes
-- Root cause: is_role() queried profiles table which has its own RLS creating a cycle
-- Fix: Read role directly from JWT claims WITHOUT casting to enum (avoids both recursion AND enum crash)

CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        (SELECT role::text FROM public.profiles WHERE id = auth.uid())
    ) = required_role::text
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT public.is_role('teacher') OR public.is_role('admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;
