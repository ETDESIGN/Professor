-- Fix: is_role() function crashes when JWT claim is 'authenticated' (not in user_role enum)
-- Root cause: (auth.jwt() -> 'app_metadata' ->> 'role')::user_role fails with invalid enum value
-- Fix: query profiles table directly, avoid unsafe cast

CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role = required_role
    )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT public.is_role('teacher') OR public.is_role('admin')
$$ LANGUAGE sql STABLE SECURITY DEFINER;
