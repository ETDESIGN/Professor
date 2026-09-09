// games-v3 board screenshots — drives the REAL app at /board as the throwaway
// fixture teacher and captures the WORD_SEARCH game's key states at 1280×720
// (the projector popup size) @2x. Pairs with games-v3-board-fixtures.ts.
//
//   npx vite --port 5173                       (terminal 1)
//   tsx scripts/testing/games-v3-board-fixtures.ts --setup
//   tsx scripts/testing/games-v3-board-shots.ts
//   tsx scripts/testing/games-v3-board-fixtures.ts --teardown
//
// Outputs docs/audit/games-v3/screenshots/26-*.png.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const STATE = '/tmp/games-v3-fixtures.json';
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function shot(page: Page, name: string) {
  await sleep(700); // let animations/toasts settle
  await page.screenshot({ path: path.join(OUT, name) });
  console.log(`📸 ${name}`);
}

/** Letters of the active grid, row-major. */
async function readGrid(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const el = document.querySelector('div.absolute.inset-0.grid') as HTMLElement | null;
    if (!el) return [];
    const letters = Array.from(el.children).map((c) => (c.textContent || '').trim());
    const n = Math.round(Math.sqrt(letters.length));
    const rows: string[][] = [];
    for (let r = 0; r < n; r++) rows.push(letters.slice(r * n, (r + 1) * n));
    return rows;
  });
}

/** The round's words from the visible clue cards (round 1 shows them). */
async function readWords(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('div.truncate.font-bold'))
      .map((e) => (e.textContent || '').trim())
      .filter((w) => w.length > 0));
}

const DIRS: Array<[number, number]> = [
  [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
];

/** Find first+last cell of `word` on the grid (forwards only — how it's placed). */
function findPlacement(grid: string[][], word: string): { first: { r: number; c: number }; last: { r: number; c: number } } | null {
  const target = word.toUpperCase().replace(/[^A-Z]/g, '');
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const [dr, dc] of DIRS) {
        const endR = r + dr * (target.length - 1);
        const endC = c + dc * (target.length - 1);
        if (endR < 0 || endR >= n || endC < 0 || endC >= n) continue;
        let ok = true;
        for (let i = 0; i < target.length; i++) {
          if (grid[r + dr * i][c + dc * i] !== target[i]) { ok = false; break; }
        }
        if (ok) return { first: { r, c }, last: { r: endR, c: endC } };
      }
    }
  }
  return null;
}

/** Tap first+last letter cells (tap-tap selection). */
async function tapWord(page: Page, grid: string[][], place: { first: { r: number; c: number }; last: { r: number; c: number } }) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('div.absolute.inset-0.grid') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!box) throw new Error('grid not found');
  const n = grid.length;
  const cell = { w: box.w / n, h: box.h / n };
  const click = async (p: { r: number; c: number }) => {
    await page.mouse.click(box.x + (p.c + 0.5) * cell.w, box.y + (p.r + 0.5) * cell.h);
    await sleep(250);
  };
  await click(place.first);
  await click(place.last);
}

async function main() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  // 1279×719: BELOW Tailwind xl (1280) — the layout a real projector popup gets.
  // At ≥1280 CSS px the grid currently renders 0×0 (see audit F0) — captured
  // separately as the bug-evidence shot.
  const ctx = await browser.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Login as the fixture teacher.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  const roleBtn = page.locator('button:has-text("Teacher")').first();
  if (await roleBtn.count() > 0 && await roleBtn.isVisible()) await roleBtn.click();
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(teacher|board)/, { timeout: 25000 });
  console.log('logged in');

  // Board tab — hydrates the LIVE session onto the WORD_SEARCH slide.
  for (let i = 0; i < 3; i++) {
    try { await page.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; }
    catch { await sleep(1500); }
  }
  await page.waitForSelector('text=Start Round', { timeout: 40000 });
  // The roster arrival re-fetches the pool and briefly flips the board back to
  // "Loading…" — wait for it to settle back to the preview.
  await sleep(2500);
  await page.waitForSelector('text=Start Round', { timeout: 30000 });
  console.log('board live, preview stage');
  await shot(page, '26-preview.png');

  // Bug evidence: at ≥1280 CSS px the grid renders 0×0 (audit finding F0).
  const big = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, storageState: await ctx.storageState() })).newPage();
  await big.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await big.waitForSelector('text=Start Round', { timeout: 40000 });
  await sleep(2500);
  await big.waitForSelector('text=Start Round', { timeout: 30000 });
  await big.locator('button:has-text("Start Round")').click();
  await sleep(2000);
  await shot(big, '26-bug-grid-invisible-at-1280plus.png');
  await big.close();

  // PLAY (1279 window) — NOTE: the grid currently collapses to ~13px here too
  // (flanks consume the stacked height; audit finding F0). Capture honestly.
  await page.locator('button:has-text("Start Round")').click();
  await page.waitForSelector('text=/5 found', { timeout: 20000 });
  await sleep(1200);
  await shot(page, '26-play.png');

  // Complete the round via the board's own Reveal button (locks without points).
  for (let i = 0; i < 5; i++) {
    await page.locator('button:has-text("Reveal a word")').click();
    await sleep(400);
  }
  await page.waitForSelector('text=COMPLETE!', { timeout: 10000 });
  console.log('round 1 complete (all revealed)');
  await shot(page, '26-summary.png');

  // Rounds 2+3: reveal through them, then the final screen.
  for (let round = 2; round <= 3; round++) {
    const label = round === 3 ? 'See Results' : 'Next Round';
    await page.locator(`button:has-text("${label}")`).click({ force: true });
    await page.locator('button:has-text("Start Round")').click();
    await page.waitForSelector('text=/5 found', { timeout: 15000 });
    await sleep(600);
    for (let i = 0; i < 5; i++) {
      await page.locator('button:has-text("Reveal a word")').click();
      await sleep(350);
    }
    await page.waitForSelector('text=COMPLETE!', { timeout: 10000 });
    await shot(page, `26-round${round}-revealed.png`);
    await page.locator(`button:has-text("${round === 3 ? 'See Results' : 'Next Round'}")`).click({ force: true });
  }

  await page.waitForSelector('text=THE END', { timeout: 10000 });
  await shot(page, '26-final.png');
  console.log('DONE');

  await browser.close();
}

main().catch((e) => { console.error('SHOTS FAILED:', e.message); process.exit(1); });
