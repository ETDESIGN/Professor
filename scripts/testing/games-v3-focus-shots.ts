// Capture Focus Cards states: grid, drill stage 1, and (via a second
// commander tab clicking the real Flip Card button) drill stage 3.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-fixtures.json', 'utf-8'));
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 });
  const board = await ctx.newPage();
  for (let i = 0; i < 3; i++) { try { await board.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await board.waitForSelector('input[type="email"]', { timeout: 30000 });
  await board.locator('input[type="email"]').first().fill(s.email);
  await board.locator('input[type="password"]').first().fill(s.password);
  await board.locator('button[type="submit"]').first().click();
  await board.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await board.goto('http://localhost:5173/board', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }

  await board.waitForSelector('text=Today', { timeout: 40000 });
  await sleep(2000);
  await board.screenshot({ path: path.join(OUT, '05-grid.png') });
  console.log('📸 05-grid.png');

  await board.locator('button:has-text("tractor"), img[alt="tractor"]').first().click().catch(async () => {
    // fallback: click the first card slot
    await board.locator('.grid button').first().click();
  });
  await board.waitForSelector('text=Listen', { timeout: 10000 }).catch(() => {});
  await sleep(1200);
  await board.screenshot({ path: path.join(OUT, '05-drill-stage1.png') });
  console.log('📸 05-drill-stage1.png');

  // Second tab = the teacher commander (same session) → real Flip Card presses.
  const cmdr = await ctx.newPage();
  for (let i = 0; i < 3; i++) { try { await cmdr.goto('http://localhost:5173/teacher/live', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(4000);
  const flip = cmdr.locator('button:has-text("Flip Card")').first();
  if (await flip.count() > 0) {
    await flip.click().catch(() => {});
    await sleep(800);
    await flip.click().catch(() => {});
    await sleep(1500);
    await board.screenshot({ path: path.join(OUT, '05-drill-stage3.png') });
    console.log('📸 05-drill-stage3.png (via commander Flip)');
  } else {
    console.log('commander Flip button not found — stage 3 not captured (see finding F5)');
  }
  await b.close();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
