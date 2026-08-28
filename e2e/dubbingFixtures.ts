// Throwaway dubbing e2e fixtures (Task 12).
//
// Creates a dedicated teacher + 2 students + parent, a throwaway class,
// enrollments and the parent-child link against the live dev project
// (xsdnzijketjnzhakqtit) — same pattern as scripts/testing/dubbing-rls-check.ts
// (signup endpoint auto-confirms emails; profile role stamped via the
// Management API). Everything is removed in cleanup().
//
// Also exposes signed-in supabase-js clients so the spec can assert DB state
// between UI steps (RLS-permitted reads only).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Page } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env is gitignored; parse it manually so the spec works under `playwright test`.
function loadDotEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* optional */ }
}
loadDotEnv();

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const PAT = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = 'xsdnzijketjnzhakqtit';

export type Fixtures = {
  prefix: string;
  password: string;
  ids: Record<string, string>;
  classId: string;
  emails: Record<string, string>;
  clients: Record<string, SupabaseClient>;
  clipTitle: string;
};

export async function sql(query: string): Promise<any[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  return Array.isArray(body) ? body : [];
}

export async function setupFixtures(): Promise<Fixtures> {
  if (!SUPABASE_URL || !ANON_KEY || !PAT) {
    throw new Error('Missing env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_ACCESS_TOKEN');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const password = crypto.randomBytes(12).toString('hex');
  const prefix = `dub-e2e-${stamp}`;
  const emails: Record<string, string> = {};
  const ids: Record<string, string> = {};

  for (const [local, role] of [
    ['teacher', 'teacher'],
    ['student-a', 'student'], // records + publishes
    ['student-b', 'student'], // sees in Friends' videos + likes
    ['parent', 'parent'],     // parent of student-a
  ] as const) {
    const email = `${prefix}.${local}@passport.local`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok || !body.user?.id) throw new Error(`signup ${local}: ${JSON.stringify(body).slice(0, 200)}`);
    emails[local] = email;
    ids[local] = body.user.id;
    await sql(`UPDATE public.profiles SET full_name = '${local}', role = '${role}'::public.user_role WHERE id = '${ids[local]}'`);
  }

  await sql(`INSERT INTO public.classes (id, name, teacher_id, code, is_active)
             VALUES ('${crypto.randomUUID()}', '${prefix} class', '${ids['teacher']}', '${stamp.slice(-6)}', true)`);
  const cls = await sql(`SELECT id FROM public.classes WHERE name = '${prefix} class'`);
  const classId = cls[0].id as string;
  await sql(`INSERT INTO public.class_enrollments (class_id, student_id) VALUES
             ('${classId}', '${ids['student-a']}'), ('${classId}', '${ids['student-b']}')`);
  await sql(`INSERT INTO public.parent_student_links (parent_id, student_id, status, approved_at)
             VALUES ('${ids['parent']}', '${ids['student-a']}', 'active', now())`);

  const clients: Record<string, SupabaseClient> = {};
  for (const local of ['teacher', 'student-a', 'student-b', 'parent']) {
    const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: emails[local], password });
    if (error) throw new Error(`sign in ${local}: ${error.message}`);
    clients[local] = c;
  }

  return { prefix, password, ids, classId, emails, clients, clipTitle: `${prefix} clip` };
}

export async function cleanupFixtures(fx: Fixtures) {
  const P = fx.prefix;
  try {
    // Storage objects must be removed by a permitted owner (SQL delete is
    // blocked by storage.protect_delete).
    const dubPaths = await sql(
      `SELECT DISTINCT t.value AS p FROM public.dubbings d, jsonb_each_text(d.line_audio) t
       WHERE d.student_id IN ('${fx.ids['student-a']}', '${fx.ids['student-b']}')`,
    ).catch(() => [] as any[]);
    if (dubPaths.length > 0) {
      await fx.clients['student-a'].storage
        .from('dubbing-media')
        .remove(dubPaths.map((r: any) => r.p).filter((p: string) => p && p.startsWith(`dubs/${fx.ids['student-a']}/`)));
    }
    const clipVids = await sql(
      `SELECT video_path AS p FROM public.dubbing_clips WHERE title LIKE '${P}%'`,
    ).catch(() => [] as any[]);
    if (clipVids.length > 0) {
      await fx.clients['teacher'].storage.from('dubbing-media').remove(clipVids.map((r: any) => r.p));
    }

    await sql(`DELETE FROM public.dubbing_feedback WHERE dubbing_id IN (SELECT id FROM public.dubbings WHERE student_id IN ('${fx.ids['student-a']}', '${fx.ids['student-b']}'))`);
    await sql(`DELETE FROM public.dubbing_likes WHERE dubbing_id IN (SELECT id FROM public.dubbings WHERE student_id IN ('${fx.ids['student-a']}', '${fx.ids['student-b']}'))`);
    await sql(`DELETE FROM public.dubbings WHERE student_id IN ('${fx.ids['student-a']}', '${fx.ids['student-b']}')`);
    await sql(`DELETE FROM public.dubbing_clip_lines WHERE clip_id IN (SELECT id FROM public.dubbing_clips WHERE title LIKE '${P}%')`);
    await sql(`DELETE FROM public.dubbing_clips WHERE title LIKE '${P}%'`);
    await sql(`DELETE FROM public.parent_student_links WHERE parent_id = '${fx.ids['parent']}'`);
    await sql(`DELETE FROM public.class_enrollments WHERE class_id = '${fx.classId}'`);
    await sql(`DELETE FROM public.classes WHERE id = '${fx.classId}'`);
    await sql(`DELETE FROM auth.users WHERE email LIKE '${P.toLowerCase()}.%@passport.local'`); // cascades profiles
  } catch (e: any) {
    console.warn(`dubbing fixture cleanup warning: ${e.message}`);
  }
}

/** UI login with dynamic credentials (same flow as e2e/auth.helpers.ts loginAs). */
export async function loginWithEmail(page: Page, email: string, password: string, role: 'teacher' | 'student' | 'parent') {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  const roleButton = page.locator(`button:has-text("${role.charAt(0).toUpperCase() + role.slice(1)}")`).first();
  if (await roleButton.count() > 0 && await roleButton.isVisible()) {
    await roleButton.click();
  }
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(teacher|student|parent)/, { timeout: 20000 });
}
