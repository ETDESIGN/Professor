-- =====================================================================
-- 20260715000003 — schools_and_memberships (REVISED per code review)
-- Multi-tenant core. Fixes: school SELECT no longer public-exposes PII
-- (a minimal school_directory view is public instead); managers can only
-- invite PENDING teachers (not mint managers / pre-activate); membership
-- status transitions are enforced by a trigger; re-apply is idempotent.
-- =====================================================================

-- ---- 1. schools ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE,
    country       TEXT,
    city          TEXT,
    contact_email TEXT,
    owner_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schools_owner ON public.schools(owner_id);

-- ---- 2. membership status enum + memberships -----------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
        CREATE TYPE public.membership_status AS ENUM ('pending','active','rejected','revoked');
    END IF;
END $$;

-- NOTE: no table-level UNIQUE here (see partial unique index below). The
-- blanket UNIQUE is dropped on re-apply so rejected/revoked users can re-apply.
CREATE TABLE IF NOT EXISTS public.school_memberships (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role         user_role NOT NULL CHECK (role IN ('manager','teacher')),
    status       public.membership_status NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    title        TEXT
);

-- Idempotent constraint/index migration (safe on first apply AND re-apply).
ALTER TABLE public.school_memberships DROP CONSTRAINT IF EXISTS school_memberships_school_id_user_id_key;
DROP INDEX IF EXISTS uq_memberships_active;
-- At most one pending-or-active membership per (school, user). Terminal states
-- (rejected/revoked) are excluded, so a user may re-apply after rejection.
CREATE UNIQUE INDEX uq_memberships_active
    ON public.school_memberships(school_id, user_id) WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS idx_memberships_user   ON public.school_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_school ON public.school_memberships(school_id, status);

-- ---- 3. Helper functions (must precede the policies that use them) -
CREATE OR REPLACE FUNCTION public.my_managed_school_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(array_agg(school_id), ARRAY[]::uuid[])
    FROM public.school_memberships
    WHERE user_id = auth.uid() AND role = 'manager' AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT school_id
    FROM public.school_memberships
    WHERE user_id = auth.uid() AND role = 'manager' AND status = 'active'
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_school_manager(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (SELECT public.is_role('admin'))
        OR EXISTS (
            SELECT 1 FROM public.school_memberships
            WHERE school_id = school_uuid
              AND user_id = auth.uid()
              AND role = 'manager'
              AND status = 'active'
        )
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_in_school(school_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.school_memberships
        WHERE school_id = school_uuid
          AND user_id = auth.uid()
          AND role = 'teacher'
          AND status = 'active'
    )
$$;

-- ---- 4. Public school directory (minimal columns only; no PII) -----
DROP VIEW IF EXISTS public.school_directory;
CREATE OR REPLACE VIEW public.school_directory AS
    SELECT id, name, slug, country, city
    FROM public.schools
    WHERE is_active;
GRANT SELECT ON public.school_directory TO authenticated;

-- ---- 5. RLS --------------------------------------------------------
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;

-- schools: full row visible to admin, owner, the school's active members.
DROP POLICY IF EXISTS "schools_select_policy" ON public.schools;
CREATE POLICY "schools_select_policy"
    ON public.schools FOR SELECT TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR owner_id = auth.uid()
        OR public.is_school_manager(schools.id)
        OR EXISTS (SELECT 1 FROM public.school_memberships sm
                   WHERE sm.school_id = schools.id
                     AND sm.user_id = auth.uid() AND sm.status = 'active')
    );

DROP POLICY IF EXISTS "schools_insert_policy" ON public.schools;
CREATE POLICY "schools_insert_policy"
    ON public.schools FOR INSERT TO authenticated
    WITH CHECK ( (SELECT public.is_role('admin')) );

DROP POLICY IF EXISTS "schools_update_policy" ON public.schools;
CREATE POLICY "schools_update_policy"
    ON public.schools FOR UPDATE TO authenticated
    USING ( (SELECT public.is_role('admin')) OR public.is_school_manager(schools.id) )
    WITH CHECK ( (SELECT public.is_role('admin')) OR public.is_school_manager(schools.id) );

DROP POLICY IF EXISTS "schools_delete_policy" ON public.schools;
CREATE POLICY "schools_delete_policy"
    ON public.schools FOR DELETE TO authenticated
    USING ( (SELECT public.is_role('admin')) );

-- memberships: a user sees their own; a school manager sees all in their school; admin sees all.
DROP POLICY IF EXISTS "memberships_select_policy" ON public.school_memberships;
CREATE POLICY "memberships_select_policy"
    ON public.school_memberships FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id)
    );

-- Insert: admin any; manager may invite a PENDING teacher only (no manager
-- minting, no pre-activation); a user may self-request a pending teacher row.
DROP POLICY IF EXISTS "memberships_insert_policy" ON public.school_memberships;
CREATE POLICY "memberships_insert_policy"
    ON public.school_memberships FOR INSERT TO authenticated
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR (public.is_school_manager(school_memberships.school_id)
            AND role = 'teacher' AND status = 'pending')
        OR (user_id = auth.uid() AND role = 'teacher' AND status = 'pending')
    );

-- Approve / reject / revoke: manager of the school or admin. Status transitions
-- and role immutability are enforced by guard_membership_transition() below.
DROP POLICY IF EXISTS "memberships_update_policy" ON public.school_memberships;
CREATE POLICY "memberships_update_policy"
    ON public.school_memberships FOR UPDATE TO authenticated
    USING (
        (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id)
    )
    WITH CHECK (
        (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id)
    );

-- Delete: own pending (withdraw), manager of school, or admin.
DROP POLICY IF EXISTS "memberships_delete_policy" ON public.school_memberships;
CREATE POLICY "memberships_delete_policy"
    ON public.school_memberships FOR DELETE TO authenticated
    USING (
        (user_id = auth.uid() AND status = 'pending')
        OR (SELECT public.is_role('admin'))
        OR public.is_school_manager(school_memberships.school_id)
    );

-- ---- 6. Membership lifecycle guard ---------------------------------
-- pending -> active|rejected ; active -> revoked. Role is immutable except
-- for admin. Review metadata is stamped on any decision. (Admin bypasses.)
CREATE OR REPLACE FUNCTION public.guard_membership_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT (SELECT public.is_role('admin')) THEN
        RAISE EXCEPTION 'membership role cannot be changed' USING ERRCODE = '55006';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (SELECT public.is_role('admin')) THEN
        IF NOT ( (OLD.status = 'pending' AND NEW.status IN ('active','rejected'))
              OR (OLD.status = 'active'  AND NEW.status = 'revoked') ) THEN
            RAISE EXCEPTION 'invalid membership status transition % -> %',
                OLD.status, NEW.status USING ERRCODE = '55006';
        END IF;
        IF NEW.status IN ('active','rejected','revoked') THEN
            NEW.reviewed_at := now();
            IF NEW.reviewed_by IS NULL THEN
                NEW.reviewed_by := auth.uid();
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_membership_transition ON public.school_memberships;
CREATE TRIGGER trg_membership_transition
    BEFORE UPDATE ON public.school_memberships
    FOR EACH ROW EXECUTE FUNCTION public.guard_membership_transition();

-- ---- 7. Grants -----------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_memberships  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_managed_school_ids()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_school_id()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_manager(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_in_school(UUID)        TO authenticated;
GRANT USAGE ON TYPE public.membership_status                       TO authenticated;
