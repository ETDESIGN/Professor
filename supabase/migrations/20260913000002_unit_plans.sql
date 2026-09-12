-- 20260913000002_unit_plans.sql
-- Multiple named plans per unit (spec 2026-09-13
-- docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md):
-- a teacher splits one unit's content across lessons ("Lesson 1", "Lesson 2",
-- "Revision"). units.flow stays as the MIRROR of the default plan so every
-- existing consumer (orchestrate-lesson, generate-media patching, class-plan
-- sync, old sessions) keeps working unchanged.
create table public.unit_plans (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.units(id) on delete cascade,
  title      text not null default 'Lesson plan',
  flow       jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.unit_plans is 'Named lesson plans per unit (Lesson 1 / Lesson 2 / Revision). units.flow mirrors the default plan for legacy consumers.';

create index unit_plans_unit_idx on public.unit_plans(unit_id, order_index);

-- Exactly one default plan per unit.
create unique index unit_plans_one_default_per_unit
  on public.unit_plans(unit_id) where (is_default);

alter table public.unit_plans enable row level security;

drop policy if exists unit_plans_owner_select on public.unit_plans;
create policy unit_plans_owner_select on public.unit_plans
  for select to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_plans.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_plans_owner_insert on public.unit_plans;
create policy unit_plans_owner_insert on public.unit_plans
  for insert to authenticated
  with check (
    exists (select 1 from public.units u where u.id = unit_plans.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_plans_owner_update on public.unit_plans;
create policy unit_plans_owner_update on public.unit_plans
  for update to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_plans.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_plans_owner_delete on public.unit_plans;
create policy unit_plans_owner_delete on public.unit_plans
  for delete to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_plans.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

grant select, insert, update, delete on public.unit_plans to authenticated, service_role;

-- Seed: every unit gets exactly one default plan from its existing units.flow.
-- Invariant going forward: every unit has >= 1 plan; the default's flow is
-- write-through mirrored to units.flow by the clients that own it.
insert into public.unit_plans (unit_id, title, flow, order_index, is_default)
select u.id, 'Lesson plan', coalesce(u.flow, '[]'::jsonb), 0, true
from public.units u
where not exists (select 1 from public.unit_plans p where p.unit_id = u.id);

-- Live sessions remember which plan they launched (nullable: old sessions +
-- whole-unit launches have none).
alter table public.classroom_sessions
  add column if not exists plan_id uuid references public.unit_plans(id) on delete set null;

create index if not exists classroom_sessions_plan_idx on public.classroom_sessions(plan_id);
