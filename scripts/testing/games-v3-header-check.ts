// Capture the play stage to verify the header clears the shell phase badge.
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
  for (let i = 0; i < 3; i++) { try { await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await page.goto('http://localhost:5173/board', { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('text=Start Round', { timeout: 40000 });
  await sleep(2500);
  await page.waitForSelector('text=Start Round', { timeout: 30000 });
  await page.locator('button:has-text("Start Round")').click();
  await page.waitForSelector('.ws-gridcard', { timeout: 20000 });
  await sleep(1200);
  // overlap check: phase badge vs the game's W badge / title bounding boxes
  const m = await page.evaluate(() => {
    const badge = Array.from(document.querySelectorAll('span')).find((e) => (e.textContent || '').trim().toUpperCase() === 'PRACTICE');
    const header = document.querySelector('header');
    const wb = badge?.getBoundingClientRect();
    const hr = header?.getBoundingClientRect();
    let overlap = null;
    if (wb && hr) overlap = !(wb.right < hr.left + 150); // header content starts after pl-40
    return { badge: wb ? { l: Math.round(wb.left), r: Math.round(wb.right), t: Math.round(wb.top), b: Math.round(wb.bottom) } : null, headerLeft: hr ? Math.round(hr.left) : null, plOk: overlap === false };
  });
  console.log(JSON.stringify(m));
  await page.screenshot({ path: path.join(OUT, '26-v3-play-header-fixed.png') });
  console.log('📸 26-v3-play-header-fixed.png');
  await b.close();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
