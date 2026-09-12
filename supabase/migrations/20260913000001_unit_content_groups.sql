-- 20260913000001_unit_content_groups.sql
-- Content groups registry (spec 2026-09-13
-- docs/superpowers/specs/2026-09-13-content-groups-and-plan-library-design.md):
-- each vocab series / story / comic / book song of a unit becomes a
-- first-class, teacher-visible group. Seeded idempotently from confirmed
-- page_structures; titles are AI-derived at enrichment (title_source='ai')
-- and teacher renames ('teacher') are never overwritten by seeding.
create table public.unit_content_groups (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units(id) on delete cascade,
  kind         text not null check (kind in ('vocab_series','story','comic','song')),
  title        text not null default 'Untitled',
  title_source text not null default 'seed' check (title_source in ('seed','ai','teacher')),
  printed_label text,
  structure_ids uuid[] not null default '{}',
  order_index  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.unit_content_groups is 'Per-unit content groups (vocab series / story / comic / song). Seed-driven from page_structures; title_source guards rename stickiness.';

create index unit_content_groups_unit_idx on public.unit_content_groups(unit_id, kind, order_index);

alter table public.unit_content_groups enable row level security;

drop policy if exists unit_content_groups_owner_select on public.unit_content_groups;
create policy unit_content_groups_owner_select on public.unit_content_groups
  for select to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_content_groups.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_content_groups_owner_insert on public.unit_content_groups;
create policy unit_content_groups_owner_insert on public.unit_content_groups
  for insert to authenticated
  with check (
    exists (select 1 from public.units u where u.id = unit_content_groups.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_content_groups_owner_update on public.unit_content_groups;
create policy unit_content_groups_owner_update on public.unit_content_groups
  for update to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_content_groups.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

drop policy if exists unit_content_groups_owner_delete on public.unit_content_groups;
create policy unit_content_groups_owner_delete on public.unit_content_groups
  for delete to authenticated
  using (
    exists (select 1 from public.units u where u.id = unit_content_groups.unit_id and u.teacher_id = auth.uid())
    or (select public.is_teacher_or_admin())
  );

grant select, insert, update, delete on public.unit_content_groups to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- seed_unit_content_groups(p_unit_id)
-- Idempotent seeding from CONFIRMED/EDITED structures of the unit.
-- Heuristics (spec section 4.1):
--   vocab_series : vocab_set rows grouped by normalized set_label; untitled
--                  sets each get their own series.
--   story        : reading_passage/clil_passage rows grouped by normalized
--                  title; untitled passages attach to the nearest preceding
--                  titled passage (continuation pages).
--   comic/song   : one group per structure.
-- Teacher-titled groups are never renamed; groups referenced by units.flow
-- block data (data.group_id) are never deleted.
create or replace function public.seed_unit_content_groups(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  r record;
  v_group_id uuid;
begin
  create temp table _desired on commit drop as
  with confirmed as (
    select ps.id as structure_id,
           ps.structure_type,
           nullif(lower(btrim(coalesce(ps.set_label, ''))), '') as norm_label,
           nullif(lower(btrim(coalesce(ps.data->>'title', ''))), '') as norm_title,
           coalesce(nullif(ps.set_label, ''), nullif(ps.data->>'title', '')) as printed,
           bp.upload_order * 100 + ps.order_index as pos
    from page_structures ps
    join book_pages bp on bp.id = ps.page_id
    where bp.unit_id = p_unit_id
      and ps.review_status in ('confirmed','edited')
      and ps.structure_type in ('vocab_set','reading_passage','clil_passage','comic','song_sheet')
  ),
  vocab as (
    select 'vocab_series'::text as kind,
           case when norm_label is null then 'solo-' || structure_id::text else norm_label end as gkey,
           min(printed) as printed,
           array_agg(structure_id order by pos) as structure_ids,
           min(pos) as pos
    from confirmed
    where structure_type = 'vocab_set'
    group by 1, 2
  ),
  stories_keyed as (
    select c.*,
           coalesce(
             c.norm_title,
             (select max(p2.norm_title) from confirmed p2
              where p2.structure_type in ('reading_passage','clil_passage')
                and p2.norm_title is not null and p2.pos < c.pos)
           ) as story_key
    from confirmed c
    where c.structure_type in ('reading_passage','clil_passage')
  ),
  stories as (
    select 'story'::text as kind,
           coalesce(story_key, 'untitled-' || min(structure_id::text)) as gkey,
           min(printed) as printed,
           array_agg(structure_id order by pos) as structure_ids,
           min(pos) as pos
    from stories_keyed
    group by story_key
  ),
  singles as (
    select case st.structure_type when 'comic' then 'comic' else 'song' end as kind,
           'solo-' || st.structure_id::text as gkey,
           st.printed,
           array[st.structure_id] as structure_ids,
           st.pos
    from confirmed st
    where st.structure_type in ('comic','song_sheet')
  )
  select kind, gkey, printed, structure_ids, pos,
         row_number() over (partition by kind order by pos)::int as seq
  from (
    select * from vocab
    union all select * from stories
    union all select * from singles
  ) all_groups;

  -- drop seed/AI groups whose first structure disappeared (removed from
  -- review), unless a flow block still references them by group id.
  delete from unit_content_groups g
  where g.unit_id = p_unit_id
    and g.title_source in ('seed','ai')
    and not exists (
      select 1 from _desired d
      where d.kind = g.kind and d.structure_ids[1] = g.structure_ids[1]
    )
    and not exists (
      select 1 from units u
      where u.id = p_unit_id
        and u.flow::text like '%' || g.id::text || '%'
    );
  get diagnostics v_deleted = row_count;

  -- upsert desired groups, matched by (kind, first structure id)
  for r in select * from _desired order by pos loop
    select id into v_group_id
    from unit_content_groups g
    where g.unit_id = p_unit_id
      and g.kind = r.kind
      and g.structure_ids[1] = r.structure_ids[1]
    limit 1;

    if v_group_id is null then
      insert into unit_content_groups (unit_id, kind, title, title_source, printed_label, structure_ids, order_index)
      values (
        p_unit_id,
        r.kind,
        coalesce(r.printed,
          case r.kind
            when 'vocab_series' then 'Series ' || r.seq
            when 'story'        then 'Story '  || r.seq
            when 'comic'        then 'Comic '  || r.seq
            else 'Song ' || r.seq
          end),
        'seed',
        r.printed,
        r.structure_ids,
        r.pos
      );
      v_created := v_created + 1;
    else
      update unit_content_groups g
      set structure_ids = r.structure_ids,
          order_index = r.pos,
          printed_label = coalesce(r.printed, g.printed_label),
          title = case when g.title_source = 'seed' and r.printed is not null
                       then r.printed else g.title end,
          updated_at = now()
      where g.id = v_group_id
        and g.title_source in ('seed','ai');
      if found then v_updated := v_updated + 1; end if;
      v_group_id := null;
    end if;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'deleted', v_deleted,
    'groups', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select id, kind, title, title_source, printed_label, structure_ids, order_index
      from unit_content_groups where unit_id = p_unit_id order by order_index
    ) t)
  );
end;
$$;

grant execute on function public.seed_unit_content_groups(uuid) to authenticated, service_role;
