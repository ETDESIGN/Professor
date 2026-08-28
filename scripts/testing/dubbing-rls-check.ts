// Dubbing module RLS verification (video-dubbing Task 2).
//
//   npm run test:dubbing-rls
//
// Verifies the RLS policies + storage rules from
// supabase/migrations/20260828000002_dubbing_module.sql and
// 20260828000003_dubbing_rls_fixes.sql against the live cloud project.
//
// Fixture users/classes are created via the Supabase Management API
// (SUPABASE_ACCESS_TOKEN) and removed at the end. Authenticated checks run
// through supabase-js with per-user signInWithPassword (pattern from
// scripts/testing/basket-e2e.ts).
//
// 10 checks (brief 1-6 + carried review items a-d), each PASS/FAIL,
// exit non-zero on any FAIL.

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const PAT = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = 'xsdnzijketjnzhakqtit';

if (!SUPABASE_URL || !ANON_KEY || !PAT) {
  console.error('Missing env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_ACCESS_TOKEN)');
  process.exit(2);
}

const failures: string[] = [];
const check = (ok: boolean, label: string, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(label);
};

// --- Management API SQL (service-level, bypasses RLS) -----------------------
async function sql(query: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${JSON.stringify(body).slice(0, 400)}\n${query.slice(0, 200)}`);
  return Array.isArray(body) ? body : [];
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const pw = crypto.randomBytes(12).toString('hex');
  const P = `dubbing-rls-${stamp}`;
  const mk = (local: string) => `${P}.${local}@passport.local`;

  console.log(`Fixture prefix: ${P}`);
  const ids: Record<string, string> = {};

  // --- 1. create auth users + profiles ---
  for (const [local, role] of [
    ['teacher-a', 'teacher'], ['teacher-b', 'teacher'],
    ['student-a', 'student'], ['student-b', 'student'], ['student-c', 'student'],
    ['parent-p', 'parent'],
  ] as const) {
    const email = mk(local);
    // Create via the public signup endpoint (GoTrue-compatible user+identity
    // rows, auto-confirmed on this project), then stamp the profile role via SQL.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    const body = await res.json();
    if (!res.ok || !body.user?.id) throw new Error(`signup ${local}: ${JSON.stringify(body).slice(0, 200)}`);
    ids[local] = body.user.id;
    await sql(`UPDATE public.profiles SET full_name = '${local}', role = '${role}'::public.user_role WHERE id = '${ids[local]}'`);
  }

  // --- 2. classes, enrollments, parent link ---
  await sql(`INSERT INTO public.classes (id, name, teacher_id, code, is_active)
             VALUES (gen_random_uuid(), '${P} class A', '${ids['teacher-a']}', '${stamp}A', true),
                    (gen_random_uuid(), '${P} class B', '${ids['teacher-b']}', '${stamp}B', true)`);
  const cls = await sql(`SELECT id, name FROM public.classes WHERE name LIKE '${P}%'`);
  const classA = cls.find((c: any) => c.name.endsWith('A'))!.id as string;
  const classB = cls.find((c: any) => c.name.endsWith('B'))!.id as string;

  await sql(`INSERT INTO public.class_enrollments (class_id, student_id) VALUES
             ('${classA}', '${ids['student-a']}'), ('${classA}', '${ids['student-b']}'), ('${classB}', '${ids['student-c']}')`);
  await sql(`INSERT INTO public.parent_student_links (parent_id, student_id, status, approved_at)
             VALUES ('${ids['parent-p']}', '${ids['student-b']}', 'active', now())`);

  // --- 3. clips + dubs ---
  const clip1Vid = `clips/${stamp}-clip1.mp4`; // class A, assigned
  const clip2Vid = `clips/${stamp}-clip2.mp4`; // class A, draft
  const clip3Vid = `clips/${stamp}-clip3.mp4`; // class B, assigned
  await sql(`INSERT INTO public.dubbing_clips (id, class_id, title, video_path, video_duration_ms, status, created_by)
             VALUES (gen_random_uuid(), '${classA}', '${P} c1', '${clip1Vid}', 1000, 'assigned', '${ids['teacher-a']}'),
                    (gen_random_uuid(), '${classA}', '${P} c2', '${clip2Vid}', 1000, 'draft',    '${ids['teacher-a']}'),
                    (gen_random_uuid(), '${classB}', '${P} c3', '${clip3Vid}', 1000, 'assigned', '${ids['teacher-b']}')`);
  const clips = await sql(`SELECT id, title FROM public.dubbing_clips WHERE title LIKE '${P}%'`);
  const clip1 = clips.find((c: any) => c.title.endsWith('c1'))!.id as string;
  const clip2 = clips.find((c: any) => c.title.endsWith('c2'))!.id as string;
  const clip3 = clips.find((c: any) => c.title.endsWith('c3'))!.id as string;

  const pubBlob = `dubs/${ids['student-b']}/${stamp}-pub.webm`;
  const unpubBlob = `dubs/${ids['student-b']}/${stamp}-unpub.webm`;
  await sql(`INSERT INTO public.dubbings (id, clip_id, student_id, line_audio, attempt_no, is_published, published_at)
             VALUES (gen_random_uuid(), '${clip1}', '${ids['student-b']}', jsonb_build_object('L1','${unpubBlob}'), 1, false, NULL),
                    (gen_random_uuid(), '${clip1}', '${ids['student-b']}', jsonb_build_object('L1','${pubBlob}'), 2, true, now()),
                    (gen_random_uuid(), '${clip1}', '${ids['student-b']}', '{}', 3, true, now())`);
  await sql(`INSERT INTO public.dubbings (id, clip_id, student_id, line_audio, attempt_no, is_published)
             VALUES (gen_random_uuid(), '${clip3}', '${ids['student-c']}', '{}', 1, false)`);
  const dubs = await sql(`SELECT id, attempt_no FROM public.dubbings WHERE student_id = '${ids['student-b']}'`);
  const dubUnpub = dubs.find((d: any) => d.attempt_no === 1)!.id as string;
  const dubPub = dubs.find((d: any) => d.attempt_no === 2)!.id as string;
  const dubDel = dubs.find((d: any) => d.attempt_no === 3)!.id as string;

  // --- 4. storage objects (uploaded through the real policies) ---
  const anon = (as: string) => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  async function signIn(local: string): Promise<SupabaseClient> {
    const c = anon(local);
    const { error } = await c.auth.signInWithPassword({ email: mk(local), password: pw });
    if (error) throw new Error(`sign in ${local}: ${error.message}`);
    return c;
  }
  const teacherA = await signIn('teacher-a');
  const teacherB = await signIn('teacher-b');
  const studentA = await signIn('student-a');
  const studentB = await signIn('student-b');
  const studentC = await signIn('student-c');
  const parentP = await signIn('parent-p');

  const blob = new Uint8Array([1, 2, 3]);
  const up = async (client: SupabaseClient, p: string) =>
    (await client.storage.from('dubbing-media').upload(p, blob, { contentType: 'audio/webm' })).error;
  const down = async (client: SupabaseClient, p: string) =>
    (await client.storage.from('dubbing-media').download(p)).error;

  const e1 = await up(teacherA, clip1Vid); const e2 = await up(teacherA, clip2Vid); const e3 = await up(teacherB, clip3Vid);
  const e4 = await up(studentB, unpubBlob); const e5 = await up(studentB, pubBlob);
  const cBlob = `dubs/${ids['student-c']}/${stamp}-c.webm`; const e6 = await up(studentC, cBlob);
  if (e1 || e2 || e3 || e4 || e5 || e6) throw new Error(`fixture upload failed: ${e1 || e2 || e3 || e4 || e5 || e6}`);

  const errOk = (e: any) => e === null;
  const errDeny = (e: any) => e !== null;

  // --- Check 1: student visibility of dubs ---
  console.log('\n[1] Student dub visibility');
  {
    const r1 = await studentA.from('dubbings').select('id').eq('id', dubUnpub);
    check(r1.data?.length === 0 && !r1.error, 'A cannot select B\'s unpublished dub');
    const r2 = await studentA.from('dubbings').select('id').eq('id', dubPub);
    check(r2.data?.length === 1 && !r2.error, 'A can select B\'s published dub (same class)');
    const r3 = await studentC.from('dubbings').select('id').eq('id', dubPub);
    check(r3.data?.length === 0, 'C (other class) cannot select B\'s published dub');
  }

  // --- Check 2: dub updates / teacher moderation ---
  // NOTE: RLS USING filters silently yield 0 updated rows (no error), so
  // denials are detected via .select() returning no rows.
  console.log('\n[2] Dub updates');
  {
    const r1 = await studentA.from('dubbings').update({ is_published: false }).eq('id', dubPub).select('id');
    check(!!r1.error || r1.data?.length === 0, 'student cannot update another student\'s dub', r1.error?.message.slice(0, 60));
    const r2 = await teacherB.from('dubbings').update({ is_published: false, published_at: null }).eq('id', dubPub).select('id');
    check(!!r2.error || r2.data?.length === 0, 'teacher from another class cannot update', r2.error?.message.slice(0, 60));
    const r3 = await teacherA.from('dubbings').update({ is_published: false, published_at: null }).eq('id', dubPub).select('id');
    check(!r3.error && r3.data?.length === 1, 'class teacher CAN unpublish', r3.error?.message.slice(0, 60));
    // restore published state for the later like/blob checks
    const r4 = await studentB.from('dubbings').update({ is_published: true, published_at: new Date().toISOString() }).eq('id', dubPub);
    if (r4.error) throw new Error(`restore publish failed: ${r4.error.message}`);
  }

  // --- Check 3: parent access ---
  console.log('\n[3] Parent access');
  {
    const r1 = await parentP.from('dubbings').select('id').eq('id', dubUnpub);
    check(r1.data?.length === 1 && !r1.error, 'parent selects own child\'s unpublished dub');
    const r2 = await parentP.from('dubbings').select('id').eq('id', (await sql(`SELECT id FROM public.dubbings WHERE student_id='${ids['student-c']}'`))[0].id);
    check(r2.data?.length === 0, 'parent cannot select another child\'s dub');
    const r3 = await parentP.from('dubbings').delete().eq('id', dubDel);
    check(!r3.error, 'parent deletes own child\'s dub', r3.error?.message.slice(0, 60));
  }

  // --- Check 4: likes ---
  console.log('\n[4] Likes');
  {
    const r1 = await studentA.from('dubbing_likes').insert({ dubbing_id: dubPub, student_id: ids['student-a'] });
    check(!r1.error, 'student likes published same-class dub', r1.error?.message.slice(0, 60));
    const r2 = await studentA.from('dubbing_likes').insert({ dubbing_id: dubPub, student_id: ids['student-c'] });
    check(!!r2.error, 'cannot insert a like as someone else', r2.error?.message.slice(0, 60));
  }

  // --- Check 5: draft clip dubs blocked ---
  console.log('\n[5] Draft clip');
  {
    const r = await studentB.from('dubbings').insert({ clip_id: clip2, student_id: ids['student-b'] });
    check(!!r.error, 'student cannot dub a draft clip', r.error?.message.slice(0, 60));
  }

  // --- Check 6: storage uploads ---
  console.log('\n[6] Storage upload paths');
  {
    check(errDeny(await up(studentA, `clips/${stamp}-hack.mp4`)), 'student cannot upload to clips/');
    check(errDeny(await up(studentA, `dubs/${ids['student-c']}/${stamp}-hack.webm`)), 'student cannot upload under another student\'s dubs/ path');
    const ownPath = `dubs/${ids['student-a']}/${stamp}-own.webm`;
    check(errOk(await up(studentA, ownPath)), 'student CAN upload under own dubs/ path');
    check(errOk(await down(studentA, ownPath)), 'student CAN read own not-yet-referenced blob');
  }

  // --- Check 7 (item a): dub blob reads, exact-path + role gated ---
  console.log('\n[7] (a) Storage dub-blob reads (exact match, role/published gated)');
  {
    { const e = await down(studentA, pubBlob); check(errOk(e), 'classmate reads published dub blob', JSON.stringify(e)); }
    check(errDeny(await down(studentA, unpubBlob)), 'classmate cannot read unpublished dub blob');
    check(errOk(await down(parentP, unpubBlob)), 'parent reads own child\'s unpublished dub blob');
    check(errOk(await down(teacherA, unpubBlob)), 'teacher reads dubs of own class');
    check(errDeny(await down(studentA, cBlob)), 'student cannot read other-class dub blob');
  }

  // --- Check 8 (item b): clip video reads ---
  console.log('\n[8] (b) Storage clip-video reads (exact video_path, assigned + own class)');
  {
    check(errOk(await down(studentA, clip1Vid)), 'student reads own class assigned clip video');
    check(errDeny(await down(studentA, clip2Vid)), 'student cannot read draft clip video');
    check(errDeny(await down(studentA, clip3Vid)), 'student cannot read other-class clip video');
    check(errDeny(await down(teacherB, clip1Vid)), 'non-managing teacher cannot read clip video');
    check(errOk(await down(teacherA, clip1Vid)), 'managing teacher reads clip video');
  }

  // --- Check 9 (item c): enrollment semantics ---
  console.log('\n[9] (c) class_enrollments semantics');
  {
    const cols = await sql(`SELECT column_name FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='class_enrollments'`);
    const hasStatus = cols.some((c: any) => c.column_name === 'status');
    check(!hasStatus, 'class_enrollments has no status column (plain enrollment = active)');
    const pols = await sql(`SELECT count(*)::int AS n FROM pg_policy
                            WHERE pg_get_expr(polqual, polrelid) LIKE '%class_enrollments%'`);
    check(pols[0].n > 0, 'existing policies use plain class_enrollments (student_class_ids aligned)', `${pols[0].n} policies`);
  }

  // --- Check 10 (item d): teacher update column guard ---
  console.log('\n[10] (d) Teacher update guard (unpublish-only)');
  {
    const r1 = await teacherA.from('dubbings').update({ line_audio: { L1: 'dubs/hacked/x.webm' } }).eq('id', dubUnpub);
    check(!!r1.error && /unpublish/.test(r1.error?.message || ''), 'teacher cannot change line_audio', r1.error?.message.slice(0, 80));
    const r2 = await teacherA.from('dubbings').update({ per_line_scores: { L1: { band: 'great' } } }).eq('id', dubUnpub);
    check(!!r2.error && /unpublish/.test(r2.error?.message || ''), 'teacher cannot change per_line_scores', r2.error?.message.slice(0, 80));
    const r3 = await teacherA.from('dubbings').update({ student_id: ids['student-a'] }).eq('id', dubUnpub);
    check(!!r3.error, 'teacher cannot change student_id', r3.error?.message.slice(0, 80));
    const r4 = await teacherA.from('dubbings').update({ is_published: true }).eq('id', dubUnpub);
    check(!!r4.error && /unpublish/.test(r4.error?.message || ''), 'teacher cannot republish', r4.error?.message.slice(0, 80));
    const r5 = await studentB.from('dubbings').update({ is_published: true, published_at: new Date().toISOString() }).eq('id', dubUnpub);
    check(!r5.error, 'owner student can still publish/update own dub', r5.error?.message.slice(0, 80));
  }

  // --- cleanup ---
  console.log('\nCleanup…');
  try {
    // storage objects via the API as their permitted owners (SQL delete is
    // blocked by storage.protect_delete)
    const removals: Array<[SupabaseClient, string[]]> = [
      [studentA, [`dubs/${ids['student-a']}/${stamp}-own.webm`]],
      [studentB, [unpubBlob, pubBlob]],
      [studentC, [cBlob]],
      [teacherA, [clip1Vid, clip2Vid]],
      [teacherB, [clip3Vid]],
    ];
    for (const [client, paths] of removals) {
      const { error } = await client.storage.from('dubbing-media').remove(paths);
      if (error) console.warn(`  object remove warning (${paths[0]}): ${error.message}`);
    }
    await sql(`DELETE FROM public.dubbing_feedback WHERE dubbing_id IN (SELECT id FROM public.dubbings WHERE student_id IN ('${ids['student-a']}','${ids['student-b']}','${ids['student-c']}'))`);
    await sql(`DELETE FROM public.dubbing_likes WHERE dubbing_id IN (SELECT id FROM public.dubbings WHERE student_id IN ('${ids['student-a']}','${ids['student-b']}','${ids['student-c']}'))`);
    await sql(`DELETE FROM public.dubbings WHERE student_id IN ('${ids['student-a']}','${ids['student-b']}','${ids['student-c']}')`);
    await sql(`DELETE FROM public.dubbing_clip_lines WHERE clip_id IN (SELECT id FROM public.dubbing_clips WHERE title LIKE '${P}%' OR created_by IN ('${ids['teacher-a']}','${ids['teacher-b']}') AND title LIKE '${P}%')`);
    await sql(`DELETE FROM public.dubbing_clips WHERE title LIKE '${P}%'`);
    await sql(`DELETE FROM public.parent_student_links WHERE parent_id = '${ids['parent-p']}'`);
    await sql(`DELETE FROM public.class_enrollments WHERE class_id IN (SELECT id FROM public.classes WHERE name LIKE '${P}%')`);
    await sql(`DELETE FROM public.classes WHERE name LIKE '${P}%'`);
    await sql(`DELETE FROM auth.users WHERE email LIKE '${P.toLowerCase()}.%@passport.local'`); // cascades profiles (GoTrue lowercases emails)
    console.log('  fixtures removed');
  } catch (e: any) {
    console.warn(`  cleanup warning: ${e.message}`);
  }

  if (failures.length) {
    console.error(`\n✗ RLS CHECK FAILURES (${failures.length}): ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\n✓ All dubbing RLS checks green.');
}

main().catch((e) => { console.error(e); process.exit(2); });
