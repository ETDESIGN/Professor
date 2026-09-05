// scripts/media/backfill-media.ts — heal ALREADY-GENERATED units (media design
// §5): run the CATALOG rungs of the resolution ladder over every unit whose
// flow has an unresolved MEDIA_PLAYER block, patching only that block's data
// (never a re-orchestration). Mirrors illustration-backfill conventions.
//
// Catalog scoring runs locally against the seeded system catalog using the
// same pure core the edge uses (_shared/mediaResolverCore). The AI rung is
// deliberately NOT backfilled here — it needs per-teacher auth + spend and
// stays behind the teacher-triggered resolve-media action / vault button.
//
// Run with (Node >= 18):
//   SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   npx tsx scripts/media/backfill-media.ts              # dry-run (default)
//   ... npx tsx scripts/media/backfill-media.ts --unit <id>
//   ... npx tsx scripts/media/backfill-media.ts --yes    # apply
//
// Flags: [--unit <id>] [--limit N] [--yes]
// Idempotent: only touches MEDIA_PLAYER blocks without videoUrl/audioUrl.

import {
  ageBandFromGrade,
  scoreCatalogEntry,
  autoApplyAllowed,
  type AgeBand,
} from '../../supabase/functions/_shared/mediaResolverCore';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const apply = args.includes('--yes');
const onlyUnit = flag('--unit');
const limit = Number(flag('--limit')) || 500;
if (!apply) console.log('DRY-RUN (pass --yes to patch flows)\n');

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CatalogRow {
  id: string;
  title: string;
  channel: string;
  videoId: string;
  url: string;
  thumbnailUrl?: string;
  durationSec?: number | null;
  topics: string[];
  ageBands: AgeBand[];
}

async function loadCatalog(): Promise<CatalogRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/assets?select=id,prompt,source_url,tags,metadata&type=eq.video&kind=eq.external_url&unit_id=is.null&owner_id=is.null&is_deleted=eq.false&limit=2000`,
    { headers: restHeaders },
  );
  const rows = await res.json();
  const out: CatalogRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const meta = r.metadata || {};
    const videoId = String(meta.videoId || '');
    if (!videoId || !r.source_url) continue;
    out.push({
      id: r.id,
      title: String(meta.title || r.prompt || ''),
      channel: String(meta.channel || ''),
      videoId,
      url: r.source_url,
      thumbnailUrl: meta.thumbnailUrl || undefined,
      durationSec: Number.isFinite(meta.durationSec) ? meta.durationSec : null,
      topics: Array.isArray(meta.topics) ? meta.topics : [],
      ageBands: Array.isArray(meta.ageBands) ? meta.ageBands : [],
    });
  }
  return out;
}

async function loadUnits(): Promise<any[]> {
  // Only units that plausibly have unresolved media steps: fetch flows for
  // recent units and filter client-side (REST cannot query inside flow[]).
  const select = 'id,teacher_id,title,topic,manifest,flow,student_path';
  const url = onlyUnit
    ? `${SUPABASE_URL}/rest/v1/units?select=${select}&id=eq.${onlyUnit}`
    : `${SUPABASE_URL}/rest/v1/units?select=${select}&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, { headers: restHeaders });
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

const CATALOG_MIN_SCORE = 3;

const catalog = await loadCatalog();
console.log(`catalog: ${catalog.length} entries`);

const units = await loadUnits();
console.log(`units scanned: ${units.length}\n`);

let patchedUnits = 0, patchedBlocks = 0, noMatch = 0, alreadyResolved = 0, studentPathsHealed = 0;
const rungTally: Record<string, number> = {};

