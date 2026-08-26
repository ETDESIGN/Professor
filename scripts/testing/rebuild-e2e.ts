// Rebuild E2E (FIXPLAN_F P4 verification): create a simulated legacy unit
// (scanned_assets pointing at two real fixture page images), invoke
// rebuild-unit in 'fresh' mode, poll the job, and verify the rebuilt
// book-fidelity state (pages, structures, confirmed baskets, archived
// legacy manifest).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch {}
const PAGES_DIR = process.env.FIXTURE_PAGES_DIR || '/tmp/powerup2-pages';
const PDF_PAGES = [4, 6]; // printed 7 (vocab) + 9 (grammar box)

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: auth } = await sb.auth.signInWithPassword({ email: 'fixture-test+powerup2@passport.local', password: 'Fixture-Test-2026!' });
  if (!auth?.user) { console.error('sign-in failed'); process.exit(2); }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const scannedAssets: any[] = [];
  for (const p of PDF_PAGES) {
    const jpeg = fs.readFileSync(path.join(PAGES_DIR, `p${String(p).padStart(2, '0')}.jpg`));
    const storagePath = `fixtures/rebuild-p${p}-${stamp}.jpg`;
    const { error } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: url } = sb.storage.from('materials').getPublicUrl(storagePath);
    scannedAssets.push({ success: true, url: url.publicUrl, metadata: { extractedText: '(legacy extraction)', pageCount: 1, language: 'en' } });
  }

  const { data: unit } = await sb.from('units').insert({
    title: `FIXTURE REBUILD E2E ${stamp} (safe to delete)`, topic: 'FIXTURE TEST', level: 'General',
    status: 'Active', lessons: 1, flow: [], teacher_id: auth.user.id, order_index: 0,
    manifest: { meta: { unit_title: 'OLD LEGACY MANIFEST' }, enriched_content: { vocabulary: [{ word: 'stale' }] } },
    scanned_assets: scannedAssets,
  }).select('id').single();
  if (!unit) { console.error('unit insert failed'); process.exit(2); }
  console.log(`Simulated legacy unit: ${unit.id} (${scannedAssets.length} page images + stale manifest)`);

  const { data, error } = await sb.functions.invoke('rebuild-unit', { body: { unitId: unit.id, mode: 'fresh' } });
  if (error || data?.success === false) { console.error('rebuild invoke failed:', error?.message || data?.error); process.exit(1); }
  console.log(`rebuild started: ${JSON.stringify({ status: data.status, pages: data.pages, total: data.total })}`);

  // Poll to completion (rebuild chains itself; 2 pages ≈ 2-4 min).
  const deadline = Date.now() + 10 * 60 * 1000;
  let job: any = null;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000));
    const { data: j } = await sb.from('generation_jobs').select('status, error').eq('unit_id', unit.id).eq('stage', 'rebuild-unit').maybeSingle();
    job = j;
    if (j?.status === 'succeeded' || j?.status === 'failed') break;
  }
  console.log(`job: ${JSON.stringify(job)}`);
  if (job?.status !== 'succeeded') { console.error('✗ rebuild job did not succeed'); process.exit(1); }

  const { data: pages } = await sb.from('book_pages').select('id, status, printed_page_number').eq('unit_id', unit.id);
  const { data: structures } = await sb.from('page_structures').select('structure_type, review_status')
    .in('page_id', (pages || []).map((p: any) => p.id));
  const { data: unitAfter } = await sb.from('units').select('manifest, legacy_manifest, baskets_confirmed_at').eq('id', unit.id).single();

  const failures: string[] = [];
  const check = (ok: boolean, label: string, detail = '') => { console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures.push(label); };
  check((pages || []).length === PDF_PAGES.length, 'both pages rebuilt', `${pages?.length} pages`);
  check((pages || []).every(p => p.status === 'reviewed'), 'pages reviewed');
  check((structures || []).length >= 3, 'structures extracted', `${structures?.length}`);
  check((structures || []).every(s => s.review_status === 'confirmed'), 'structures auto-confirmed');
  check(unitAfter?.baskets_confirmed_at != null, 'baskets_confirmed_at set');
  check(unitAfter?.legacy_manifest?.meta?.unit_title === 'OLD LEGACY MANIFEST', 'fresh mode archived the legacy manifest');
  check(unitAfter?.manifest == null, 'manifest nulled for clean re-enrich');

  await sb.from('units').update({ deleted_at: new Date().toISOString() }).eq('id', unit.id);
  console.log(`\nScratch unit soft-deleted (${unit.id}).`);
  if (failures.length) { console.error(`✗ REBUILD E2E FAILURES: ${failures.join('; ')}`); process.exit(1); }
  console.log('✓ Rebuild E2E fully green.');
}

main().catch((e) => { console.error(e); process.exit(2); });
