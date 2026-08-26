// Legacy-path smoke (FIXPLAN_F P2 regression): a unit whose content lives
// ONLY in units.scanned_assets (pre-P2 shape) must still enrich through the
// unchanged legacy branch. Simulates an old production unit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: process.env.FIXTURE_EMAIL!, password: process.env.FIXTURE_PASSWORD!,
  });
  if (authErr) { console.error('sign-in failed'); process.exit(2); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  // Pre-P2 shape: scanned_assets entries with extract-page's flat metadata.
  const { data: unit, error: unitErr } = await sb.from('units').insert({
    title: `FIXTURE LEGACY SMOKE ${stamp} (safe to delete)`, topic: 'Farm animals', level: 'General',
    status: 'Draft', lessons: 1, flow: [], teacher_id: authData.user.id, order_index: 0,
    scanned_assets: [{
      success: true, url: '(legacy)',
      metadata: {
        extractedText: 'Vocabulary: cow, sheep, duck, horse, goat. The cow is big. The sheep is soft.',
        pageCount: 1, language: 'en', topic: 'Farm animals', gradeLevel: 'A1',
        vocabulary: [{ word: 'cow' }, { word: 'sheep' }, { word: 'duck' }, { word: 'horse' }, { word: 'goat' }],
      },
    }],
  }).select('id').single();
  if (unitErr || !unit) { console.error('unit insert failed:', unitErr?.message); process.exit(2); }

  const { data, error } = await sb.functions.invoke('enrich-unit', { body: { unitId: unit.id, category: 'vocabulary' } });
  if (error || data?.success === false) {
    console.error('LEGACY SMOKE FAILED:', error?.message || data?.error); process.exit(1);
  }
  const presence = data?.presence?.vocabulary || {};
  console.log(`legacy enrich ok: source=${presence.source_count} enriched=${presence.enriched_count} status=${presence.status} source_mode=${data?.source || 'legacy'}`);

  const { data: rows } = await sb.from('vocabulary_items').select('word').eq('unit_id', unit.id);
  console.log(`vocabulary_items rows: ${rows?.length ?? 0}`);
  const ok = (rows?.length ?? 0) >= 4;
  await sb.from('units').update({ deleted_at: new Date().toISOString() }).eq('id', unit.id);
  console.log(ok ? '✓ Legacy path still works.' : '✗ Legacy path broken!');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
