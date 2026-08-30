import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serveEdgeFunction } from '../_shared/edgeHandler.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertUnitOwnership } from '../_shared/assertOwnership.ts';
import { EXTRACTOR_VERSION } from '../_shared/bookScan.ts';

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
// Version-aware resume (doc 10 §5 extractor versioning, story fidelity):
// only pages scanned by the CURRENT extractor count as done. When the
// extraction contract is upgraded (e.g. scan-v6 → scan-v7's per-paragraph
// scene anchors), stale pages are deleted and re-scanned so their structures
// carry the new fields — teacher-added structures are preserved by
// re-parenting them onto the fresh page row after it settles.
//
// Modes (doc 10 §5):
//   fresh    — old manifest archived to units.legacy_manifest, then nulled;
//              enrichment rebuilds everything from the baskets.
//   preserve — manifest kept; natural-key idempotency (unit_id,word /
//              unit_id,rule) preserves already-enriched content.
//
// NULL-owner legacy units may be adopted-and-rebuilt only by an admin or
// manager (audit 2026-08-28 P0-1 — the strict ownership guard would
// otherwise reject them forever, but first-caller claiming let students
// steal units).

const PAGE_TIME_BUDGET_MS = 120_000; // per invocation, leave headroom for the chain

/**
 * Wait until a page's scan actually settles in the DB (status leaves
 * 'scanning'). ROOT-CAUSE FIX (audit 2026-08-26): a dense page's scan can
 * legitimately run ~150s (parallel chunks × model-fallback chains), which
 * OVERSHADOWS any fetch timeout we pick — so we never trust the fetch; the
 * database is the only source of truth for "this page is done".
 */
