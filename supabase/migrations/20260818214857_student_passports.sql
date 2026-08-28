-- =====================================================================
-- 20260818214857 — student passports: teacher-minted student/parent accounts
--
-- Version provenance: this schema was applied directly on the CLOUD
-- database (dashboard / Management API) on 2026-08-18 under version
-- 20260818214857 and recorded there as name "student_passports". On disk
-- it was initially codified as 20260819000001_student_passports.sql,
-- which collided with 20260819000001_student_path_stages.sql (duplicate
-- local version breaks `supabase db push`), and the 20260818214857 slot
-- was wasted on a no-op reconcile marker. Renamed here 2026-08-28 so the
-- disk file carries the exact version + name the cloud already records:
-- cloud sees it as applied (never re-run), and fresh environments finally
-- execute the real SQL instead of a no-op.
--
-- Adds the "passport" model on top of the roster placeholder model:
--   * profiles.username        — login identifier for passport accounts
--     (login form resolves `username` -> `username@passport.local`, the
--     synthetic email the edge function registers in auth.users)
--   * passport_secrets         — single-row, service-role-only AES-GCM key
--     storage (the key never leaves the server context: DB <-> edge fn)
--   * student_passports        — one row per roster student that has
--     teacher-minted accounts. Credentials are stored encrypted
--     (WebCrypto AES-GCM by the student-passports edge function) so cards
--     can be reprinted; usernames are plain columns (they are printed on
--     the cards, not secrets).
--
-- Authority mirrors create_roster_student: admin / class teacher / active
-- school manager. Minting happens ONLY in the student-passports edge
-- function (service role); the client can just SELECT non-secret columns
-- (column-level grants keep credentials_encrypted service-role-only).
--
-- Idempotent, additive only — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) can_manage_class(p_class, p_user) — two-arg variant
-- The CLOUD database runs the explicit-user variant (admin / class teacher /
-- active school manager), but only the one-arg auth.uid() version from
-- 20260715000005 exists in migrations on disk. Codify the cloud definition
-- here so fresh `supabase db push` environments converge with production
-- (20260726000001 did the same for the roster/attendance RPCs).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_class(p_class uuid, p_user uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class AND c.teacher_id = p_user)
        OR EXISTS (SELECT 1 FROM public.classes c JOIN public.school_memberships sm ON sm.school_id = c.school_id
                   WHERE c.id = p_class AND c.school_id IS NOT NULL AND sm.user_id = p_user AND sm.role = 'manager' AND sm.status = 'active')
$$;

-- ---------------------------------------------------------------------
-- 1) profiles.username
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_username_lower;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_username_lower
    CHECK (username IS NULL OR username = lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
    ON public.profiles (lower(username))
    WHERE username IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) passport_secrets — locked single-row key store
--    The student-passports edge function bootstraps the key on first use.
--    No RLS policies + revoked grants => unreachable by anon/authenticated.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.passport_secrets (
    id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enc_key     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.passport_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.passport_secrets FROM anon, authenticated;
GRANT ALL ON public.passport_secrets TO service_role;

-- ---------------------------------------------------------------------
-- 3) student_passports
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_passports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id             UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id              UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    roster_student_id     UUID NOT NULL UNIQUE REFERENCES public.roster_students(id) ON DELETE CASCADE,
    student_user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    parent_user_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    student_username      TEXT,
    parent_username       TEXT,
    credentials_encrypted TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_by            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_printed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_passports_class       ON public.student_passports(class_id);
CREATE INDEX IF NOT EXISTS idx_student_passports_school      ON public.student_passports(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_passports_student_user ON public.student_passports(student_user_id) WHERE student_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_passports_parent_user  ON public.student_passports(parent_user_id) WHERE parent_user_id IS NOT NULL;

ALTER TABLE public.student_passports ENABLE ROW LEVEL SECURITY;

-- Default privileges grant ALL to anon/authenticated on new tables — pull those
-- back, then expose ONLY the non-secret columns to authenticated clients.
REVOKE ALL ON public.student_passports FROM anon, authenticated;
GRANT SELECT (
    id, school_id, class_id, teacher_id, roster_student_id,
    student_user_id, parent_user_id, student_username, parent_username,
    status, created_by, created_at, updated_at, last_printed_at
) ON public.student_passports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_passports TO service_role;

DROP POLICY IF EXISTS "student_passports_select_policy" ON public.student_passports;
CREATE POLICY "student_passports_select_policy"
    ON public.student_passports FOR SELECT TO authenticated
    USING ( public.can_manage_class(student_passports.class_id, auth.uid()) );
