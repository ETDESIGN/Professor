CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() ->> 'role'
    ) = required_role::text
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN AS $$
    SELECT public.is_role('teacher') OR public.is_role('admin')
$$ LANGUAGE sql STABLE;
