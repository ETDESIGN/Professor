// Basket E2E (FIXPLAN_F P2 verification): scan 3 real fixture pages into a
// scratch unit, confirm the baskets, run basket-mode enrichment, and verify
// the relational writes + basket RPC output end-to-end.
//
//   npm run test:baskets -- (uses the same env as test:fixtures)
//
// Pages used (physical PDF pages for printed 7/8/9):
//   printed 7  — Countryside vocab set + activities
//   printed 8  — 6-panel comic (story + dialogues baskets)
//   printed 9  — grammar box (BOX tier, verbatim)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.FIXTURE_EMAIL || '';
const PASSWORD = process.env.FIXTURE_PASSWORD || '';
const PAGES_DIR = process.env.FIXTURE_PAGES_DIR || '/tmp/powerup2-pages';
const PDF_PAGES = [4, 5, 6]; // printed 7, 8, 9

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / FIXTURE_EMAIL / FIXTURE_PASSWORD)'); process.exit(2);
}

const failures: string[] = [];
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(label);
};

async function main() {
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr || !authData.user) { console.error('Sign-in failed:', authErr?.message); process.exit(2); }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const { data: unit, error: unitErr } = await sb.from('units').insert({
    title: `FIXTURE BASKET E2E ${stamp} (safe to delete)`, topic: 'FIXTURE TEST', level: 'General',
    status: 'Draft', lessons: 1, flow: [], teacher_id: authData.user.id, order_index: 0,
  }).select('id').single();
  if (unitErr || !unit) { console.error('scratch unit failed:', unitErr?.message); process.exit(2); }
  console.log(`Scratch unit: ${unit.id}`);

  // 1. Scan the three pages sequentially.
  for (const pdfPage of PDF_PAGES) {
    const jpeg = fs.readFileSync(path.join(PAGES_DIR, `p${String(pdfPage).padStart(2, '0')}.jpg`));
    const storagePath = `fixtures/basket-e2e-p${pdfPage}-${stamp}.jpg`;
    const { error: upErr } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = sb.storage.from('materials').getPublicUrl(storagePath);
    const { data, error } = await sb.functions.invoke('scan-page', {
      body: { unitId: unit.id, fileUrl: urlData.publicUrl, filename: `e2e-p${pdfPage}.jpg`, pdfPageNumber: pdfPage, uploadOrder: pdfPage },
    });
    if (error || !data?.success) throw new Error(`scan p${pdfPage}: ${error?.message || data?.error}`);
    console.log(`  scanned pdf p${pdfPage} printed=${data.page_labels?.printed_page_number}: ${data.structures.length} structures`);
  }

  // 2. Teacher batch-confirm (review flow equivalent).
  const { data: pageRows } = await sb.from('book_pages').select('id').eq('unit_id', unit.id);
  await sb.from('page_structures').update({ review_status: 'confirmed' })
    .in('page_id', (pageRows || []).map((p: any) => p.id));
  await sb.from('book_pages').update({ status: 'reviewed', reviewed_at: new Date().toISOString() }).eq('unit_id', unit.id);
  await sb.from('units').update({ baskets_confirmed_at: new Date().toISOString() }).eq('id', unit.id);
  console.log('  baskets confirmed');

  // 3. Basket RPC.
  const { data: baskets, error: basketErr } = await sb.rpc('get_unit_baskets', { p_unit_id: unit.id });
  if (basketErr || !baskets) { console.error('get_unit_baskets failed:', basketErr?.message); process.exit(1); }
  console.log(`  baskets: vocab=${baskets.vocabulary.length} grammar=${baskets.grammar.length} ` +
    `story.passages=${baskets.story.passages.length} story.comics=${baskets.story.comics.length} ` +
    `dialogues=${baskets.dialogues.length} confirmed_at=${baskets.confirmed_at ? 'set' : 'MISSING'}`);
  check(baskets.vocabulary.length >= 8, 'vocabulary basket has the Countryside set', `${baskets.vocabulary.length} words`);
  check(baskets.grammar.length >= 1, 'grammar basket has the BOX rule');
  check(baskets.story.comics.length >= 1, 'comic in story basket');
  check(baskets.dialogues.length >= 4, 'comic bubbles in dialogues basket', `${baskets.dialogues.length} lines`);

  // 4. Enrich per-category (basket mode).
  for (const category of ['vocabulary', 'grammar', 'story', 'dialogues']) {
    const { data, error } = await sb.functions.invoke('enrich-unit', { body: { unitId: unit.id, category } });
    if (error) { console.error(`  enrich ${category}: ${error.message}`); failures.push(`enrich ${category}`); continue; }
    if (data?.success === false) { console.error(`  enrich ${category}: ${data.error}`); failures.push(`enrich ${category}`); continue; }
    console.log(`  enrich ${category}: ok (${JSON.stringify(data.presence || {})})`);
  }

  // 5. Verify relational writes + provenance.
  const { data: vocabRows } = await sb.from('vocabulary_items').select('word, set_label, source_structure_id, l1_translation, phonetic').eq('unit_id', unit.id);
  check((vocabRows || []).length >= 8, 'vocabulary_items written from basket', `${vocabRows?.length ?? 0} rows`);
  const withProv = (vocabRows || []).filter((v: any) => v.source_structure_id);
  check(withProv.length >= 8, 'vocab rows carry source_structure_id', `${withProv.length}/${vocabRows?.length}`);
  check((vocabRows || []).every((v: any) => v.l1_translation), 'L1 translations present (zh-CN default)');
  const { data: grammarRows } = await sb.from('grammar_rules').select('rule, tier, source_structure_id, examples').eq('unit_id', unit.id);
  check((grammarRows || []).length >= 1, 'grammar_rules written (verbatim BOX)');
  check((grammarRows || []).every((g: any) => g.tier === 'BOX'), 'grammar rows tier BOX');
  check((grammarRows || []).some((g: any) => (g.rule || '').toLowerCase().includes('are you reading a book') || JSON.stringify(g.examples).toLowerCase().includes('are you reading a book')),
    'grammar text is verbatim from the box');
  const { data: storyRows } = await sb.from('story_pages').select('text, source_structure_id').eq('unit_id', unit.id);
  check((storyRows || []).length >= 1, 'story_pages written from comic panels', `${storyRows?.length} pages`);
  const { data: dialogueRows } = await sb.from('dialogue_lines').select('text, source_structure_id').eq('unit_id', unit.id);
  check((dialogueRows || []).length >= 4, 'dialogue_lines written verbatim', `${dialogueRows?.length} lines`);
  check((dialogueRows || []).every((d: any) => d.source_structure_id), 'dialogue lines carry provenance');

  // 6. Cleanup.
  await sb.from('units').update({ deleted_at: new Date().toISOString() }).eq('id', unit.id);
  console.log(`\nScratch unit soft-deleted (${unit.id}).`);
  if (failures.length) { console.error(`\n✗ E2E FAILURES (${failures.length}): ${failures.join('; ')}`); process.exit(1); }
  console.log('\n✓ Basket E2E fully green.');
}

main().catch((e) => { console.error(e); process.exit(2); });
