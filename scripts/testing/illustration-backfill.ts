// scripts/testing/illustration-backfill.ts — run with (Node >= 18 REQUIRED:
// uses global fetch, crypto.subtle, and atob for base64 image decoding):
//   SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> AI_API_KEY=<openrouter key> \
//   npx tsx scripts/testing/illustration-backfill.ts                    # dry-run (default)
//   ... npx tsx scripts/testing/illustration-backfill.ts --limit 30     # capped dry-run
//   ... npx tsx scripts/testing/illustration-backfill.ts --surface cover --yes   # staged execution
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY, IMAGE_GEN_MODEL (optional)
// Flags: [--unit <id>] [--surface vocab|cover|portrait|story] [--limit N] [--yes]
// Default is DRY-RUN: prints the plan + estimated cost. --yes executes.
// Idempotent: dedup is (model, prompt, refs) hash → assets.prompt_hash; rows
// already pointing at a good image (or an asset) are never re-queued.
import {
  composePrompt,
  aspectRatioFor,
  callOpenRouterImages,
  uploadImageToStorage,
  findAssetByHash,
  insertAssetRow,
  promptHashFor,
} from '../../supabase/functions/_shared/illustrationCore';
import type { Surface, UnitArtContext } from '../../supabase/functions/_shared/illustrationCore';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = process.env.AI_API_KEY;
const MODEL = process.env.IMAGE_GEN_MODEL || 'bytedance-seed/seedream-4.5';
const COST = 0.04;

if (!SUPABASE_URL || !SERVICE_KEY || !KEY) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AI_API_KEY required');
  process.exit(1);
}

const rest = { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY };
const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const dryRun = !args.includes('--yes');
const onlyUnit = flag('--unit');
// The flag name is `story`; the Surface value it maps to is `story_scene`. Accept both spellings.
const rawSurface = flag('--surface');
const onlySurface = rawSurface === 'story_scene' ? 'story' : rawSurface;
if (onlySurface && !['vocab', 'cover', 'portrait', 'story'].includes(onlySurface)) {
  console.error(`--surface must be one of vocab|cover|portrait|story (got "${onlySurface}")`);
  process.exit(1);
}
const limit = Number(flag('--limit') || 0);

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch (err: any) {
    // Surface network-level failures (DNS, TLS, refused) with the path that failed —
    // otherwise undici's bare "fetch failed" gives no clue which call went wrong.
    throw new Error(`${path} → fetch failed: ${err?.message || err}${err?.cause ? ` (${err.cause?.message || err.cause})` : ''}`);
  }
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as T;
}

const isBad = (url: string | null | undefined) => !url || /pollinations\.ai|dicebear\.com/i.test(url);

interface Job { surface: Surface; unitId: string; id: string; content: string; ctx: UnitArtContext }

// Correction 1 (task brief review): every job must carry its OWN UnitArtContext
// built from its unit row — no shared/misattached context across the four
// surface loops. All four loops below build it through this helper.
const ctxFor = (u: any): UnitArtContext => ({ title: u.title, topic: u.topic, artDirection: u.art_direction });

interface Plan { jobs: Job[]; skipped: Record<string, number>; unitsFetched: number }

