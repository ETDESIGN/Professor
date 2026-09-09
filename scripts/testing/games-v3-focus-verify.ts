// Visual verification of the Focus Cards v3 implementation on the live board.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-fixtures.json', 'utf-8'));
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
  for (let i = 0; i < 3; i++) { try { await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await page.goto('http://localhost:5173/board', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }

  await page.waitForSelector('text=Focus Cards', { timeout: 40000 });
  await sleep(2500);
  await page.waitForSelector('text=Focus Cards', { timeout: 30000 });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, '05-v3-grid.png') });
  console.log('📸 05-v3-grid.png');

  // flip a card (click the leaf image area — first card slot)
  await page.locator('.fc-3d').nth(1).click({ force: true });
  await sleep(1100);
  await page.screenshot({ path: path.join(OUT, '05-v3-flipped.png') });
  console.log('📸 05-v3-flipped.png');

  // deep-dive modal
  const plus = page.locator('[title*="Deep dive"]').first();
  await plus.click({ force: true });
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, '05-v3-deep-dive.png') });
  console.log('📸 05-v3-deep-dive.png');
  await page.locator('text=Back to cards').click();
  await sleep(600);

  // flip all → completion
  await page.locator('button:has-text("Flip all")').click({ force: true });
  await sleep(2500);
  const done = await page.evaluate(() => document.body.innerText.includes('words explored'));
  await page.screenshot({ path: path.join(OUT, done ? '05-v3-completion.png' : '05-v3-flipall.png') });
  console.log(done ? '📸 05-v3-completion.png' : '📸 05-v3-flipall.png (completion not reached)');
  await b.close();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
