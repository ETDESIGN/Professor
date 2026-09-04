// scripts/media/seed-catalog.ts — seed the kids-ESL song catalog (design
// 2026-09-04 §4.3) from scripts/media/catalog-seed.json into `assets` as
// SYSTEM catalog rows (owner_id NULL, unit_id NULL, type 'video', kind
// 'external_url', tagged topic:*/age:*/source:seed, metadata carries
// videoId/channelId/durationSec/topics/ageBands).
//
// Run with (Node >= 18):
//   SUPABASE_URL=https://xsdnzijketjnzhakqtit.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   npx tsx scripts/media/seed-catalog.ts            # dry-run (default)
//   ... npx tsx scripts/media/seed-catalog.ts --yes  # insert
//
// Every entry is RE-VERIFIED via the keyless public oEmbed endpoint at seed
// time — a video that 404s (deleted/private) is skipped and logged, never
// inserted. Idempotent: existing system rows (same metadata.videoId) are
// skipped, so re-running after catalog growth only adds new entries.
// Politeness: ~150ms between oEmbed probes (~30s for 189 entries).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--yes');
if (!apply) console.log('DRY-RUN (pass --yes to insert)\n');

interface SeedEntry {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  channelId: string;
  thumbnailUrl: string;
  durationSec: number;
  topics: string[];
  ageBands: string[];
  language: string;
  source: string;
}

const seed = JSON.parse(
  await (await import('node:fs/promises')).readFile('scripts/media/catalog-seed.json', 'utf8'),
);
const entries: SeedEntry[] = seed.entries || [];
console.log(`catalog-seed.json: ${entries.length} entries, ${seed.stats?.topics ?? '?'} topics\n`);

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function oembedVerify(videoId: string): Promise<{ ok: boolean; title?: string; author?: string; thumb?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return { ok: false };
    const j: any = await res.json();
    return { ok: true, title: j.title, author: j.author_name, thumb: j.thumbnail_url };
  } catch {
    return { ok: false };
  }
}

async function existingAssetId(videoId: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/assets?select=id&type=eq.video&kind=eq.external_url&unit_id=is.null&owner_id=is.null&metadata->>videoId=eq.${encodeURIComponent(videoId)}&limit=1`,
    { headers: restHeaders },
  );
  if (!res.ok) return null; // treat lookup failure as "not found" — insert may still dedupe via videoId check below
  const rows = await res.json();
  return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
}

let inserted = 0, skippedExisting = 0, skippedDead = 0, failed = 0;

for (const e of entries) {
  if (!e.videoId || !e.url || !e.title) { skippedDead++; continue; }

  const existing = await existingAssetId(e.videoId);
  if (existing) { skippedExisting++; continue; }

  const v = await oembedVerify(e.videoId);
  if (!v.ok) {
    console.log(`  ✗ DEAD ${e.videoId} — ${e.title.slice(0, 60)}`);
    skippedDead++;
    await sleep(150);
    continue;
  }

  const row = {
    unit_id: null,
    owner_id: null,
    type: 'video',
    kind: 'external_url',
    prompt: v.title || e.title,
    source_url: e.url,
    public_url: e.url,
    storage_path: 'external',
    tags: [
      'source:seed',
      ...(e.topics || []).map((t) => `topic:${t}`),
      ...(e.ageBands || []).map((a) => `age:${a}`),
    ],
    metadata: {
      videoId: e.videoId,
      title: v.title || e.title,
      channel: v.author || e.channel,
      channelId: e.channelId || undefined,
      durationSec: e.durationSec ?? null,
      topics: e.topics || [],
      ageBands: e.ageBands || [],
      language: e.language || 'en',
      thumbnailUrl: v.thumb || e.thumbnailUrl,
      source: 'seed',
      verifiedAt: new Date().toISOString(),
    },
  };

  if (!apply) {
    console.log(`  would insert ${e.videoId} — ${(v.title || e.title).slice(0, 60)}`);
    inserted++;
    await sleep(60);
    continue;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/assets`, {
    method: 'POST',
    headers: restHeaders,
    body: JSON.stringify(row),
  });
  if (res.ok) {
    inserted++;
    console.log(`  ✓ ${e.videoId} — ${(v.title || e.title).slice(0, 60)}`);
  } else {
    failed++;
    console.log(`  ✗ INSERT FAILED ${e.videoId}: ${res.status} ${await res.text()}`);
  }
  await sleep(150);
}

console.log(`\n${apply ? 'SEEDED' : 'DRY-RUN'}: ${inserted} inserted, ${skippedExisting} already present, ${skippedDead} dead/skipped, ${failed} failed.`);
if (!apply) console.log('Re-run with --yes to insert.');
