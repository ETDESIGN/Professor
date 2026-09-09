-- Wonder Atlas (2026-09-09): per-unit territory metadata for the student app
-- world-map framing. All nullable — units without metadata use the client-side
-- keyword fallback (apps/student/atlas/territory.ts).
alter table public.units
  add column if not exists theme text,
  add column if not exists tagline text,
  add column if not exists mascot_name text,
  add column if not exists mascot_emoji text;

comment on column public.units.theme is 'Wonder Atlas territory label (e.g. Safari, Ocean). NULL → client keyword fallback.';
comment on column public.units.mascot_emoji is 'Territory mascot glyph shown on banners/intro cards when mascot art is absent.';

-- Bookkeeping: applied + recorded 2026-09-09 via the Management API (curl
-- path). Kept here so this file is the durable record; idempotent on re-run.
insert into supabase_migrations.schema_migrations(version, name)
  values (20260909000001, 'unit_atlas_metadata')
  on conflict do nothing;
