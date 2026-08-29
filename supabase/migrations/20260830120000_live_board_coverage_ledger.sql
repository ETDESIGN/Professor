-- 20260830120000_live_board_coverage_ledger.sql
-- Live board whole-pool word rotation: persist which objectives have been
-- dealt to the board per (session, unit) so the sequential-deal rotation
-- survives page refreshes and is shared by commander/board/remote tabs via
-- the existing classroom_session_sync postgres_changes channel.
-- Element order inside the array is immaterial (consumed as a set).

alter table public.classroom_sessions
  add column if not exists dealt_objectives jsonb not null default '{}'::jsonb;

-- Union-merge objective ids into dealt_objectives[p_unit_id]. Idempotent:
-- concurrent tabs compute identical selections, so writes converge.
create or replace function public.merge_dealt_objectives(
  p_session_id uuid,
  p_unit_id uuid,
  p_objective_ids uuid[]
) returns void
language sql
security invoker
as $$
  update public.classroom_sessions cs
     set dealt_objectives = jsonb_set(
           cs.dealt_objectives,
           array[p_unit_id::text],
           (
             select coalesce(jsonb_agg(distinct_val), '[]'::jsonb)
             from (
               select distinct x as distinct_val
               from (
                 select jsonb_array_elements_text(
                          coalesce(cs.dealt_objectives -> p_unit_id::text, '[]'::jsonb)
                        ) as x
                 union
                 select unnest(p_objective_ids)::text as x
               ) merged
             ) deduped
           ),
           true
         ),
         updated_at = now()
   where cs.id = p_session_id
     and cs.teacher_id = auth.uid();
$$;

-- Remove a unit's dealt history (teacher restarts the unit's rotation).
create or replace function public.clear_dealt_objectives(
  p_session_id uuid,
  p_unit_id uuid
) returns void
language sql
security invoker
as $$
  update public.classroom_sessions cs
     set dealt_objectives = cs.dealt_objectives - p_unit_id::text,
         updated_at = now()
   where cs.id = p_session_id
     and cs.teacher_id = auth.uid();
$$;