for (const unit of units) {
  const flow = Array.isArray(unit.flow) ? unit.flow : null;
  if (!flow) continue;
  const unresolved = flow.filter((b: any) => b?.type === 'MEDIA_PLAYER' && !b?.data?.videoUrl && !b?.data?.audioUrl);

  // ── student_path heal (external audit 2026-09-05, finding #3) ──
  // Runs even when the unit's OWN flow is already resolved (the common case:
  // flow healed first, path composed earlier). Saved student paths carry
  // their OWN media lead-in blocks; paths composed before resolution hold a
  // stale suggestion-only copy (or a blank {}), and the saved path supersedes
  // the derived units.flow for students. Copy the canonical resolved media
  // block's data into any unresolved path block.
  {
    const sp = Array.isArray(unit.student_path) ? unit.student_path : null;
    const canonical = flow.find((b: any) => b?.type === 'MEDIA_PLAYER' && (b?.data?.videoUrl || b?.data?.audioUrl));
    if (sp && canonical?.data) {
      let spChanged = false;
      for (const node of sp) {
        for (const b of node?.blocks || []) {
          if (b?.type === 'MEDIA_PLAYER' && !b?.data?.videoUrl && !b?.data?.audioUrl) {
            b.data = { ...(b.data || {}), ...canonical.data };
            spChanged = true;
          }
        }
      }
      if (spChanged) {
        studentPathsHealed++;
        console.log(`  ✓ [student-path] ${unit.title?.slice(0, 40)} → ${canonical.data.videoTitle?.slice(0, 50) || canonical.data.videoUrl}`);
        if (apply) {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/units?id=eq.${unit.id}`, {
            method: 'PATCH',
            headers: { ...restHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ student_path: sp }),
          });
          if (!res.ok) console.log(`  ✗ STUDENT-PATH PATCH FAILED ${unit.id}: ${res.status}`);
          await sleep(120);
        }
      }
    }
  }

  if (unresolved.length === 0) { alreadyResolved++; continue; }

  // Real manifests carry content under enriched_content (flat keys are the
  // legacy shape) — same normalization lesson as the resolve-media fix.
  const mf = unit.manifest || {};
  const ec = mf.enriched_content && typeof mf.enriched_content === 'object' ? mf.enriched_content : {};
  const vocab = Array.isArray(ec.vocabulary)
    ? ec.vocabulary.map((v: any) => v?.word).filter(Boolean).slice(0, 20)
    : [];
  const ageBand = ageBandFromGrade(mf.meta?.difficulty_cefr || ec.gradeLevel);
  const topic = ec.topic || unit.topic || null;
  let changed = false;
  // A unit with several unresolved media steps should get DISTINCT videos —
  // without this, one topic match repeats across every block.
  const usedVideoIds = new Set<string>();

  for (const block of unresolved) {
    const d = block.data || {};
    const scored = catalog
      .filter((row) => !usedVideoIds.has(row.videoId))
      .map((row) => ({ row, score: scoreCatalogEntry(row, {
        kind: d.kind === 'video' ? 'video' : 'song',
        suggestionTitle: d.title || null,
        bookSongTitle: d.source === 'book' ? d.title : null,
        topic, vocab, ageBand,
      }) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= CATALOG_MIN_SCORE && autoApplyAllowed({ ...best.row, source: 'catalog' }, d.kind === 'video' ? 'video' : 'song')) {
      const rung = best.score >= 5 ? 'title' : 'topic';
      rungTally[rung] = (rungTally[rung] || 0) + 1;
      usedVideoIds.add(best.row.videoId);
      block.data = {
        ...d,
        videoUrl: best.row.url,
        videoTitle: best.row.title,
        videoChannel: best.row.channel,
        ...(best.row.thumbnailUrl ? { videoThumbnailUrl: best.row.thumbnailUrl } : {}),
        resolvedVia: 'catalog',
        resolvedAt: new Date().toISOString(),
      };
      changed = true;
      patchedBlocks++;
      console.log(`  ✓ [${rung}] ${unit.title?.slice(0, 40)} → ${best.row.title.slice(0, 50)} (${best.row.channel.slice(0, 30)})`);
    } else {
      rungTally['none'] = (rungTally['none'] || 0) + 1;
      noMatch++;
    }
  }

  if (changed) {
    patchedUnits++;
    if (apply) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/units?id=eq.${unit.id}`, {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ flow }),
      });
      if (!res.ok) console.log(`  ✗ PATCH FAILED ${unit.id}: ${res.status}`);
      await sleep(120);
    }
  }
}

console.log(`\n${apply ? 'APPLIED' : 'DRY-RUN'}: ${patchedUnits}/${units.length} units patched (${patchedBlocks} blocks), ${noMatch} blocks unmatched, ${alreadyResolved} units already resolved, ${studentPathsHealed} student paths healed.`);
console.log('rungs:', JSON.stringify(rungTally));
if (!apply) console.log('Re-run with --yes to patch.');
