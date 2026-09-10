// games-v3 UNSCRAMBLE v3 UI verification shots — batch fixture slide 5.
// Captures: fresh deal, mid-assembly, snapped-correct feedback, phone floor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-batch.json', 'utf-8'));
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'));
const PAT = process.env.SUPABASE_ACCESS_TOKEN!;
const BASE = 'http://localhost:5199';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sql(query: string): Promise<any[]> {
  const res = await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
  return res.json();
}
const setSlide = (index: number) =>
  sql(`UPDATE public.classroom_sessions SET current_index = ${index}, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher|board/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(2500);

  await setSlide(5); // unscramble in the batch flow
  await page.waitForSelector('text=Word Bank', { timeout: 25000 }).catch(() => console.log('no Word Bank text'));
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '12-unscramble-v3-fresh.png') });
  console.log('📸 fresh');

  // target order from the pool (match tray words against WORD_BANK_BUILD/TRANSFORM)
  const trayTexts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button.un-block')).map(el => el.textContent?.trim() || ''));
  console.log('tray:', trayTexts);
  let target: string[] = [];
  try {
    const rows = await sql(`SELECT exercise_type, content FROM public.pool_items WHERE unit_id = '${s.unitId}' AND exercise_type IN ('WORD_BANK_BUILD','TRANSFORM') LIMIT 12`);
    for (const r of rows) {
      const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
      const t: string[] = r.exercise_type === 'WORD_BANK_BUILD'
        ? String(c?.target_sentence || '').split(/\s+/).filter(Boolean)
        : String(c?.options?.[c.correct_index] ?? '').split(/\s+/).filter(Boolean);
      const bank: string[] = r.exercise_type === 'WORD_BANK_BUILD'
        ? (c?.word_bank || t).map((w: any) => String(w))
        : t;
      const traySet = new Set(trayTexts);
      if (t.length > 0 && bank.every((w: string) => traySet.has(w))) { target = t; break; }
    }
  } catch (e: any) { console.log('pool match failed:', e.message.slice(0, 120)); }
  console.log('target sentence:', target.join(' ') || '(unmatched)');

  // mid-assembly: place first two words of the target
  for (const w of target.slice(0, 2)) {
    await page.locator('button.un-block', { hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') }).first().click({ timeout: 4000 }).catch((e) => console.log('place click failed:', e.message.slice(0, 90)));
    await sleep(350);
  }
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '12-unscramble-v3-assembly.png') });
  console.log('📸 assembly (snapped amber blocks)');

  // complete the sentence in target order + check
  for (const w of target.slice(2)) {
    await page.locator('button.un-block', { hasText: new RegExp(`^${w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') }).first().click({ timeout: 4000 }).catch(() => {});
    await sleep(250);
  }
  await page.locator('button', { hasText: 'Check Answer' }).first().click({ timeout: 5000 }).catch((e) => console.log('check failed:', e.message.slice(0, 90)));
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, '12-unscramble-v3-correct.png') });
  console.log('📸 correct feedback');

  // phone floor
  await page.setViewportSize({ width: 700, height: 320 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '12-unscramble-v3-floor.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | page overflow:', overflow);

  await b.close();
}
main().catch((e) => { console.error('UN SHOTS FAILED:', e.message); process.exit(1); });
