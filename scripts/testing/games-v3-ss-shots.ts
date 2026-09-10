// games-v3 STORY STAGE theater verification — board + commander tab pair.
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
  method: 'POST', headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
})).json();

async function login(page: any) {
  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher|board/, { timeout: 25000 });
}

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 });
  const board = await ctx.newPage();
  const commander = await ctx.newPage();
  board.on('pageerror', (e: any) => console.log('[board error]', e.message.slice(0, 140)));
  await login(board);
  await login(commander);
  for (let i = 0; i < 3; i++) { try { await commander.goto(BASE + '/teacher/live', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(3000);
  for (let i = 0; i < 3; i++) { try { await board.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(2500);
  await sql(`UPDATE public.classroom_sessions SET current_index = 2, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);
  await board.waitForSelector('text=READING THEATER|Story', { timeout: 30000 }).catch(() => console.log('hook text missing'));
  await sleep(1500);
  await board.screenshot({ path: path.join(OUT, '07-story-stage-v3-hook.png') });
  console.log('📸 hook');
  // advance: hook → page 1 (theater) via commander's Next Page
  await commander.locator('button', { hasText: 'Next Page' }).first().click({ timeout: 15000 }).catch(async (e: any) => {
    console.log('commander next failed:', e.message.slice(0, 80));
  });
  await board.waitForSelector('text=SPEAKING NOW', { timeout: 20000 }).catch(() => console.log('theater missing'));
  await sleep(1500);
  await board.screenshot({ path: path.join(OUT, '07-story-stage-v3-theater.png') });
  console.log('📸 theater');
  const probe = await board.evaluate(() => ({
    line: document.body.innerText.includes('LINE 01'),
    replay: document.body.innerText.includes('REPLAY AUDIO LINE'),
    progress: document.body.innerText.includes('% COMPLETED'),
    next: !!Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Next Line')),
  }));
  console.log('probe:', JSON.stringify(probe));
  await board.setViewportSize({ width: 700, height: 320 });
  await sleep(1500);
  await board.screenshot({ path: path.join(OUT, '07-story-stage-v3-floor.png') });
  const overflow = await board.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | overflow:', overflow);
  await b.close();
}
main().catch((e) => { console.error('SS SHOTS FAILED:', e.message); process.exit(1); });
