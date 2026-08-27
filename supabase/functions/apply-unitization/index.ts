import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';

// FIXPLAN_G G2 — apply the teacher-edited unitization (doc 11 §2).
// Page REASSIGNMENT only — never re-extraction:
//   - each non-setup group → a new Draft unit (opener-derived title, same
//     book, order continuing the book) + UPDATE book_pages SET unit_id
//   - the setup group → book-level storage (unit_id NULL, book_id kept);
//     welcome material is recorded, never feeds units/pools (doc 10 §5)
//   - created units get baskets_confirmed_at (content was confirmed at the
//     extraction review) so enrich-on-open works immediately (decision #7:
//     enrichment NEVER starts here — only when the teacher opens a unit)
//   - the source unit is soft-deleted when it keeps no pages
// Every step is checked loudly — no swallowed failures (FIXPLAN_F lesson).
serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'apply-unitization',
    requireAuth: true,
    rateLimit: { maxRequests: 5, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string', minLength: 10 },
      { field: 'groups', required: true, type: 'array' },
      {
        custom: (_v: any, body: any) => {
          const gs = body.groups;
          if (!Array.isArray(gs) || gs.length === 0) return 'groups must be a non-empty array';
          for (const g of gs) {
            if (!g || !Array.isArray(g.pageIds)) return 'each group needs pageIds';
            if (!g.is_setup && !String(g.title || '').trim()) return 'each unit group needs a title';
          }
          return null;
        },
      },
    ],
  }, async (body, auth) => {
    const { unitId, groups } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return { success: false, error: 'Service credentials not configured.' };
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: unit, error: unitErr } = await sb
      .from('units').select('id, teacher_id, title, topic, level, book_id').eq('id', unitId).single();
    if (unitErr || !unit) return { success: false, error: 'Unit not found.' };
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) return { success: false, error: ownership.reason || 'You do not own this unit.' };

    const { data: sourcePages, error: pagesErr } = await sb
      .from('book_pages').select('id').eq('unit_id', unitId);
    if (pagesErr) return { success: false, error: `Could not load pages: ${pagesErr.message}` };
    const sourcePageIds = new Set((sourcePages || []).map((p: any) => p.id));

    // Validate: every assigned page belongs to the source unit; no page twice.
    const seen = new Set<string>();
    for (const g of groups) {
      for (const pid of g.pageIds) {
        if (!sourcePageIds.has(pid)) return { success: false, error: 'A group references a page that is not in this unit.' };
        if (seen.has(pid)) return { success: false, error: 'A page is assigned to more than one group.' };
        seen.add(pid);
      }
    }

    // order_index continues the book's sequence.
    let nextOrder = 0;
    if (unit.book_id) {
      const { count } = await sb.from('units').select('id', { count: 'exact', head: true }).eq('book_id', unit.book_id);
      nextOrder = count ?? 0;
    }

    const now = new Date().toISOString();
    const created: { id: string; title: string; pages: number }[] = [];
    for (const g of groups) {
      if (g.is_setup) {
        // Book-level storage: unit_id NULL keeps the pages out of every unit
        // and pool; book_id retains their book membership for the setup panel.
        const { error: setupErr } = await sb.from('book_pages')
          .update({ unit_id: null, book_id: unit.book_id })
          .in('id', g.pageIds);
        if (setupErr) {
          return { success: false, error: `Could not store setup pages: ${setupErr.message}`, created };
        }
        continue;
      }
      const { data: newUnit, error: createErr } = await sb.from('units').insert({
        title: String(g.title).trim().slice(0, 200),
        topic: unit.topic || 'Uploaded Material',
        level: unit.level || 'General',
        status: 'Draft',
        lessons: 1,
        flow: [],
        teacher_id: unit.teacher_id,
        book_id: unit.book_id,
        order_index: nextOrder++,
        scanned_assets: [],
        baskets_confirmed_at: now,
      }).select('id, title').single();
      if (createErr || !newUnit) {
        return { success: false, error: `Could not create unit "${g.title}": ${createErr?.message}`, created };
      }
      const { error: reassignErr } = await sb.from('book_pages')
        .update({ unit_id: newUnit.id, book_id: unit.book_id })
        .in('id', g.pageIds);
      if (reassignErr) {
        return { success: false, error: `Could not move pages into "${g.title}": ${reassignErr.message}`, created };
      }
      created.push({ id: newUnit.id, title: newUnit.title, pages: g.pageIds.length });
    }

    // Source unit: soft-delete when it kept nothing; untouched otherwise.
    const { count: remainingCount } = await sb.from('book_pages').select('id', { count: 'exact', head: true }).eq('unit_id', unitId);
    const sourceEmptied = (remainingCount ?? 0) === 0;
    if (sourceEmptied) {
      const { error: srcDelErr } = await sb.from('units').update({ deleted_at: now }).eq('id', unitId);
      if (srcDelErr) {
        console.error('apply-unitization: staging soft-delete failed:', srcDelErr.message);
        return { success: false, error: `Units created, but the staging unit could not be archived: ${srcDelErr.message}`, created };
      }
    }

    return {
      success: true,
      unitId,
      created,
      setupPages: (groups.find((g: any) => g.is_setup)?.pageIds || []).length,
      sourceEmptied,
      note: 'Units created as ready-to-enrich drafts. Open a unit\'s review to enrich it — nothing enriches automatically.',
    };
  });
});
