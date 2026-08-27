-- 20260828000001_illustration_v2.sql — Illustration System v2 (spec 2026-08-28)
-- 1. Per-unit art direction line (palette + motifs) used by the style brain.
alter table public.units add column if not exists art_direction text;

-- 2. Which model produced an image (model-aware dedup/regeneration later).
alter table public.assets add column if not exists model text;

-- 3. get_unit_bundle: resolve character portraits (reference_image_asset_id → image_url),
--    mirroring the existing story_pages audio/image resolution.
create or replace function public.get_unit_bundle(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_teacher uuid;
  v_status  text;
  v_bundle  jsonb;
begin
  select u.teacher_id, u.status into v_teacher, v_status from public.units u where u.id = p_unit_id;
  if not found then raise exception 'Unit not found'; end if;

  if v_teacher is not null and v_teacher is distinct from auth.uid() and not public.is_teacher_or_admin() then
    if not (public.is_role('student') and v_status = 'Active' and v_teacher = any(public.student_class_teacher_ids())) then
      raise exception 'Not authorized to read this unit';
    end if;
  end if;

  select jsonb_build_object(
    'unit_id',       p_unit_id,
    'objectives',    coalesce((select jsonb_agg(to_jsonb(o))  from public.objectives o  where o.unit_id  = p_unit_id), '[]'::jsonb),
    'pool_items',    coalesce((select jsonb_agg(to_jsonb(pi)) from public.pool_items pi where pi.unit_id = p_unit_id), '[]'::jsonb),
    'vocabulary_items', coalesce((select jsonb_agg(to_jsonb(vi) order by vi.order_index) from public.vocabulary_items vi where vi.unit_id = p_unit_id), '[]'::jsonb),
    'story_pages',   coalesce((
        select jsonb_agg(
          to_jsonb(sp) || jsonb_build_object('image_url', ia.public_url, 'audio_url', sa.public_url)
          order by sp.page_number
        )
        from public.story_pages sp
        left join public.assets ia on ia.id = sp.image_asset_id
        left join public.assets sa on sa.id = sp.audio_asset_id
        where sp.unit_id = p_unit_id
      ), '[]'::jsonb),
    'story_questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.order_index) from public.story_comprehension_questions q where q.unit_id = p_unit_id), '[]'::jsonb),
    'dialogue_lines', coalesce((
        select jsonb_agg(to_jsonb(dl) || jsonb_build_object('audio_url', da.public_url) order by dl.order_index)
        from public.dialogue_lines dl
        left join public.assets da on da.id = dl.audio_asset_id
        where dl.unit_id = p_unit_id
      ), '[]'::jsonb),
    'grammar_rules', coalesce((select jsonb_agg(to_jsonb(gr) order by gr.order_index) from public.grammar_rules gr where gr.unit_id = p_unit_id), '[]'::jsonb),
    'characters',    coalesce((
        select jsonb_agg(to_jsonb(c) || jsonb_build_object('image_url', pa.public_url) order by c.created_at)
        from public.characters c
        join public.unit_characters uc on uc.character_id = c.id
        left join public.assets pa on pa.id = c.reference_image_asset_id
        where uc.unit_id = p_unit_id
      ), '[]'::jsonb)
  ) into v_bundle;

  return v_bundle;
end;
$function$;
