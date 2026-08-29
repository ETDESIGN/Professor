import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { proposeClasses, defaultClassCount, type ClassPageInput } from '../_shared/classPlans.ts';

// FIXPLAN I-P2 — deterministic class-split proposal (doc 11 §4). Read-only:
// suggests N balanced classes from lesson signals (set-label changes, song
// sheets, openers, review pages). No AI, no writes; the teacher edits the
// proposal in the Classes tab and apply-class-plans persists it.
serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'propose-class-plans',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string', minLength: 10 },
      { field: 'targetCount', required: false, type: 'number' },
    ],
  }, async (body, auth) => {
    const { unitId, targetCount } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return { success: false, error: 'Service credentials not configured.' };
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: unit, error: unitErr } = await sb
      .from('units').select('id, teacher_id, title, book_id').eq('id', unitId).single();
    if (unitErr || !unit) return { success: false, error: 'Unit not found.' };
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) return { success: false, error: ownership.reason || 'You do not own this unit.' };

    const { data: pageRows, error: pagesErr } = await sb
      .from('book_pages')
      .select('id, upload_order, printed_page_number, page_structures(id, structure_type, set_label, review_status, data)')
      .eq('unit_id', unitId)
      .order('upload_order', { ascending: true });
    if (pagesErr) return { success: false, error: `Could not load pages: ${pagesErr.message}` };

    const pages: ClassPageInput[] = (pageRows || []).map((p: any) => {
      const structures = (p.page_structures || []).filter((s: any) => s.review_status !== 'removed');
      return {
        id: p.id,
        upload_order: p.upload_order,
        printed_page_number: p.printed_page_number,
        structures: structures.map((s: any) => ({
          structure_type: s.structure_type,
          set_label: s.set_label ?? s.data?.set_label ?? null,
          review_status: s.review_status,
          vocab_count: ['vocab_set', 'clil_passage', 'reading_passage'].includes(s.structure_type)
            ? (Array.isArray(s.data?.items)
              ? s.data.items.filter((i: any) => String(i?.word ?? '').trim() !== '').length
              : 0)
            : 0,
        })),
      };
    });

    // Per-page display info for the editor strip (printed number + labels +
    // structure counts, with ids so exception toggles can reference them).
    const pageInfo = (pageRows || []).map((p: any, idx: number) => {
      const structures = (p.page_structures || []).filter((s: any) => s.review_status !== 'removed');
      const counts: Record<string, number> = {};
      for (const s of structures) counts[s.structure_type] = (counts[s.structure_type] || 0) + 1;
      return {
        id: p.id,
        upload_order: p.upload_order,
        printed_page_number: p.printed_page_number,
        set_labels: pages[idx].structures.filter((s: any) => s.set_label).map((s: any) => s.set_label),
        structure_counts: counts,
        structures: structures.map((s: any) => ({
          id: s.id,
          structure_type: s.structure_type,
          set_label: s.set_label ?? s.data?.set_label ?? null,
        })),
      };
    });

    const fallbackCount = defaultClassCount(pages);
    const count = Math.max(1, Math.min(6, Math.floor(Number(targetCount) || fallbackCount)));
    const proposals = proposeClasses(pages, count, unit.title);

    // Existing plans (the editor merges proposal vs saved state).
    const { data: existing } = await sb
      .from('class_plans')
      .select('id, order_index, title, scope, content_index, released_at, flow_generated_at, content_index_stale_at')
      .eq('unit_id', unitId)
      .order('order_index', { ascending: true });

    // Book-level setup pages (unit_id NULL) for the attach picker (#2).
    let setupPages: any[] = [];
    if (unit.book_id) {
      const { data: sp } = await sb
        .from('book_pages')
        .select('id, upload_order, printed_page_number, public_url')
        .is('unit_id', null)
        .eq('book_id', unit.book_id)
        .order('upload_order', { ascending: true });
      setupPages = sp || [];
    }

    // Unsourced enriched content (no page provenance) — the editor's
    // "Unassigned content" section.
    const [vocabU, grammarU, storyU, dialogueU] = await Promise.all([
      sb.from('vocabulary_items').select('id, word, set_label').eq('unit_id', unitId).is('source_structure_id', null),
      sb.from('grammar_rules').select('id, rule').eq('unit_id', unitId).is('source_structure_id', null),
      sb.from('story_pages').select('id, page_number').eq('unit_id', unitId).is('source_structure_id', null),
      sb.from('dialogue_lines').select('id, order_index, text').eq('unit_id', unitId).is('source_structure_id', null),
    ]);

    return {
      success: true,
      unitId,
      unitTitle: unit.title,
      targetCount: count,
      defaultCount: fallbackCount,
      proposals,
      pages: pageInfo,
      setupPages,
      existingPlans: existing || [],
      unassigned: {
        vocab: vocabU.data || [],
        grammar: grammarU.data || [],
        story: storyU.data || [],
        dialogue: dialogueU.data || [],
      },
    };
  });
});