async function plan(): Promise<Plan> {
  const jobs: Job[] = [];
  // Correction 3: rows referencing units outside the fetched set are skipped —
  // count them per surface so the skip is VISIBLE in the plan summary instead of silent.
  const skipped: Record<string, number> = {};
  const note = (s: string) => { skipped[s] = (skipped[s] || 0) + 1; };

  const units: any[] = await api(`/rest/v1/units?select=id,title,topic,art_direction,cover_image,deleted_at&order=created_at&limit=500`);
  if (units.length >= 500) console.error('WARNING: unit list capped at 500 (API limit) — older units were not planned; run again with --unit <id> batches to reach them.');
  const live = units.filter((u) => !u.deleted_at && (!onlyUnit || u.id === onlyUnit));
  if (onlyUnit && live.length === 0) console.error(`NOTE: --unit ${onlyUnit} matched no live unit in the fetched set (not found, deleted, or beyond the 500 cap) — 0 jobs for it.`);

  for (const u of live) {
    if ((!onlySurface || onlySurface === 'cover') && isBad(u.cover_image)) {
      jobs.push({ surface: 'cover', unitId: u.id, id: u.id, content: `cover illustration for the unit "${u.title}" about ${u.topic || u.title}`, ctx: ctxFor(u) });
    }
  }
  // vocab (only if the unit was selected or no unit filter and no surface filter)
  if (!onlySurface || onlySurface === 'vocab') {
    const q = onlyUnit ? `/rest/v1/vocabulary_items?select=id,unit_id,word,image_prompt,image_url&unit_id=eq.${onlyUnit}&limit=2000`
                       : `/rest/v1/vocabulary_items?select=id,unit_id,word,image_prompt,image_url&limit=2000`;
    const items: any[] = await api(q);
    const unitById = new Map<string, any>(live.map((u) => [u.id as string, u] as [string, any]));
    for (const v of items) {
      const u = unitById.get(v.unit_id);
      if (!u) { note('vocab'); continue; }
      if (isBad(v.image_url)) {
        jobs.push({ surface: 'vocab', unitId: u.id, id: v.id, content: v.image_prompt || `illustration of ${v.word}`, ctx: ctxFor(u) });
      }
    }
  }
  // portraits (needs unit join)
  if (!onlySurface || onlySurface === 'portrait') {
    const rows: any[] = await api('/rest/v1/unit_characters?select=unit_id,characters(id,name,look_prompt,reference_image_asset_id)&limit=2000');
    const unitById = new Map<string, any>(live.map((u) => [u.id as string, u] as [string, any]));
    const seen = new Set<string>();
    for (const r of rows) {
      const u = unitById.get(r.unit_id);
      if (!u) { note('portrait'); continue; }
      const ch = r.characters;
      if (!ch || seen.has(ch.id) || ch.reference_image_asset_id) continue;
      seen.add(ch.id);
      jobs.push({ surface: 'portrait', unitId: u.id, id: ch.id, content: `character portrait of ${ch.name}: ${ch.look_prompt || `a friendly child character named ${ch.name}`}`, ctx: ctxFor(u) });
    }
  }
  // story scenes (after portraits in ordering)
  if (!onlySurface || onlySurface === 'story') {
    const q = onlyUnit ? `/rest/v1/story_pages?select=id,unit_id,page_number,text,speaker,image_prompt,image_asset_id&unit_id=eq.${onlyUnit}&order=page_number&limit=2000`
                       : `/rest/v1/story_pages?select=id,unit_id,page_number,text,speaker,image_prompt,image_asset_id&order=page_number&limit=2000`;
    const pages: any[] = await api(q);
    const unitById = new Map<string, any>(live.map((u) => [u.id as string, u] as [string, any]));
    for (const p of pages) {
      const u = unitById.get(p.unit_id);
      if (!u) { note('story'); continue; }
      if (p.image_asset_id) continue;
      jobs.push({ surface: 'story_scene', unitId: u.id, id: p.id, content: p.image_prompt || `scene: ${String(p.text || '').slice(0, 300)}`, ctx: ctxFor(u) });
    }
  }
  // NOTE: story_scene refs (portraits) are omitted in the backfill v1 — the
  // model still follows the prompt's named characters; ref-based scenes come
  // from the orchestrator/regenerate buttons going forward. Rationale: the
  // backfill spans thousands of units; refs would add N asset lookups per page.
  return { jobs: limit ? jobs.slice(0, limit) : jobs, skipped, unitsFetched: units.length };
}

