import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';

// FIXPLAN I-P2 — apply the teacher-edited class plans (doc 11 §4).
// The payload is the FULL set of the unit's classes: plans absent from it
// are deleted (deleting a plan un-releases its content). Validate-then-
// write, loud failures, one atomic intent:
//   1. upsert every plan (title, order_index, scope, released_at)
//   2. delete plans not in the payload
//   3. refresh_class_plan_scope (content_index for every plan)
//   4. mark flows stale where the scope changed (regeneration stays a
//      teacher action — decision #7)
const SCOPE_KEYS = new Set([
  'ranges', 'include_page_ids', 'include_structure_ids', 'exclude_structure_ids',
  'include_vocab_ids', 'include_grammar_ids', 'include_story_ids', 'include_dialogue_ids',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidArray = (v: any): v is string[] =>
  Array.isArray(v) && v.every((x: any) => typeof x === 'string' && UUID_RE.test(x));

function validateScope(scope: any, unitPageIds: Set<string>): string | null {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return 'scope must be an object';
  for (const key of Object.keys(scope)) {
    if (!SCOPE_KEYS.has(key)) return `scope has an unknown key "${key}"`;
  }
  if (scope.ranges !== undefined) {
    if (!Array.isArray(scope.ranges) || scope.ranges.length === 0) return 'ranges must be a non-empty array';
    for (const r of scope.ranges) {
      if (!r || typeof r.from_page_id !== 'string' || typeof r.to_page_id !== 'string') {
        return 'each range needs from_page_id and to_page_id';
      }
      if (!unitPageIds.has(r.from_page_id) || !unitPageIds.has(r.to_page_id)) {
        return 'a range references a page outside this unit';
      }
    }
  } else {
    return 'scope.ranges is required';
  }
  for (const key of ['include_page_ids', 'include_structure_ids', 'exclude_structure_ids', 'include_vocab_ids', 'include_grammar_ids', 'include_story_ids', 'include_dialogue_ids']) {
    if (scope[key] !== undefined && !isUuidArray(scope[key])) return `${key} must be an array of uuids`;
  }
  return null;
}

const scopeSignature = (scope: any): string => JSON.stringify(scope);

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'apply-class-plans',
    requireAuth: true,
    rateLimit: { maxRequests: 5, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string', minLength: 10 },
      { field: 'classes', required: true, type: 'array' },
      {
        custom: (_v: any, body: any) => {
          const cs = body.classes;
          if (!Array.isArray(cs)) return 'classes must be an array';
          if (cs.length > 12) return 'too many classes (max 12)';
          for (const c of cs) {
            if (!c || typeof c !== 'object') return 'each class must be an object';
            if (!String(c.title || '').trim()) return 'each class needs a title';
            if (typeof c.scope !== 'object') return 'each class needs a scope';
          }
          return null;
        },
      },
    ],
  }, async (body, auth) => {
    const { unitId, classes } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) return { success: false, error: 'Service credentials not configured.' };
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: unit, error: unitErr } = await sb
      .from('units').select('id, teacher_id, title').eq('id', unitId).single();
    if (unitErr || !unit) return { success: false, error: 'Unit not found.' };
    const ownership = assertUnitOwnership(unit.teacher_id, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) return { success: false, error: ownership.reason || 'You do not own this unit.' };

    // ── Validate everything BEFORE writing (no partial applies). ─────────
    const { data: pageRows, error: pagesErr } = await sb.from('book_pages').select('id').eq('unit_id', unitId);
    if (pagesErr) return { success: false, error: `Could not load pages: ${pagesErr.message}` };
    const unitPageIds = new Set<string>((pageRows || []).map((p: any) => p.id));

    const { data: existingPlans, error: plansErr } = await sb
      .from('class_plans').select('id, scope, flow, flow_generated_at').eq('unit_id', unitId);
    if (plansErr) return { success: false, error: `Could not load plans: ${plansErr.message}` };
    const existingById = new Map<string, any>((existingPlans || []).map((p: any) => [p.id, p]));

    const seen = new Set<string>();
    for (const c of classes) {
      const scopeErr = validateScope(c.scope, unitPageIds);
      if (scopeErr) return { success: false, error: `Invalid scope for "${c.title}": ${scopeErr}` };
      if (c.id != null) {
        if (typeof c.id !== 'string' || !existingById.has(c.id)) {
          return { success: false, error: `"${c.title}" references a plan that does not belong to this unit.` };
        }
        if (seen.has(c.id)) return { success: false, error: 'A plan id appears twice in the payload.' };
        seen.add(c.id);
      }
    }

    // ── Write. ────────────────────────────────────────────────────────────
    const savedIds: string[] = [];
    for (let i = 0; i < classes.length; i++) {
      const c = classes[i];
      const row: Record<string, any> = {
        unit_id: unitId,
        teacher_id: unit.teacher_id,
        order_index: typeof c.order_index === 'number' ? c.order_index : i,
        title: String(c.title).trim().slice(0, 200),
        scope: c.scope,
        released_at: c.released_at ?? null,
      };
      const { data: saved, error: upErr } = c.id
        ? await sb.from('class_plans').update(row).eq('id', c.id).select('id').single()
        : await sb.from('class_plans').insert(row).select('id').single();
      if (upErr || !saved) return { success: false, error: `Saving "${c.title}" failed: ${upErr?.message || 'no row'}` };
      savedIds.push(saved.id);
    }

    // Delete plans absent from the payload.
    const toDelete = (existingPlans || []).map((p: any) => p.id).filter((id: string) => !savedIds.includes(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await sb.from('class_plans').delete().in('id', toDelete);
      if (delErr) return { success: false, error: `Deleting removed classes failed: ${delErr.message}` };
    }

    // Refresh every plan's content index (service-key path passes the
    // already-verified teacher as p_caller).
    let refresh: any = null;
    const { data: r, error: rpcErr } = await sb.rpc('refresh_class_plan_scope', {
      p_unit_id: unitId,
      p_ids: null,
      p_caller: unit.teacher_id,
    });
    if (rpcErr) return { success: false, error: `Scope refresh failed: ${rpcErr.message}` };
    refresh = r;

    // Mark flows stale where the scope changed (regeneration stays manual, #7).
    const { data: afterPlans } = await sb.from('class_plans')
      .select('id, scope, flow_generated_at').eq('unit_id', unitId);
    const staleIds: string[] = [];
    for (const p of (afterPlans || [])) {
      const before = existingById.get(p.id);
      const scopeChanged = !before || scopeSignature(before.scope) !== scopeSignature(p.scope);
      if (scopeChanged) staleIds.push(p.id);
    }
    if (staleIds.length > 0) {
      await sb.from('class_plans').update({ content_index_stale_at: new Date().toISOString() }).in('id', staleIds);
    }

    return {
      success: true,
      unitId,
      saved: savedIds.length,
      deleted: toDelete.length,
      staleFlows: staleIds.length,
      refresh,
    };
  });
});
