-- 20260828130000_dubbing_parked_hardening.sql
-- The two items the video-dubbing SDD ledger parked as "FIX BEFORE ROLLOUT"
-- (final review, no Criticals; flag still off — VITE_ENABLE_DUBBING=false):
--
--   I1 — write-side line_audio path guard.
--        `dubbing_blob_visible` (20260828000003) grants read on any EXACT path
--        referenced by a dubbing row, and `dubbings_insert` let a student store
--        arbitrary paths in line_audio. 20260828000004 fixed the DELETE side
--        (dubbing_blob_parent_deletable checks the child's own folder); this is
--        the mirror on the write side: a student's line_audio may only reference
--        blobs inside their own 'dubs/<their-uid>/…' folder. Exploitability was
--        rated low (UUID paths + RLS-hidden ids) but the invariant is cheap.
--
--   I2 — publish single-row invariant, server-enforced.
--        "at most one PUBLISHED dub per (clip, student)" was client-only;
--        a partial unique index makes it structural.

-- I1: reject line_audio values outside the student's own dubs folder.
CREATE OR REPLACE FUNCTION public.dubbing_line_audio_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.line_audio IS NOT NULL AND NEW.line_audio <> '{}'::jsonb THEN
    PERFORM 1
    FROM jsonb_each(NEW.line_audio) e
    WHERE (e.value #>> '{}') IS NOT NULL
      AND (e.value #>> '{}') NOT LIKE 'dubs/' || NEW.student_id::text || '/%';
    IF FOUND THEN
      RAISE EXCEPTION 'line_audio may only reference paths under dubs/%/ (attempted write as student %)', NEW.student_id, NEW.student_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dubbing_line_audio_guard ON public.dubbings;
CREATE TRIGGER trg_dubbing_line_audio_guard
  BEFORE INSERT OR UPDATE ON public.dubbings
  FOR EACH ROW
  EXECUTE FUNCTION public.dubbing_line_audio_guard();

-- I2: one published dub per (clip, student) — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS dubbings_one_published_idx
  ON public.dubbings (clip_id, student_id)
  WHERE is_published;