async function runJob(j: Job): Promise<string> {
  const prompt = composePrompt(j.surface, j.ctx, j.content);
  const hash = await promptHashFor(MODEL, prompt, []);
  const cached = await findAssetByHash(rest, hash);
  if (cached) {
    // Dedup hit: still write the target row (cover/vocab/portrait/page) —
    // the asset may exist from another flow while this row was never patched.
    if (j.surface === 'cover') await api(`/rest/v1/units?id=eq.${j.unitId}`, { method: 'PATCH', body: JSON.stringify({ cover_image: cached.public_url }) });
    if (j.surface === 'vocab') await api(`/rest/v1/vocabulary_items?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_url: cached.public_url }) });
    if (j.surface === 'portrait') await api(`/rest/v1/characters?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ reference_image_asset_id: cached.id }) });
    if (j.surface === 'story_scene') await api(`/rest/v1/story_pages?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_asset_id: cached.id }) });
    return 'cached';
  }
  const gen = await callOpenRouterImages({ openrouterKey: KEY }, { model: MODEL, prompt, aspectRatio: aspectRatioFor(j.surface) });
  // `gen.ok === false` (not `!gen.ok`): this non-strict tsconfig does not narrow
  // the ImageGenResult union inside a negated-truthiness branch (same pattern as
  // illustration-bakeoff.ts).
  if (gen.ok === false) return `FAILED: ${gen.error.slice(0, 120)}`;
  // Node >= 18: global atob exists; deprecated for binary use but functional —
  // this byte-wise decode is the standard b64→Uint8Array idiom.
  const bytes = Uint8Array.from(atob(gen.b64), (c) => c.charCodeAt(0));
  const url = await uploadImageToStorage(rest, j.unitId, bytes, gen.mediaType);
  if (!url) return 'FAILED: upload';
  const inserted = await insertAssetRow(rest, { unit_id: j.unitId, prompt, prompt_hash: hash, model: gen.model, storage_path: `images/${j.unitId}`, public_url: url });
  if (!inserted.id) return inserted.conflict ? 'generated (asset conflict)' : 'FAILED: asset insert';
  const assetId = inserted.id;
  if (j.surface === 'cover') await api(`/rest/v1/units?id=eq.${j.unitId}`, { method: 'PATCH', body: JSON.stringify({ cover_image: url }) });
  if (j.surface === 'vocab') await api(`/rest/v1/vocabulary_items?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_url: url }) });
  if (j.surface === 'portrait') await api(`/rest/v1/characters?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ reference_image_asset_id: assetId }) });
  if (j.surface === 'story_scene') await api(`/rest/v1/story_pages?id=eq.${j.id}`, { method: 'PATCH', body: JSON.stringify({ image_asset_id: assetId }) });
  return 'generated';
}

async function main() {
  const { jobs, skipped, unitsFetched } = await plan();
  const counts: Record<string, number> = {};
  for (const j of jobs) counts[j.surface] = (counts[j.surface] || 0) + 1;
  console.log(`\nPlanned from ${unitsFetched} fetched unit(s): ${jobs.length} jobs. Surfaces: ${JSON.stringify(counts)}`);
  for (const [s, n] of Object.entries(skipped)) {
    console.log(`  skipped: ${n} ${s} row(s) whose unit is outside the planned set (deleted, beyond the 500-unit cap, or excluded by --unit)`);
  }
  console.log(`Estimated cost: $${(jobs.length * COST).toFixed(2)} (at $${COST}/image, model ${MODEL})`);
  if (dryRun) { console.log('DRY RUN — re-run with --yes to execute.'); return; }
  let done = 0, failed = 0;
  for (const j of jobs) {
    const r = await runJob(j);
    if (r.startsWith('FAILED')) failed++;
    if (++done % 10 === 0 || r.startsWith('FAILED')) console.log(`[${done}/${jobs.length}] ${j.surface} ${j.id}: ${r}`);
  }
  console.log(`Done. ${done - failed} ok, ${failed} failed.`);
}

main().catch((err: any) => { console.error(`backfill failed: ${err?.message || err}`); process.exit(1); });
