import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { proposeGroups, type UnitizePageInput } from '../_shared/unitize.ts';

// FIXPLAN_G G2 — deterministic unitization proposal (doc 11 §2).
// Read-only: groups the unit's pages by scanned openers/labels. No AI, no
// writes; the teacher edits this proposal in the boundary editor and
// apply-unitization performs the reassignment.
serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'propose-unitization',
    requireAuth: true,
    rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
    validationRules: [{ field: 'unitId', required: true, type: 'string', minLength: 10 }],
  }, async (body, auth) => {
    const { unitId } = body;
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
      .select('id, upload_order, printed_page_number, printed_unit_label, printed_title, page_structures(structure_type, review_status, data)')
      .eq('unit_id', unitId)
      .order('upload_order', { ascending: true });
    if (pagesErr) return { success: false, error: `Could not load pages: ${pagesErr.message}` };

    const pages: (UnitizePageInput & { structureCounts: Record<string, number> })[] = (pageRows || []).map((p: any) => {
      const structures = (p.page_structures || []).filter((s: any) => s.review_status !== 'removed');
      const structureCounts: Record<string, number> = {};
      for (const s of structures) structureCounts[s.structure_type] = (structureCounts[s.structure_type] || 0) + 1;
      return {
        id: p.id,
        upload_order: p.upload_order,
        printed_page_number: p.printed_page_number,
        printed_unit_label: p.printed_unit_label,
        printed_title: p.printed_title,
        openers: structures
          .filter((s: any) => s.structure_type === 'mission_opener')
          .map((s: any) => ({ printed_unit_number: s.data?.printed_unit_number ?? null, printed_title: s.data?.printed_title ?? null })),
        structureCounts,
      };
    });

    const groups = proposeGroups(pages);
    return {
      success: true,
      unitId,
      sourceTitle: unit.title,
      groups,
      pages: pages.map(({ openers, ...rest }) => rest),
    };
  });
});
