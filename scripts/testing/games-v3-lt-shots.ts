// games-v3 LISTEN& TAP v3 UI verification shots — drives the batch fixture
// board through listen → options → correct-feedback → preview at 16:9, then
// the options grid at the phone-landscape floor (700×320).
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

async function sql(query: string): Promise<any[]> {
  const res = await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${await res.text()}`);
  return res.json();
}
const setSlide = (index: number) =>
  sql(`UPDATE public.classroom_sessions SET current_index = ${index}, updated_at = now() WHERE teacher_id = '${s.teacherId}'`);

async function main() {
  const b = await chromium.launch({ headless: true });
  const page = await (await b.newContext({ viewport: { width: 1279, height: 719 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 160)));

  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.locator('input[type="email"]').first().fill(s.email);
  await page.locator('input[type="password"]').first().fill(s.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/teacher|board/, { timeout: 25000 });
  for (let i = 0; i < 3; i++) { try { await page.goto(`${BASE}/board`, { waitUntil: 'domcontentloaded' }); break; } catch { await sleep(1500); } }
  await sleep(2500);

  // slide 3 = LISTEN_TAP in the batch fixture flow
  await setSlide(3);
  await sleep(2500);

  // 1. listen phase (big speaker)
  await page.waitForSelector('text=Listen', { timeout: 20000 }).catch(() => console.log('no Listen text'));
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, '10-listen-tap-v3-listen.png') });
  console.log('📸 listen');

  // 2. options phase (auto-reveals after ~3s from audio start)
  await page.waitForSelector('text=Which picture matches', { timeout: 12000 }).catch(() => console.log('options banner missing'));
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '10-listen-tap-v3-options.png') });
  console.log('📸 options');

  // 3. find the correct card: read label-plate words from DOM, match against pool
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button .lt-mono'))
      .map(el => el.textContent?.trim() || '')
      .filter(t => t.length > 2 && !/^option \d$/i.test(t)));
  console.log('card labels:', labels);
  let correctText = '';
  try {
    const rows = await sql(`SELECT content FROM public.pool_items WHERE unit_id = '${s.unitId}' AND exercise_type = 'LISTEN_SELECT' LIMIT 8`);
    for (const r of rows) {
      const c = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
      const opts = (c?.options || []).map((o: any) => (o?.text || o?.label || '').trim());
      if (labels.length === opts.length && labels.every((l, i) => l.toLowerCase() === opts[i].toLowerCase())) {
        correctText = opts[c.correct_index] || '';
        break;
      }
    }
  } catch (e: any) { console.log('pool match failed:', e.message.slice(0, 120)); }
  console.log('correct answer:', correctText || '(unmatched — will click card 1)');

  const card = correctText ? page.locator('button', { hasText: correctText }).first() : page.locator('button .lt-mono >> nth=0');
  await card.click({ timeout: 6000 }).catch((e) => console.log('click failed:', e.message.slice(0, 120)));
  await sleep(350); // mid-feedback (emerald glow + auto-advance bar)
  await page.screenshot({ path: path.join(OUT, '10-listen-tap-v3-feedback.png') });
  console.log('📸 feedback');
  await sleep(1100); // preview beat
  await page.screenshot({ path: path.join(OUT, '10-listen-tap-v3-preview.png') });
  console.log('📸 preview');

  // 4. phone floor 700×320 — options grid
  await page.setViewportSize({ width: 700, height: 320 });
  await sleep(1800);
  await setSlide(3); // re-enter to reset into listen→options
  await sleep(2600);
  await page.waitForSelector('text=Which picture matches|Listen', { timeout: 12000 }).catch(() => {});
  await sleep(3200); // let options auto-reveal
  await page.screenshot({ path: path.join(OUT, '10-listen-tap-v3-floor.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 4);
  console.log('📸 floor | page overflow (scroll during play):', overflow);

  await b.close();
}
main().catch((e) => { console.error('LT SHOTS FAILED:', e.message); process.exit(1); });
