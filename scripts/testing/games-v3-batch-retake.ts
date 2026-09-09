// Retake the screenshots that caught the transient "Loading…" state — wait
// for actual content per slide before shooting.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const s = JSON.parse(fs.readFileSync('/tmp/games-v3-batch.json', 'utf-8'));
process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'));
const PAT = process.env.SUPABASE_ACCESS_TOKEN!;
const BASE = 'http://localhost:5173';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/audit/games-v3/screenshots');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** flow slide index (1-based) → file, for the games that previously caught Loading. */
const SLIDES: Array<{ idx: number; file: string }> = [
  { idx: 3, file: '10-listen-tap-idle.png' },
  { idx: 4, file: '11-flash-match-idle.png' },
  { idx: 5, file: '12-unscramble-idle.png' },
  { idx: 6, file: '13-i-say-you-say-idle.png' },
  { idx: 7, file: '17-grammar-lab-idle.png' },
  { idx: 8, file: '18-word-detective-idle.png' },
  { idx: 11, file: '21-sentence-lab-idle.png' },
  { idx: 16, file: '26-word-search-idle.png' },
];

async function setSlide(index: number) {
  const res = await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `UPDATE public.classroom_sessions SET current_index = ${index}, updated_at = now() WHERE teacher_id = '${s.teacherId}'` }),
  });
  if (!res.ok) throw new Error(`setSlide(${index}) failed: ${res.status}`);
}

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 150)));

  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(3000);

  for (const { idx, file } of SLIDES) {
    await setSlide(idx);
    // Wait until content replaces Loading (or 30s cap)
    let settled = false;
    for (let t = 0; t < 15; t++) {
      await sleep(2000);
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 500));
      const loadingOnly = /Loading/.test(txt.split('\n').slice(0, 6).join(' '));
      if (!loadingOnly) { settled = true; break; }
    }
    const note = await page.evaluate(() => document.body.innerText.replace(/\n/g, ' | ').slice(0, 90));
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`📸 ${file} ${settled ? '(content)' : '(STILL LOADING)'} — ${note}`);
  }
  await b.close();
}
main().catch((e) => { console.error('RETAKE FAILED:', e.message); process.exit(1); });
