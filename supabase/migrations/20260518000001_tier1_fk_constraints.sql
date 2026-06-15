-- Tier 1: Add missing foreign key constraints and fix type mismatches

-- Fix student_progress.current_unit_id: TEXT -> UUID with FK
ALTER TABLE public.student_progress
  ALTER COLUMN current_unit_id TYPE UUID USING current_unit_id::uuid,
  ALTER COLUMN current_unit_id DROP DEFAULT;

ALTER TABLE public.student_progress
  ADD CONSTRAINT fk_student_progress_current_unit
  FOREIGN KEY (current_unit_id) REFERENCES public.units(id) ON DELETE SET NULL;

-- Fix student_progress.completed_unit_ids: TEXT[] -> UUID[]
ALTER TABLE public.student_progress
  ALTER COLUMN completed_unit_ids TYPE UUID[] USING completed_unit_ids::uuid[];

-- Add FK from students to profiles
ALTER TABLE public.students
  ADD CONSTRAINT fk_students_profile
  FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Fix billing_history.profile_id: add NOT NULL
ALTER TABLE public.billing_history
  ALTER COLUMN profile_id SET NOT NULL;
