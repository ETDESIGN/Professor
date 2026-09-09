// games-v3 BATCH screenshots — walk the fixture flow slide by slide (via the
// Management API updating classroom_sessions.current_index; the board converges
// through realtime) and capture each game's initial board state.
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

/** slide number (flow index) → output file names, in flow order (slide 1 = MEDIA_PLAYER). */
const SLIDES: Array<{ n: string; game: string; waitText?: RegExp }> = [
  { n: '03', game: 'media-player' },
  { n: '07', game: 'story-stage' },
  { n: '10', game: 'listen-tap' },
  { n: '11', game: 'flash-match' },
  { n: '12', game: 'unscramble' },
  { n: '13', game: 'i-say-you-say' },
  { n: '17', game: 'grammar-lab' },
  { n: '18', game: 'word-detective' },
  { n: '19', game: 'sound-lab' },
  { n: '20', game: 'story-quest' },
  { n: '21', game: 'sentence-lab' },
  { n: '22', game: 'phonics-arena' },
  { n: '23', game: 'memory-lab' },
  { n: '24', game: 'class-rally' },
  { n: '25', game: 'fast-vocab' },
  { n: '26', game: 'word-search' },
  { n: '27', game: 'spelling-bee' },
  { n: '28', game: 'comic-panels' },
  { n: '32', game: 'vocab-blitz' },
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
  await page.waitForSelector('text=Media|Word Search|Loading', { timeout: 45000 }).catch(() => {});
  await sleep(3000);

  const results: Array<{ n: string; game: string; ok: boolean; note: string }> = [];
  for (let i = 0; i < SLIDES.length; i++) {
    const slideIndex = i + 1; // flow index (0 = INTRO_SPLASH)
    const { n, game } = SLIDES[i];
    await setSlide(slideIndex);
    await sleep(3200); // realtime converge + content fetch + settle
    let note = '';
    try {
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 400));
      const loading = /Loading…/.test(txt) && txt.length < 120;
      if (loading) { await sleep(3500); }
      note = txt.replace(/\n/g, ' | ').slice(0, 90);
    } catch (e: any) { note = `eval failed: ${e.message.slice(0, 60)}`; }
    const file = `${n}-${game}-idle.png`;
    await page.screenshot({ path: path.join(OUT, file) }).catch((e) => { note += ` | SHOT FAILED: ${e.message.slice(0, 60)}`; });
    console.log(`📸 ${file} — ${note}`);
    results.push({ n, game, ok: !note.includes('FAILED'), note });
  }
  await b.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`DONE — ${results.length - fails.length}/${results.length} captured`);
}
main().catch((e) => { console.error('BATCH SHOTS FAILED:', e.message); process.exit(1); });
