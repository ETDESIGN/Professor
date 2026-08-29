// Class Plans E2E (FIXPLAN I verification): scratch unit + synthetic
// book_pages/page_structures/vocabulary_items/objectives → propose →
// apply → scope index asserts → class flow generation → release gate.
//
//   npm run test:classplans
//
// No AI, no scan: content rows are inserted directly (all teacher-writable
// via RLS). Cleans up after itself (soft-delete + hard-delete rows).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.FIXTURE_EMAIL || '';
const PASSWORD = process.env.FIXTURE_PASSWORD || '';
// Throwaway mode: without fixture creds, sign up a disposable teacher
// (profiles auto-create via the on_auth_user_created trigger). Requires
// auto-confirm on the dev project; otherwise provide FIXTURE_EMAIL/PASSWORD.
const THROWAWAY = !EMAIL;

if (!SUPABASE_URL || !ANON_KEY || (!THROWAWAY && !PASSWORD)) {
  console.error('Missing env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / FIXTURE_EMAIL / FIXTURE_PASSWORD)');
  process.exit(2);
}

const failures: string[] = [];
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(label);
};

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  let authData: any = null;
  if (THROWAWAY) {
    const email = `classplans-e2e-${Date.now()}@example.com`;
    const { data: su, error: suErr } = await sb.auth.signUp({ email, password: `Fx!${stamp}-e2e` });
    if (suErr || !su.session) { console.error('Throwaway signup failed (email confirm on?):', suErr?.message); process.exit(2); }
    authData = su;
    // Ensure the auto-created profile is a teacher (best-effort).
    await sb.from('profiles').update({ role: 'teacher' }).eq('id', su.user!.id);
    console.log(`Throwaway teacher: ${email}`);
  } else {
    const r = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (r.error || !r.data.user) { console.error('Sign-in failed:', r.error?.message); process.exit(2); }
    authData = r.data;
  }
  const teacherId = authData.user.id;

  // ── Setup: scratch unit, 4 pages, structures, vocab, objectives ────────
  const { data: unit, error: unitErr } = await sb.from('units').insert({
    title: `FIXTURE CLASSPLANS E2E ${stamp}`, topic: 'FIXTURE TEST', level: 'General',
    status: 'Active', lessons: 1, teacher_id: teacherId, order_index: 0,
    flow: [
      { type: 'INTRO_SPLASH', phase: 'WARMUP', data: { title: 'Fixture Unit', subtitle: 'test', description: '' } },
      { type: 'FOCUS_CARDS', phase: 'INPUT', data: { title: 'Vocabulary', cards: [{ front: 'zoo', back: 'x' }, { front: 'beach', back: 'x' }] } },
      { type: 'SOUND_LAB', phase: 'PRACTICE', data: { title: 'lab', poolDriven: true } },
      { type: 'STORY_STAGE', phase: 'OUTPUT', data: { title: 'story', pages: [{ text: 'unrelated', speaker: 'X' }] } },
    ],
  }).select('id').single();
  if (!unit) { console.error('scratch unit failed:', JSON.stringify(unitErr)); process.exit(2); }
  const unitId = unit.id;

  const pageIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const { data: page, error: pageErr } = await sb.from('book_pages').insert({
      teacher_id: teacherId, unit_id: unitId,
      storage_path: `fixtures/classplans/${stamp}/${i}.jpg`,
      public_url: 'https://example.com/fixture.jpg',
      upload_order: i, printed_page_number: String(10 + i), status: 'reviewed',
    }).select('id').single();
    if (!page) { console.error('page insert failed:', JSON.stringify(pageErr)); process.exit(2); }
    pageIds.push(page.id);
  }

  // Structures: vocab sets with labels (series 1 on pages 0-1, series 2 on 2-3)
  const structIds: string[] = [];
  const labels = ['Countryside', 'Countryside', 'Routines', 'Routines'];
  const words = [['tractor', 'cow'], ['duck', 'farm'], ['get up', 'wash'], ['week', 'day']];
  for (let i = 0; i < 4; i++) {
    const { data: st } = await sb.from('page_structures').insert({
      page_id: pageIds[i], structure_type: 'vocab_set', set_label: labels[i],
      review_status: 'confirmed',
      data: { items: words[i].map((w) => ({ word: w })) },
    }).select('id').single();
    structIds.push(st.id);
  }

  // Enriched vocab + objectives (simulating enrich + generate-exercises)
  const allWords = words.flat();
  const vocabIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (const w of words[i]) {
      const { data: v, error: vErr } = await sb.from('vocabulary_items').insert({
        unit_id: unitId, word: w, definition: `${w} def`,
        set_label: labels[i], source_structure_id: structIds[i], order_index: vocabIds.length,
      }).select('id').single();
      if (!v) { console.error('vocab insert failed:', w, JSON.stringify(vErr)); process.exit(2); }
      vocabIds.push(v.id);
    }
  }
  const objectiveIds: string[] = [];
  for (const w of allWords) {
    const { data: o } = await sb.from('objectives').insert({
      unit_id: unitId, type: 'vocabulary', target_value: w,
      source_structure_id: structIds[allWords.indexOf(w)],
    }).select('id').single();
    objectiveIds.push(o.id);
  }
  console.log(`Scratch unit ${unitId} · 4 pages · 8 words · 8 objectives`);

  try {
    // ── 1. propose-class-plans ─────────────────────────────────────────────
    const { data: proposal, error: pErr } = await sb.functions.invoke('propose-class-plans', { body: { unitId, targetCount: 2 } });
    check(!pErr && proposal?.success !== false, 'propose-class-plans succeeds', pErr?.message || proposal?.error || '');
    check((proposal?.proposals || []).length === 2, 'proposes 2 classes', `got ${(proposal?.proposals || []).length}`);
    const series1 = proposal?.proposals?.find((p: any) => p.set_labels?.includes('Countryside'));
    check(!!series1 && series1.vocab_weight === 4, 'class 1 = Countryside (4 words)');

    // ── 2. apply-class-plans (2 classes at the page-2 boundary) ───────────
    const { data: applied, error: aErr } = await sb.functions.invoke('apply-class-plans', {
      body: {
        unitId,
        classes: [
          { title: 'Class 1 — Countryside', order_index: 0, scope: { ranges: [{ from_page_id: pageIds[0], to_page_id: pageIds[1], from_printed: '10', to_printed: '11' }] } },
          { title: 'Class 2 — Routines', order_index: 1, scope: { ranges: [{ from_page_id: pageIds[2], to_page_id: pageIds[3], from_printed: '12', to_printed: '13' }] } },
        ],
      },
    });
    check(!aErr && applied?.success !== false, 'apply-class-plans succeeds', aErr?.message || applied?.error || '');
    check(applied?.saved === 2, 'saved 2 classes');

    const { data: plans } = await sb.from('class_plans').select('id, title, content_index, released_at, content_index_stale_at').eq('unit_id', unitId).order('order_index');
    check((plans || []).length === 2, '2 plans persisted');
    const c1 = plans?.[0], c2 = plans?.[1];
    check(c1?.content_index?.counts?.vocab === 4, 'class 1 index: 4 words', `got ${c1?.content_index?.counts?.vocab}`);
    check(c1?.content_index?.counts?.objectives === 4, 'class 1 index: 4 objectives', `got ${c1?.content_index?.counts?.objectives}`);
    check(c1?.content_index?.set_labels?.includes('Countryside'), 'class 1 series label recorded');
    check(c2?.content_index?.counts?.vocab === 4 && c2?.content_index?.set_labels?.includes('Routines'), 'class 2 index: Routines 4 words');

    // ── 3. get_released_objectives gate ───────────────────────────────────
    let { data: rel, error: relErr } = await sb.rpc('get_released_objectives', { p_unit_id: unitId });
    if (relErr) console.error('  rpc error:', relErr.message);
    check(Array.isArray(rel) && rel.length === 0, 'nothing released yet → empty set', `got ${rel?.length}`);

    // Release class 1 only.
    await sb.from('class_plans').update({ released_at: new Date().toISOString() }).eq('id', c1.id);
    ({ data: rel, error: relErr } = await sb.rpc('get_released_objectives', { p_unit_id: unitId }));
    if (relErr) console.error('  rpc error:', relErr.message);
    check(rel?.length === 4, 'after release: exactly class 1 objectives', `got ${rel?.length}`);
    const c1ObjIds: string[] = c1.content_index.objective_ids;
    check(rel?.every((id: string) => c1ObjIds.includes(id)), 'released ids ⊆ class 1 ids');

    // ── 4. generate-class-flow ────────────────────────────────────────────
    const { data: gen, error: gErr } = await sb.functions.invoke('generate-class-flow', { body: { classPlanId: c1.id } });
    check(!gErr && gen?.success !== false, 'generate-class-flow succeeds', gErr?.message || gen?.error || '');
    const flow = gen?.flow || [];
    check(flow.length >= 3, 'class flow has blocks', `got ${flow.length}`);
    const intro = flow.find((b: any) => b.type === 'INTRO_SPLASH');
    check(intro?.data?.title === 'Class 1 — Countryside', 'intro retitled to the class');
    const cards = flow.find((b: any) => b.type === 'FOCUS_CARDS')?.data?.cards || [];
    check(cards.length === 4 && cards.some((c: any) => c.front === 'tractor') && !cards.some((c: any) => c.front === 'week'), 'cards scoped to class words only');
    check(flow.some((b: any) => b.type === 'SOUND_LAB' && b.data?.poolDriven), 'pool-driven shell preserved');

    const { data: planFlow } = await sb.from('class_plans').select('flow, flow_generated_at').eq('id', c1.id).single();
    check(Array.isArray(planFlow?.flow) && planFlow.flow.length === flow.length, 'flow persisted on the plan');

    // ── 5. re-apply marks flows stale but keeps release ───────────────────
    const { data: c1Fresh } = await sb.from('class_plans').select('released_at').eq('id', c1.id).single();
    const { data: reapplied } = await sb.functions.invoke('apply-class-plans', {
      body: {
        unitId,
        classes: [
          { id: c1.id, title: 'Class 1 — Countryside', order_index: 0, released_at: c1Fresh?.released_at, scope: { ranges: [{ from_page_id: pageIds[0], to_page_id: pageIds[0] }] } },
          { id: c2.id, title: 'Class 2 — Routines', order_index: 1, scope: { ranges: [{ from_page_id: pageIds[1], to_page_id: pageIds[3] }] } },
        ],
      },
    });
    check(reapplied?.success !== false, 're-apply (edited boundary) succeeds');
    const { data: after } = await sb.from('class_plans').select('id, released_at, content_index').eq('unit_id', unitId).order('order_index');
    check(!!after?.[0]?.released_at, 'release state survives re-apply');
    check(after?.[0]?.content_index?.counts?.vocab === 2, 'class 1 rescoped to 2 words', `got ${after?.[0]?.content_index?.counts?.vocab}`);
    check(after?.[1]?.content_index?.counts?.vocab === 6, 'class 2 rescoped to 6 words', `got ${after?.[1]?.content_index?.counts?.vocab}`);

    // ── 6. empty payload = full-set semantics: deletes every plan ────────
    const { data: cleared } = await sb.functions.invoke('apply-class-plans', { body: { unitId, classes: [] } });
    check(cleared?.success !== false, 'empty payload deletes all plans', cleared?.error || '');
    check(cleared?.deleted === 2, 'both plans deleted', `deleted ${cleared?.deleted}`);
    ({ data: rel, error: relErr } = await sb.rpc('get_released_objectives', { p_unit_id: unitId }));
    if (relErr) console.error('  rpc error:', relErr.message);
    check(rel?.length === 8, 'no plans → all objectives (legacy behavior)', `got ${rel?.length}`);
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    await sb.from('class_plans').delete().eq('unit_id', unitId);
    await sb.from('objectives').delete().eq('unit_id', unitId);
    await sb.from('vocabulary_items').delete().eq('unit_id', unitId);
    await sb.from('book_pages').delete().eq('unit_id', unitId);
    await sb.from('units').delete().eq('id', unitId);
    console.log('Cleanup done.');
  }

  if (failures.length > 0) {
    console.error(`\nFAILED (${failures.length}): ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nAll class-plans E2E checks passed.');
}

main().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
