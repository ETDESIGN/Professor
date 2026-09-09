// Retake 26-preview.png — wait until the preview is rendered AND stable (the
// pool refetch blanks the board to "Loading…" intermittently — audit F15).
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
  await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) {
    try { await page.goto('http://localhost:5173/board', { waitUntil: 'domcontentloaded' }); break; }
    catch { await sleep(1500); }
  }
  // Stability loop: preview must contain the round text + button, twice, 1s apart.
  for (let attempt = 0; attempt < 30; attempt++) {
    const stable = await page.evaluate(() => {
      const t = document.body.innerText;
      return t.includes('Start Round') && /find these \d+ words/i.test(t);
    });
    if (stable) {
      await sleep(1000);
      const again = await page.evaluate(() => {
        const t = document.body.innerText;
        return t.includes('Start Round') && /find these \d+ words/i.test(t);
      });
      if (again) break;
    }
    await sleep(1000);
  }
  await page.screenshot({ path: path.join(OUT, '26-v3-preview.png') });
  console.log('📸 26-preview.png (retaken, stable)');
  await b.close();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
