// games-v3 F0 regression gate — the redesigned Word Search must show a real
// grid at EVERY size (the old one rendered 0–13 px). Measures .ws-gridcard at
// 1920×1080, 1280×720, 1279×719 and the 700×320 phone-landscape floor, checks
// no page scroll, and captures after-shots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-fixtures.json', 'utf-8'));
const BASE = 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SIZES: Array<{ name: string; w: number; h: number; min: number }> = [
  { name: '1920x1080', w: 1920, h: 1080, min: 300 },
  { name: '1280x720', w: 1280, h: 720, min: 300 },
  { name: '1279x719', w: 1279, h: 719, min: 300 },
  { name: '700x320-phone-floor', w: 700, h: 320, min: 50 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results: Array<Record<string, unknown>> = [];
  let failed = false;

  for (const size of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (let i = 0; i < 3; i++) {
      try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; }
      catch { await sleep(1500); }
    }
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
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
    await page.waitForSelector('.ws-gridcard', { timeout: 20000 });
    await sleep(1500);

    const m = await page.evaluate(() => {
      const g = document.querySelector('.ws-gridcard') as HTMLElement | null;
      const r = g?.getBoundingClientRect();
      const doc = document.scrollingElement as HTMLElement | null;
      return {
        grid: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        scroll: doc ? { scrollH: doc.scrollHeight, inner: window.innerHeight } : null,
      };
    });
    const gridW = m.grid?.w ?? 0;
    const ok = gridW >= size.min && (!m.scroll || m.scroll.scrollH <= m.scroll.inner + 2);
    if (!ok) failed = true;
    results.push({ size: size.name, grid: m.grid, scroll: m.scroll, pass: ok, min: size.min });

    if (size.name === '1279x719') {
      await page.screenshot({ path: path.join(OUT, '26-v3-play.png') });
      console.log('📸 26-v3-play.png');
    }
    if (size.name === '1920x1080') {
      await page.screenshot({ path: path.join(OUT, '26-v3-play-1920.png') });
      console.log('📸 26-v3-play-1920.png');
    }
    if (size.name === '700x320-phone-floor') {
      await page.screenshot({ path: path.join(OUT, '26-v3-play-phone-floor.png') });
      console.log('📸 26-v3-play-phone-floor.png');
    }
    await ctx.close();
  }

  // Preview + summary captures at 1279.
  {
    const ctx = await browser.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (let i = 0; i < 3; i++) {
      try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; }
      catch { await sleep(1500); }
    }
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
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
    await page.screenshot({ path: path.join(OUT, '26-v3-preview.png') });
    console.log('📸 26-v3-preview.png');
    await page.locator('button:has-text("Start Round")').click();
    await page.waitForSelector('.ws-gridcard', { timeout: 20000 });
    // reveal through the round — loop until a summary variant appears
    for (let i = 0; i < 10; i++) {
      const done = await page.evaluate(() =>
        document.body.innerText.includes("Let's learn these words") ||
        document.body.innerText.includes('Great search!'));
      if (done) break;
      const btn = page.locator('button:has-text("Reveal")').first();
      try { await btn.click({ timeout: 3000 }); } catch { /* transient flicker */ }
      await sleep(500);
    }
    try {
      await page.waitForFunction(() =>
        document.body.innerText.includes("Let's learn these words") ||
        document.body.innerText.includes('Great search!'), null, { timeout: 12000 });
    } catch {
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 400));
      console.log('RECAP WAIT FAILED — body text was:', JSON.stringify(txt.replace(/\n/g, ' | ')));
    }
    await sleep(800);
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, '26-v3-summary-recap.png') });
    console.log('📸 26-v3-summary-recap.png');
    await ctx.close();
  }

  await browser.close();
  console.table ? console.table(results) : console.log(JSON.stringify(results, null, 2));
  if (failed) { console.error('F0 REGRESSION GATE FAILED'); process.exit(1); }
  console.log('F0 GATE PASSED at all sizes');
}
main().catch((e) => { console.error('GATE FAILED:', e.message); process.exit(1); });
