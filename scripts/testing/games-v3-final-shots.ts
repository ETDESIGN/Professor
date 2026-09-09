// Slim pass: with the fixture unit set to rounds:1, capture the FINAL screen
// (summary → See Results → stars) — the round-3 path in the main shots script
// is blocked by the intermittent stuck-loading flake (audit finding F15).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-fixtures.json', 'utf-8'));
const BASE = 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: Page, name: string) {
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log(`📸 ${name}`);
}

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 })).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) {
    try { await page.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; }
    catch { await sleep(1500); }
  }
  await page.waitForSelector('text=Start Round', { timeout: 40000 });
  await sleep(2500);
  await page.waitForSelector('text=Start Round', { timeout: 30000 });
  await page.locator('button:has-text("Start Round")').click();
  await page.waitForSelector('text=/5 found', { timeout: 20000 });
  for (let i = 0; i < 5; i++) {
    await page.locator('button:has-text("Reveal a word")').click();
    await sleep(400);
  }
  await page.waitForSelector('text=COMPLETE!', { timeout: 10000 });
  await page.locator('button:has-text("See Results")').click({ force: true });
  await page.waitForSelector('text=THE END', { timeout: 10000 });
  await shot(page, '26-final.png');
  console.log('DONE');
  await b.close();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
