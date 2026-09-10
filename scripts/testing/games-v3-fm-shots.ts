// games-v3 FLASH MATCH v3 UI verification shots — batch fixture slide 4.
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
  await sql(`UPDATE public.classroom_sessions SET current_index = 4, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);
  await page.waitForSelector('text=Fresh deal', { timeout: 25000 }).catch(() => console.log('banner missing'));
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, '11-flash-match-v3-fresh.png') });
  const probe = await page.evaluate(() => ({
    words: Array.from(document.querySelectorAll('main section:first-child button')).length,
    photos: Array.from(document.querySelectorAll('main section:last-child button')).length,
    banner: document.body.innerText.includes('pairs hidden'),
  }));
  console.log('probe:', JSON.stringify(probe), '📸 fresh');

  // select word → sky state
  await page.locator('main section:first-child button').first().click();
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, '11-flash-match-v3-selected.png') });
  console.log('📸 selected');

  await page.setViewportSize({ width: 700, height: 320 });
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '11-flash-match-v3-floor.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | overflow:', overflow);
  await b.close();
}
main().catch((e) => { console.error('FM SHOTS FAILED:', e.message); process.exit(1); });
