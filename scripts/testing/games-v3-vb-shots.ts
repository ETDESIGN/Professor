// games-v3 VOCAB BLITZ v3 UI verification shots — batch fixture slide 19.
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

const sql = async (q: string) => (await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query', {
  method: 'POST',
  headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q }),
})).json();

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
  await sql(`UPDATE public.classroom_sessions SET current_index = 19, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);
  await page.waitForSelector('text=Confidence gate', { timeout: 25000 }).catch(() => console.log('gate text missing'));
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '32-vocab-blitz-v3-gate.png') });
  console.log('📸 confidence gate');

  // choose HIGH ROLLER (2x) → sprint state
  await page.locator('text=HIGH ROLLER').first().click({ timeout: 6000 }).catch((e) => console.log('pod click failed:', e.message.slice(0, 90)));
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, '32-vocab-blitz-v3-sprint.png') });
  const probe = await page.evaluate(() => ({
    locked: document.body.innerText.includes('2x multiplier locked'),
    clock: /Speed clock|\ds/.test(document.body.innerText),
    opts: document.querySelectorAll('.grid > button').length,
  }));
  console.log('sprint probe:', JSON.stringify(probe));

  // phone floor on the gate
  await page.setViewportSize({ width: 700, height: 320 });
  await sleep(1500);
  await sql(`UPDATE public.classroom_sessions SET current_index = 19, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);
  await sleep(2600);
  await page.screenshot({ path: path.join(OUT, '32-vocab-blitz-v3-floor.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | overflow:', overflow);
  await b.close();
}
main().catch((e) => { console.error('VB SHOTS FAILED:', e.message); process.exit(1); });
