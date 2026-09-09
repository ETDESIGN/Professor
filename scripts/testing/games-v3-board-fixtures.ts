// games-v3 screenshot fixtures — throwaway live-session camera stand.
//
// Creates a disposable teacher + class + 8 roster kids + a unit whose flow is
// [INTRO_SPLASH, WORD_SEARCH] with 6 vocabulary_items, plus a LIVE
// classroom_sessions row parked on the WORD_SEARCH slide — so a signed-in
// browser tab at /board renders the real game via the normal realtime
// hydration path (same pattern as e2e/dubbingFixtures.ts; signup
// auto-confirms, role stamped via the Management API).
//
// Usage:
//   tsx scripts/testing/games-v3-board-fixtures.ts --setup
//   tsx scripts/testing/games-v3-board-fixtures.ts --teardown
//
// State file: /tmp/games-v3-fixtures.json (between setup and teardown).

import fs from 'node:fs';
import crypto from 'node:crypto';

try { process.loadEnvFile('.env'); } catch { /* already set */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const PAT = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = 'xsdnzijketjnzhakqtit';
const STATE = '/tmp/games-v3-fixtures.json';

if (!SUPABASE_URL || !ANON_KEY || !PAT) {
  console.error('Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}

async function sql(query: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  return Array.isArray(body) ? body : [];
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const j = (o: unknown) => q(JSON.stringify(o));

const KIDS = ['Alice', 'Ben', 'Coco', 'Dudu', 'Emma', 'Fang', 'Gigi', 'Hugo'];
const WORDS: Array<{ word: string; zh: string; def: string; ex: string }> = [
  { word: 'tractor', zh: '拖拉机', def: 'a farm vehicle', ex: 'The tractor is big.' },
  { word: 'leaf', zh: '叶子', def: 'part of a plant', ex: 'A green leaf falls.' },
  { word: 'rock', zh: '岩石', def: 'a big stone', ex: 'I sit on the rock.' },
  { word: 'river', zh: '河', def: 'flowing water', ex: 'The river is long.' },
  { word: 'apple', zh: '苹果', def: 'a red fruit', ex: 'I eat an apple.' },
  { word: 'garden', zh: '花园', def: 'a place with flowers', ex: 'My garden is small.' },
];

async function setup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const password = crypto.randomBytes(12).toString('hex');
  const prefix = `gamesv3-${stamp}`;
  const email = `${prefix}.teacher@passport.local`;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok || !body.user?.id) throw new Error(`signup: ${JSON.stringify(body).slice(0, 200)}`);
  const teacherId: string = body.user.id;
  await sql(`UPDATE public.profiles SET full_name = 'Games V3 Camera', role = 'teacher'::public.user_role WHERE id = ${q(teacherId)}`);

  const classId = crypto.randomUUID();
  await sql(`INSERT INTO public.classes (id, name, teacher_id, code, is_active)
             VALUES (${q(classId)}, ${q(`${prefix} class`)}, ${q(teacherId)}, ${q(stamp.slice(-6))}, true)`);
  for (const kid of KIDS) {
    await sql(`INSERT INTO public.roster_students (class_id, teacher_id, display_name)
               VALUES (${q(classId)}, ${q(teacherId)}, ${q(kid)})`);
  }

  const unitId = crypto.randomUUID();
  const manifest = {
    title: 'Games V3 Camera Unit',
    vocabulary: WORDS.map((w) => ({
      word: w.word, definition: w.def, example_sentence: w.ex,
      translation: w.zh, l1_translation: w.zh,
      image_url: `https://picsum.photos/seed/${w.word}/400/300`,
    })),
  };
  const flow = [
    { id: crypto.randomUUID(), type: 'INTRO_SPLASH', title: 'Unit Intro', data: {} },
    { id: crypto.randomUUID(), type: 'WORD_SEARCH', title: 'Word Search', phase: 'PRACTICE',
      data: { rounds: 3, wordsPerRound: 5, seconds: 120, mode: 'open' } },
  ];
  await sql(`INSERT INTO public.units (id, teacher_id, title, level, status, topic, manifest, flow)
             VALUES (${q(unitId)}, ${q(teacherId)}, ${q(`GAMES-V3 SHOTS ${stamp}`)}, 'A1', 'Active', 'camera', ${j(manifest)}, ${j(flow)})`);

  const vocabRows = WORDS.map((w, i) => `(${q(unitId)}, ${i}, ${q(w.word)}, ${q(w.def)}, ${q(w.ex)}, ${q(w.zh)}, ${q(`https://picsum.photos/seed/${w.word}/400/300`)})`).join(', ');
  await sql(`INSERT INTO public.vocabulary_items (unit_id, order_index, word, definition, example_sentence, l1_translation, image_url)
             VALUES ${vocabRows}`);

  await sql(`INSERT INTO public.classroom_sessions (teacher_id, class_id, unit_id, current_index, status)
             VALUES (${q(teacherId)}, ${q(classId)}, ${q(unitId)}, 1, 'LIVE')`);

  const state = { email, password, teacherId, classId, unitId, prefix };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log('SETUP OK');
  console.log(JSON.stringify(state, null, 2));
}

async function teardown() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
  try {
    await sql(`DELETE FROM public.classroom_sessions WHERE teacher_id = ${q(s.teacherId)}`);
    await sql(`DELETE FROM public.roster_students WHERE teacher_id = ${q(s.teacherId)}`);
    await sql(`DELETE FROM public.classes WHERE id = ${q(s.classId)}`);
    await sql(`DELETE FROM public.units WHERE id = ${q(s.unitId)}`);
    await sql(`DELETE FROM auth.users WHERE id = ${q(s.teacherId)}`); // cascades profiles
    fs.unlinkSync(STATE);
    console.log('TEARDOWN OK');
  } catch (e: any) {
    console.error(`teardown warning: ${e.message}`);
    process.exit(1);
  }
}

const mode = process.argv[2];
if (mode === '--setup') setup().catch((e) => { console.error(e.message); process.exit(1); });
else if (mode === '--teardown') teardown();
else { console.error('usage: --setup | --teardown'); process.exit(2); }