async function waitForPageSettled(sb: any, pageUrl: string, timeoutMs = 240_000): Promise<'scanned' | 'failed' | 'timeout'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data: row } = await sb.from('book_pages')
      .select('status').eq('public_url', pageUrl).order('created_at', { ascending: false }).limit(1)
      .maybeSingle();
    if (row && row.status !== 'scanning' && row.status !== 'pending') {
      return row.status as 'scanned' | 'failed';
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  return 'timeout';
}

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

    // NULL-owner legacy units: only admin/manager may adopt-and-rebuild.
    // (Audit 2026-08-28 P0-1: previously ANY authenticated caller could claim
    // the unit by being first to rebuild it — including student accounts.)
    let ownerId = unit.teacher_id;
    if (!ownerId) {
      const role = auth?.role;
      if (role !== 'admin' && role !== 'manager') {
        return { success: false, error: 'This unit has no owner. Ask an admin to rebuild it so it can be re-assigned.' };
      }
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

    // Already-scanned pages are the resume state — but only rows stamped with
    // the CURRENT extractor version count as done (version-aware resume).
    // Rows from older extractors are re-scanned: the upgraded contract (e.g.
    // scan-v7's per-paragraph scene anchors) must reach the owner's existing
    // units through the same "Rebuild from pages" button.
    const { data: donePages } = await sb.from('book_pages')
      .select('id, public_url, status, extractor_version')
      .eq('unit_id', unitId);
    const allPages = donePages || [];
    const doneUrls = new Set(allPages
      .filter((p: any) => p.extractor_version === EXTRACTOR_VERSION)
      .map((p: any) => p.public_url));
    const rowsByUrl = new Map<string, any[]>();
    for (const p of allPages) {
      const list = rowsByUrl.get(p.public_url) || [];
      list.push(p);
      rowsByUrl.set(p.public_url, list);
    }
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
          // Stale page rows must go BEFORE the re-scan: scan-page always
          // inserts a NEW row and the settle-poll keys on public_url, so a
          // leftover settled row would fake "done" instantly. Teacher-added
          // structures on a stale page are preserved and re-parented to the
          // fresh row after it settles (a rebuild replaces extraction, never
          // the teacher's own work).
          const staleRows = rowsByUrl.get(src.url) || [];
          let teacherStructures: any[] = [];
          for (const stale of staleRows) {
            try {
              const { data: tRows } = await sb.from('page_structures')
                .select('*').eq('page_id', stale.id).eq('source', 'teacher');
              for (const t of tRows || []) {
                teacherStructures.push({
                  structure_type: t.structure_type, order_index: t.order_index, bbox: t.bbox,
                  confidence: t.confidence, verification_flags: t.verification_flags, data: t.data,
                  set_label: t.set_label, grammar_tier: t.grammar_tier,
                  review_status: t.review_status, source: 'teacher',
                  extractor_version: t.extractor_version || 'teacher',
                });
              }
            } catch { /* preservation is best-effort */ }
            await sb.from('book_pages').delete().eq('id', stale.id)
              .then(() => undefined, () => undefined);
          }
          // Fire the scan; then wait for the DB to settle the page (the fetch
          // itself may abort long before a slow multi-chunk scan finishes —
          // audit 2026-08-26).
          fetch(`${supabaseUrl}/functions/v1/scan-page`, {
            method: 'POST',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json', apikey: serviceKey },
            body: JSON.stringify({ unitId, fileUrl: src.url, filename: `rebuild-${src.order}.jpg`, uploadOrder: src.order }),
          }).catch((e: any) => console.warn('rebuild-unit: scan fetch failed:', e?.message || e));
          const settled = await waitForPageSettled(sb, src.url);
          if (settled === 'timeout') {
            lastError = 'page scan did not settle in time — it will be retried on the next pass';
          } else if (settled === 'failed') {
            lastError = 'scan-page reported failure for this page (continuing)';
          }
          if (settled !== 'timeout' && teacherStructures.length > 0) {
            // Re-parent the teacher's structures onto the fresh page row.
            const { data: fresh } = await sb.from('book_pages').select('id')
              .eq('unit_id', unitId).eq('public_url', src.url)
              .order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (fresh?.id) {
              await sb.from('page_structures')
                .insert(teacherStructures.map((t) => ({ ...t, page_id: fresh.id })))
                .then(() => undefined, () => undefined);
            }
          }
        } catch (e: any) {
          lastError = e?.message || String(e);
        }
        processed++;
      }

      // Done-count counts only SETTLED pages (never 'scanning'/'pending').
      const { data: after } = await sb.from('book_pages').select('status').eq('unit_id', unitId);
      const settledCount = (after || []).filter((p: any) => p.status === 'scanned' || p.status === 'reviewed' || p.status === 'failed').length;
      const failedCount = (after || []).filter((p: any) => p.status === 'failed').length;
      if (settledCount < sources.length || failedCount > 0) {
        // Chain the next batch — waitUntil keeps the isolate alive past the
        // response, mirroring orchestrate-lesson's trigger.
        const cont = fetch(`${supabaseUrl}/functions/v1/rebuild-unit`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json', apikey: serviceKey },
          body: JSON.stringify({ unitId, mode }),
        }).then((r) => r.json().catch(() => ({})), (e) => console.warn('rebuild-unit chain failed:', e?.message || e));
        // @ts-ignore EdgeRuntime is global in Supabase edge functions
        EdgeRuntime.waitUntil(cont);
        return { success: true, unitId, status: 'running', pages: settledCount, total: sources.length, processed, note: 'Rebuild continuing…' };
      }
      void lastError;
    }

    // All pages scanned → confirm the batch + finish. Read-back verified:
    // the audit (2026-08-26) showed a silently half-finished rebuild
    // (structures stuck 'pending', baskets confirmed on nothing) must never
    // report success again.
    const { data: finalPages } = await sb.from('book_pages').select('id').eq('unit_id', unitId);
    const pageIds = (finalPages || []).map((p: any) => p.id);
    if (pageIds.length > 0) {
      const confirmStructures = async (): Promise<number> => {
        const { data: confirmedRows, error: confirmErr } = await sb.from('page_structures')
          .update({ review_status: 'confirmed' })
          .in('page_id', pageIds).in('review_status', ['pending', 'edited'])
          .select('id');
        if (confirmErr) throw new Error(`structure confirm failed: ${confirmErr.message}`);
        return (confirmedRows || []).length;
      };
      let confirmedCount = 0;
      try {
        confirmedCount = await confirmStructures();
        if (confirmedCount === 0) {
          // Retry once — a transient read-after-write miss is the known shape.
          await new Promise(r => setTimeout(r, 2000));
          confirmedCount = await confirmStructures();
        }
      } catch (e: any) {
        await markJob('failed', e?.message || 'structure confirm failed');
        return { success: false, unitId, error: `Rebuild could not confirm the extracted structures: ${e?.message || e}` };
      }
      const { error: pageErr } = await sb.from('book_pages')
        .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
        .eq('unit_id', unitId).in('status', ['scanned']);
      if (pageErr) {
        await markJob('failed', `page status update failed: ${pageErr.message}`);
        return { success: false, unitId, error: `Rebuild could not mark pages reviewed: ${pageErr.message}` };
      }
      console.log(`rebuild-unit: confirmed ${confirmedCount} structures across ${pageIds.length} pages`);
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
