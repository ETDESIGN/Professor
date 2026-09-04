// scripts/testing/word-image-dedupe.ts — run with (Node >= 18):
//   SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   npx tsx scripts/testing/word-image-dedupe.ts              # DRY-RUN (default)
//   ... word-image-dedupe.ts --owner <uuid>                   # scoped dry-run
//   ... word-image-dedupe.ts --yes                            # execute (REST only)
//   ... word-image-dedupe.ts --yes --purge-storage            # + hard-delete objects
//                                                                   (needs SVC_ROLE_JWT)
// Emits word-repoint-pool.sql (pool_items content URL repair) in BOTH modes —
// that SQL is applied separately via the Management API after review.
// Idempotent: winners are upserted; losers retire only when unreferenced.
// NULL-owner vocabulary rows are skipped and counted (never touched).
import { writeFileSync } from 'fs';
import { planWordDedupe } from '../../supabase/functions/_shared/wordImageCore';
import type { VocabRefRow, AssetLike } from '../../supabase/functions/_shared/wordImageCore';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LEGACY_KEY = process.env.SVC_ROLE_JWT; // legacy JWT needed for Storage deletes

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const i = args.indexOf(n);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const dryRun = !args.includes('--yes');
const onlyOwner = flag('--owner');
const purgeStorage = args.includes('--purge-storage');
if (purgeStorage && !LEGACY_KEY) {
  console.error('--purge-storage requires SVC_ROLE_JWT (legacy service key — the new-style key is rejected by Storage)');
  process.exit(1);
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as T;
}

/** Paginated GET — PostgREST clamps to max-rows; walk with limit/offset. */
async function getAll<T = any>(path: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const rows = await api<T[]>(`${path}&limit=${pageSize}&offset=${offset}`);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

async function main() {
  console.log(`word-image-dedupe ${dryRun ? 'DRY-RUN' : 'EXECUTE'}${onlyOwner ? ` owner=${onlyOwner}` : ''}${purgeStorage ? ' +purge-storage' : ''}`);

  // 1. Vocabulary references with owners (units embed for teacher_id).
  const vocabRaw = await getAll<any>(`/rest/v1/vocabulary_items?select=id,unit_id,word,image_url,units(teacher_id)&order=id.asc`);
  const vocabRows: VocabRefRow[] = vocabRaw.map((r) => ({
    id: r.id, unit_id: r.unit_id, word: r.word,
    image_url: r.image_url,
    owner_id: r.units?.teacher_id ?? null,
  }));
  console.log(`vocabulary_items: ${vocabRows.length} rows (${vocabRows.filter((r) => !r.owner_id).length} without owner — skipped)`);

  // 2. Assets indexed by URL — only image assets whose URL is referenced as a
  //    vocab image can ever be planned (story/portrait/cover crops excluded
  //    by construction: their URLs never appear in vocabulary_items).
  const vocabUrls = new Set(vocabRows.filter((r) => r.image_url).map((r) => r.image_url!));
  const assetRows = await getAll<any>(`/rest/v1/assets?select=id,public_url,created_at,metadata,is_deleted&type=eq.image&order=created_at.asc`);
  const assetsByUrl = new Map<string, AssetLike>();
  const assetById = new Map<string, any>();
  for (const a of assetRows) {
    if (a.public_url && vocabUrls.has(a.public_url) && !a.is_deleted) {
      assetsByUrl.set(a.public_url, { id: a.id, public_url: a.public_url, created_at: a.created_at });
      assetById.set(a.id, a);
    }
  }
  console.log(`assets matching vocab URLs: ${assetsByUrl.size}`);

  // 3. Plan.
  const { plans, skippedNoOwner, repointSqlStatements } = planWordDedupe(
    onlyOwner ? vocabRows.filter((r) => r.owner_id === onlyOwner) : vocabRows,
    assetsByUrl,
  );
  const repointCount = plans.reduce((n, p) => n + p.repoint.length, 0);
  const retireCount = plans.reduce((n, p) => n + p.retireAssetIds.length, 0);
  console.log(`plan: ${plans.length} words | repoint ${repointCount} vocabulary rows | retire ${retireCount} assets | skippedNoOwner ${skippedNoOwner}`);
  writeFileSync('word-repoint-pool.sql', repointSqlStatements.join('\n') + '\n');
  console.log(`wrote word-repoint-pool.sql (${repointSqlStatements.length} pool_items repair statements — apply via Management API after review)`);

  if (dryRun) {
    for (const p of plans.slice(0, 40)) {
      console.log(`  ${p.owner_id.slice(0, 8)}… "${p.word_key}" → …${p.winnerUrl.slice(-24)} (repoint ${p.repoint.length}, retire ${p.retireAssetIds.length})`);
    }
    if (plans.length > 40) console.log(`  … +${plans.length - 40} more`);
    console.log('DRY-RUN complete. Re-run with --yes to execute.');
    return;
  }

  // 4. Execute — winners upsert into word_images (+stamp metadata/owner so the
  //    library chips and flashcard view can classify them; RLS needs owner_id
  //    for client reads too).
  const retiredIds = new Set(plans.flatMap((p) => p.retireAssetIds));

  for (const p of plans) {
    if (p.winnerAssetId) {
      await api('/rest/v1/word_images?on_conflict=owner_id,word_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ owner_id: p.owner_id, word_key: p.word_key, asset_id: p.winnerAssetId }),
      });
      const winner = assetById.get(p.winnerAssetId);
      const metadata = { ...((winner as any)?.metadata || {}), surface: 'vocab', word_key: p.word_key };
      await api(`/rest/v1/assets?id=eq.${p.winnerAssetId}`, {
        method: 'PATCH',
        body: JSON.stringify({ metadata, owner_id: p.owner_id }),
      });
    }
    for (const r of p.repoint) {
      await api(`/rest/v1/vocabulary_items?id=eq.${r.rowId}`, {
        method: 'PATCH',
        body: JSON.stringify({ image_url: p.winnerUrl, image_status: 'ready' }),
      });
    }
    for (const assetId of p.retireAssetIds) {
      await api(`/rest/v1/assets?id=eq.${assetId}`, { method: 'PATCH', body: JSON.stringify({ is_deleted: true }) });
    }
  }

  // --purge-storage: hard-delete the retired assets' storage objects. The
  // storage_path column holds only a directory prefix — derive the object
  // path from the public URL instead. Retired URLs then STOP rendering
  // (stale flows/manifests would show broken images) — hence opt-in.
  if (purgeStorage) {
    for (const [url, a] of assetsByUrl) {
      if (!retiredIds.has(a.id)) continue;
      const marker = '/object/public/';
      const idx = url.indexOf(marker);
      if (idx < 0) continue;
      const [bucket, ...pathParts] = url.slice(idx + marker.length).split('/');
      const objectPath = pathParts.join('/');
      const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${objectPath}`, {
        method: 'DELETE',
        headers: { apikey: LEGACY_KEY!, Authorization: `Bearer ${LEGACY_KEY!}` },
      });
      console.log(`  purge ${bucket}/${objectPath} → ${resp.status}`);
    }
  }

  console.log(`DONE: ${plans.length} words bootstrapped, ${repointCount} rows repointed, ${retireCount} assets retired.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
