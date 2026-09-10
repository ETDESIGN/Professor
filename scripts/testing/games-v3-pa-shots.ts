// games-v3 PHONICS ARENA v3 UI verification shots — batch fixture slide 12.
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
  await sql(`UPDATE public.classroom_sessions SET current_index = 12, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);
  await page.waitForSelector('text=Which word did you hear', { timeout: 25000 }).catch(() => console.log('prompt missing'));
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, '22-phonics-v3-duel.png') });
  console.log('📸 duel (tier strip + hub + tablets)');

  // tablet count + replay metering probe
  const probe = await page.evaluate(() => ({
    tablets: document.querySelectorAll('.grid > button').length,
    replayBtn: !!document.querySelector('button[aria-label="Replay the target audio"]'),
  }));
  console.log('probe:', JSON.stringify(probe));
  // click replay twice → expect −1 pt pill to appear (metered)
  await page.click('button[aria-label="Replay the target audio"]');
  await sleep(400);
  await page.click('button[aria-label="Replay the target audio"]');
  await sleep(400);
  const pill = await page.evaluate(() => document.body.innerText.includes('−2 pts') || document.body.innerText.includes('−1 pt'));
  console.log('metering pill appears:', pill);
  await page.screenshot({ path: path.join(OUT, '22-phonics-v3-metered.png') });
  console.log('📸 metered replay');

  // phone floor
  await page.setViewportSize({ width: 700, height: 320 });
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, '22-phonics-v3-floor.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | overflow:', overflow);
  await b.close();
}
main().catch((e) => { console.error('PA SHOTS FAILED:', e.message); process.exit(1); });
