-- =====================================================================
-- 20260715000002 — manager_role_helpers (REVISED per code review)
-- Hardens role resolution (no top-level jwt.role shadowing), locks the
-- user-writable profiles.role column, clamps self-signup roles, and adds
-- manager checks + an audit helper. Runs after 20260715000001 so 'manager'
-- is committed. Functions are SECURITY DEFINER (owned by postgres, bypass
-- RLS) => no recursion in policies that call them.
-- =====================================================================

-- Robust role name: prefer admin-set app_metadata.role, then profiles.role.
-- NOTE: the top-level JWT claim `auth.jwt() ->> 'role'` is intentionally NOT
-- used: it is always 'authenticated' for logged-in users and would shadow the
-- profiles.role fallback (review CRITICAL #1).
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        (SELECT role::text FROM public.profiles WHERE id = auth.uid())
    )
$$;

CREATE OR REPLACE FUNCTION public.is_role(required_role user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.current_role_name() = required_role::text
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$ SELECT public.is_role('manager') $$;

-- Keep is_teacher_or_admin() (managers get their own policies).
CREATE OR REPLACE FUNCTION public.is_teacher_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$ SELECT public.is_role('teacher') OR public.is_role('admin') $$;

-- Audit helper (used by the claim / approval RPCs).
CREATE OR REPLACE FUNCTION public.audit_action(
    p_action       TEXT,
    p_target_type  TEXT  DEFAULT NULL,
    p_target_id    TEXT  DEFAULT NULL,
    p_meta         JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
    VALUES (p_action, auth.uid(), p_target_type, p_target_id, p_meta);
EXCEPTION WHEN OTHERS THEN
    -- Audit must never break the caller.
    RAISE NOTICE 'audit_action failed: %', SQLERRM;
END;
$$;

-- =====================================================================
-- Review CRITICAL #2: profiles.role is user-writable (profiles_update_own
-- policy lets a user edit any column of their own row). Block role changes
-- unless the caller is an admin (or the service role, where auth.uid() NULL).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.guard_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT ( (SELECT public.is_role('admin')) OR auth.uid() IS NULL ) THEN
            RAISE EXCEPTION 'profiles.role can only be changed by an admin or the service role'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles;
CREATE TRIGGER trg_guard_profile_role
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role();

-- =====================================================================
-- Signup clamp: never let a self-signup claim 'admin'/'manager' via
-- user_metadata. Admin/service provisioning should set the role through
-- app_metadata (raw_app_meta_data), which is honored here.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    req_role TEXT;
BEGIN
    req_role := NEW.raw_app_meta_data->>'role';          -- admin-controlled
    IF req_role IS NULL THEN
        req_role := NEW.raw_user_meta_data->>'role';     -- self-signup
        IF req_role IN ('admin','manager') THEN
            req_role := 'student';                        -- privileged roles not self-claimable
        END IF;
    END IF;
    IF req_role IS NULL THEN
        req_role := 'student';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
        req_role::public.user_role
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Profile creation failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_role_name()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_role(user_role)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_or_admin()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_action(TEXT,TEXT,TEXT,JSONB) TO authenticated;
