import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';

// FIXPLAN_F P4.2 — rebuild legacy units from their stored page images.
//
// A unit's scanned_assets[] URLs are re-scanned through scan-page into
// book_pages/page_structures (the book-fidelity pipeline), then the batch is
// confirmed so the teacher's next Studio visit enriches from baskets.
//
// Resumable by construction: per invocation it scans up to a wall-clock
// budget of pages, then re-triggers itself via EdgeRuntime.waitUntil
// (orchestrate-lesson's fire-and-forget pattern). Progress state IS the
// database — pages already scanned are skipped, so a killed invocation just
// continues on the next trigger.
//
// Modes (doc 10 §5):
//   fresh    — old manifest archived to units.legacy_manifest, then nulled;
//              enrichment rebuilds everything from the baskets.
//   preserve — manifest kept; natural-key idempotency (unit_id,word /
//              unit_id,rule) preserves already-enriched content.
//
// NULL-owner legacy units are claimed by the calling teacher (Bug B1
// remediation — the strict ownership guard would otherwise reject them
// forever).

const PAGE_TIME_BUDGET_MS = 100_000; // per invocation, leave headroom for the chain

serve(async (req) => {
  return serveEdgeFunction(req, {
    name: 'rebuild-unit',
    requireAuth: true,
    rateLimit: { maxRequests: 5, windowMs: 60 * 1000 },
    validationRules: [
      { field: 'unitId', required: true, type: 'string', minLength: 10 },
      { field: 'mode', required: false, type: 'string' },
      {
        custom: (_v: any, body: any) => {
          if (body.mode && !['fresh', 'preserve'].includes(body.mode)) {
            return 'mode must be "fresh" or "preserve"';
          }
          return null;
        },
      },
    ],
  }, async (body, auth) => {
    const { unitId, mode = 'fresh' } = body;
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return { success: false, error: 'Service credentials not configured.' };
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: unit, error: unitErr } = await sb
      .from('units')
      .select('id, teacher_id, title, manifest, scanned_assets')
      .eq('id', unitId)
      .single();
    if (unitErr || !unit) return { success: false, error: 'Unit not found.' };

    // Claim NULL-owner legacy units (the rebuild IS the teacher adopting it).
    let ownerId = unit.teacher_id;
    if (!ownerId) {
      if (!auth?.userId) return { success: false, error: 'Authentication required.' };
      const { error: claimErr } = await sb.from('units').update({ teacher_id: auth.userId }).eq('id', unitId).eq('teacher_id', null as any);
      if (claimErr) return { success: false, error: `Could not claim the unit: ${claimErr.message}` };
      ownerId = auth.userId;
    }
    const ownership = assertUnitOwnership(ownerId, { callerId: auth?.userId, callerRole: auth?.role });
    if (!ownership.ok) return { success: false, error: ownership.reason || 'You do not own this unit.' };

    const assets: any[] = Array.isArray(unit.scanned_assets) ? unit.scanned_assets : [];
    const sources = assets
      .map((a, i) => ({ url: String(a?.url || ''), order: i }))
      .filter((s) => s.url.length > 10);
    if (sources.length === 0) {
      return { success: false, error: 'This unit has no stored page images to rebuild from.' };
    }

    // Job row (resumable, observable).
    const markJob = async (status: string, error?: string) => {
      await sb.from('generation_jobs').upsert({
        unit_id: unitId, stage: 'rebuild-unit', status, error: error || null,
        started_at: status === 'running' ? new Date().toISOString() : undefined,
        completed_at: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : undefined,
      }, { onConflict: 'unit_id,stage' }).then(() => undefined, () => undefined);
    };

    // Already-scanned pages are the resume state.
    const { data: donePages } = await sb.from('book_pages').select('public_url').eq('unit_id', unitId);
    const doneUrls = new Set((donePages || []).map((p: any) => p.public_url));
    const remaining = sources.filter((s) => !doneUrls.has(s.url));

    if (remaining.length > 0) {
      await markJob('running');
      const started = Date.now();
      const authHeader = req.headers.get('Authorization') || '';
      let processed = 0;
      let lastError = '';
      for (const src of remaining) {
        if (Date.now() - started > PAGE_TIME_BUDGET_MS) break;
        try {
          const resp = await fetch(`${supabaseUrl}/functions/v1/scan-page`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json', apikey: serviceKey },
            body: JSON.stringify({ unitId, fileUrl: src.url, filename: `rebuild-${src.order}.jpg`, uploadOrder: src.order }),
            signal: AbortSignal.timeout(90_000),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data?.success === false) {
            lastError = data?.error || `scan-page HTTP ${resp.status}`;
            console.warn(`rebuild-unit: page ${src.order} failed: ${lastError} (continuing)`);
          }
        } catch (e: any) {
          lastError = e?.message || String(e);
        }
        processed++;
      }

      const { data: after } = await sb.from('book_pages').select('public_url').eq('unit_id', unitId);
      const done = (after || []).length;
      if (done < sources.length) {
        // Chain the next batch — waitUntil keeps the isolate alive past the
        // response, mirroring orchestrate-lesson's trigger.
        const cont = fetch(`${supabaseUrl}/functions/v1/rebuild-unit`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json', apikey: serviceKey },
          body: JSON.stringify({ unitId, mode }),
        }).then((r) => r.json().catch(() => ({})), (e) => console.warn('rebuild-unit chain failed:', e?.message || e));
        // @ts-ignore EdgeRuntime is global in Supabase edge functions
        EdgeRuntime.waitUntil(cont);
        return { success: true, unitId, status: 'running', pages: done, total: sources.length, processed, note: 'Rebuild continuing…' };
      }
      void processed; void lastError;
    }

    // All pages scanned → confirm the batch + finish.
    const { data: finalPages } = await sb.from('book_pages').select('id').eq('unit_id', unitId);
    const pageIds = (finalPages || []).map((p: any) => p.id);
    if (pageIds.length > 0) {
      await sb.from('page_structures').update({ review_status: 'confirmed' })
        .in('page_id', pageIds).in('review_status', ['pending', 'edited'])
        .then(() => undefined, () => undefined);
      await sb.from('book_pages').update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('unit_id', unitId).eq('status', 'scanned').then(() => undefined, () => undefined);
    }
    const unitUpdate: Record<string, any> = { baskets_confirmed_at: new Date().toISOString() };
    if (mode === 'fresh' && unit.manifest) {
      unitUpdate.legacy_manifest = unit.manifest;
      unitUpdate.manifest = null;
    }
    await sb.from('units').update(unitUpdate).eq('id', unitId);
    await markJob('succeeded');

    return {
      success: true,
      unitId,
      status: 'succeeded',
      mode,
      pages: pageIds.length,
      note: mode === 'fresh'
        ? 'Rebuilt from pages. The old manifest was archived (units.legacy_manifest); open the unit to re-enrich from baskets.'
        : 'Rebuilt from pages (existing enrichment preserved by natural-key matching). Open the unit to top up enrichment from baskets.',
    };
  });
});
