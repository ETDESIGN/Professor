import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { validateAndNormalizeFlow } from '../_shared/flowTypes.ts';
import { buildClassFlow, fetchWordImageMap } from '../_shared/classFlow.ts';

// FIXPLAN I-P4 — derive a class plan's flow from the unit flow template +
// the class's scoped content (doc 11 §4). Deterministic, no AI. Teacher-
// action-triggered only (#7): apply marks stale, this regenerates.
serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'generate-class-flow',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [{ field: 'classPlanId', required: true, type: 'string', minLength: 10 }],
  }, async (body, auth) => {
    const { classPlanId, sourcePlanId } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return { success: false, error: 'Service credentials not configured.' };
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: plan, error: planErr } = await sb
      .from('class_plans')
      .select('id, unit_id, title, scope, content_index, content_index_stale_at')
      .eq('id', classPlanId)
      .single();
    if (planErr || !plan) return { success: false, error: `Class plan not found: ${planErr?.message || classPlanId}` };

    const { data: unit, error: unitErr } = await sb
      .from('units').select('id, teacher_id, title, topic, manifest, flow')
      .eq('id', plan.unit_id)
      .single();
    if (unitErr || !unit) return { success: false, error: `Unit not found: ${unitErr?.message || plan.unit_id}` };
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) return { success: false, error: ownership.reason || 'You do not own this unit.' };

    // Refresh the content index first when stale (edit-then-regenerate).
    if (plan.content_index_stale_at || !plan.content_index) {
      const { error: rpcErr } = await sb.rpc('refresh_class_plan_scope', {
        p_unit_id: plan.unit_id,
        p_ids: [plan.id],
        p_caller: unit.teacher_id,
      });
      if (rpcErr) return { success: false, error: `Scope refresh failed: ${rpcErr.message}` };
      const { data: fresh } = await sb.from('class_plans').select('content_index').eq('id', plan.id).single();
      plan.content_index = fresh?.content_index ?? plan.content_index;
    }
    const idx = plan.content_index || {};
    const vocabIds: string[] = idx.vocab_ids || [];
    const grammarIds: string[] = idx.grammar_ids || [];
    const storyIds: string[] = idx.story_ids || [];
    const dialogueIds: string[] = idx.dialogue_ids || [];

    // Load the scoped content rows (order preserved from the index = teaching
    // order: page position, then structure order).
    const [vocabRes, grammarRes, storyRes, dialogueRes] = await Promise.all([
      vocabIds.length
        ? sb.from('vocabulary_items')
            .select('id, word, definition, example_sentence, image_url, phonetic, audio_url')
            .in('id', vocabIds)
        : Promise.resolve({ data: [] }),
      grammarIds.length
        ? sb.from('grammar_rules').select('id, rule, explanation, examples').in('id', grammarIds)
        : Promise.resolve({ data: [] }),
      storyIds.length
        ? sb.from('story_pages').select('id, text, speaker, speaker_override_name').in('id', storyIds)
        : Promise.resolve({ data: [] }),
      dialogueIds.length
        ? sb.from('dialogue_lines').select('id, speaker, speaker_override_name, text, translation').in('id', dialogueIds)
        : Promise.resolve({ data: [] }),
    ]);

    const byIdOrder = <T extends { id: string }>(rows: T[] | null, order: string[]): T[] => {
      const m = new Map<string, T>((rows || []).map((r: any) => [r.id, r]));
      return order.map((id) => m.get(id)).filter(Boolean) as T[];
    };

    const theme = unit.manifest?.meta?.theme || unit.topic || '';
    // WS4 freeze-time vocab-image resolution: vocabulary_items.image_url can
    // be NULL/placeholder while the teacher's word_images library already has
    // a real asset for the word — resolve so the class flow never freezes a
    // dicebear placeholder over an existing image.
    const wordImages = await fetchWordImageMap(
      sb,
      unit.teacher_id,
      (vocabRes.data || []).map((v: any) => String(v?.word || '')),
    );
    // UNIT PLANS (spec 2026-09-13): optional source plan — build the class
    // flow from THAT lesson plan's blocks (sliced by the class scope) instead
    // of the unit template. Falls back to the unit flow when the plan is
    // missing/empty so generation never dead-ends.
    let templateFlow: any[] = Array.isArray(unit.flow) ? unit.flow : [];
    if (sourcePlanId) {
      const { data: srcPlan } = await sb
        .from('unit_plans')
        .select('id, unit_id, flow')
        .eq('id', String(sourcePlanId))
        .maybeSingle();
      if (srcPlan && srcPlan.unit_id === plan.unit_id && Array.isArray(srcPlan.flow) && srcPlan.flow.length > 0) {
        templateFlow = srcPlan.flow;
      } else {
        console.warn('generate-class-flow: sourcePlanId ignored (missing/mismatched/empty) — unit flow used');
      }
    }
    const rawFlow = buildClassFlow(templateFlow, {
      title: plan.title,
      theme,
      vocab: byIdOrder(vocabRes.data as any[], vocabIds),
      grammar: byIdOrder(grammarRes.data as any[], grammarIds),
      story: byIdOrder(storyRes.data as any[], storyIds)
        .map((p: any) => ({ text: p.text, speaker: p.speaker || p.speaker_override_name })),
      dialogue: byIdOrder(dialogueRes.data as any[], dialogueIds)
        .map((l: any) => ({ speaker: l.speaker || l.speaker_override_name, text: l.text, translation: l.translation })),
      // CONTENT GROUPS (spec 2026-09-13): group-tagged blocks (per-series
      // waves, per-story stages, comics) drop when the class scope excludes
      // every member structure.
      includedStructureIds: Array.isArray(idx.structure_ids) ? idx.structure_ids.map(String) : undefined,
    }, wordImages);

    if (rawFlow.length === 0) {
      return { success: false, error: 'The flow template is empty — publish the unit (or the chosen plan) first, then generate the class flow.' };
    }

    // Same board contract as units.flow (supported types, intro first, …).
    const normalized = validateAndNormalizeFlow(rawFlow, plan.title);

    const { error: updErr } = await sb
      .from('class_plans')
      .update({
        flow: normalized.flow,
        flow_generated_at: new Date().toISOString(),
        content_index_stale_at: null,
      })
      .eq('id', plan.id);
    if (updErr) return { success: false, error: `Saving the class flow failed: ${updErr.message}` };

    return {
      success: true,
      classPlanId: plan.id,
      unitId: plan.unit_id,
      flow: normalized.flow,
      droppedBlocks: normalized.dropped,
      contentIndex: idx,
    };
  });
});
