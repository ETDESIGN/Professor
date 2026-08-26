// Power Up 2 golden-fixture runner (FIXPLAN_F P1.5).
//
// Rasterizes the LOCAL Power Up 2 sample PDF (never committed), uploads each
// page to the materials bucket, invokes the deployed scan-page function,
// and diffs the results against the transcribed ground truth
// (scripts/testing/fixtures/powerup2/ground-truth.json, doc 10 Appendix A).
//
// Usage:
//   FIXTURE_EMAIL=<dev teacher> FIXTURE_PASSWORD=<pw> \
//   FIXTURE_PDF=/path/to/power-up-2.pdf \
//   npm run test:fixtures
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env. Cost: ~2 vision
// calls per page (26 pages ≈ 52 calls). Creates a scratch unit titled
// "FIXTURE TEST …" and soft-deletes it at the end.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const execFileP = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GROUND_TRUTH = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/testing/fixtures/powerup2/ground-truth.json'), 'utf8'));

// The sample PDF is JPEG2000-scanned; pdfjs+@napi-rs/canvas segfaults on it.
// macOS-native PDFKit (Swift) rasterizes it reliably.
const DEFAULT_PAGES_DIR = '/tmp/powerup2-pages';

function loadEnv() {
  try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* optional */ }
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const EMAIL = process.env.FIXTURE_EMAIL || '';
const PASSWORD = process.env.FIXTURE_PASSWORD || '';
const PDF_PATH = process.env.FIXTURE_PDF ||
  '/Users/ET/Documents/feismo.com-power-up-2-pupils-book-pr_b8f6da41f190213913532e10ca03597f.pdf';
const PAGES_DIR = process.env.FIXTURE_PAGES_DIR || DEFAULT_PAGES_DIR;
const TARGET_WIDTH = 1500;
const CONCURRENCY = 3;

if (!SUPABASE_URL || !ANON_KEY) { console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'); process.exit(2); }
if (!EMAIL || !PASSWORD) { console.error('Missing FIXTURE_EMAIL / FIXTURE_PASSWORD (dev teacher account)'); process.exit(2); }
if (!fs.existsSync(PDF_PATH)) { console.error(`PDF not found: ${PDF_PATH}`); process.exit(2); }

/** Minimal JPEG dimension reader (SOF0/SOF1/SOF2 markers). */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function ensureRasterizedPages(): Promise<string[]> {
  let files = fs.existsSync(PAGES_DIR)
    ? fs.readdirSync(PAGES_DIR).filter((f) => /^p\d+\.jpg$/.test(f)).sort()
    : [];
  if (files.length === 0) {
    console.log(`Rasterizing PDF via macOS PDFKit -> ${PAGES_DIR} ...`);
    fs.mkdirSync(PAGES_DIR, { recursive: true });
    await execFileP('swift', [path.join(ROOT, 'scripts/testing/rasterize-pdf.swift'), PDF_PATH, PAGES_DIR, String(TARGET_WIDTH)]);
    files = fs.readdirSync(PAGES_DIR).filter((f) => /^p\d+\.jpg$/.test(f)).sort();
  }
  if (files.length !== GROUND_TRUTH.pdf_pages) {
    console.error(`Expected ${GROUND_TRUTH.pdf_pages} rasterized pages, found ${files.length}`); process.exit(2);
  }
  return files.map((f) => path.join(PAGES_DIR, f));
}

// ── normalization ─────────────────────────────────────────────────────────
const normWord = (w: string) => String(w).toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
const normText = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ');
const printedNumber = (s: unknown): number | null => {
  const m = String(s ?? '').match(/\d{1,3}/);
  return m ? parseInt(m[0], 10) : null;
};

interface ScanResult {
  pdfPage: number;
  printed: number | null;
  ok: boolean;
  error?: string;
  structures: any[];
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr || !authData.user) { console.error('Sign-in failed:', authErr?.message); process.exit(2); }

  // Scratch unit (no book — book_id is nullable and scan-page reads it from the unit).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const { data: unit, error: unitErr } = await sb.from('units').insert({
    title: `FIXTURE TEST Power Up 2 ${stamp} (safe to delete)`,
    topic: 'FIXTURE TEST',
    level: 'General',
    status: 'Draft',
    lessons: 1,
    flow: [],
    teacher_id: authData.user.id,
    order_index: 0,
  }).select('id').single();
  if (unitErr || !unit) { console.error('Could not create scratch unit:', unitErr?.message); process.exit(2); }
  console.log(`Scratch unit: ${unit.id}`);

  const pageFiles = await ensureRasterizedPages();
  const total = pageFiles.length;
  console.log(`Pages: ${PAGES_DIR} (${total} pages) — ground truth expects ${GROUND_TRUTH.pdf_pages}`);

  async function scanPdfPage(pdfPage: number): Promise<ScanResult> {
    try {
      const jpeg = fs.readFileSync(pageFiles[pdfPage - 1]);
      const dims = jpegSize(jpeg);
      const storagePath = `fixtures/powerup2-p${String(pdfPage).padStart(2, '0')}-${stamp}.jpg`;
      const { error: upErr } = await sb.storage.from('materials').upload(storagePath, new Uint8Array(jpeg), { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw new Error(`storage: ${upErr.message}`);
      const { data: urlData } = sb.storage.from('materials').getPublicUrl(storagePath);
      const { data, error } = await sb.functions.invoke('scan-page', {
        body: {
          unitId: unit.id,
          fileUrl: urlData.publicUrl,
          filename: `powerup2-p${pdfPage}.jpg`,
          pdfPageNumber: pdfPage,
          uploadOrder: pdfPage,
          width: dims?.width,
          height: dims?.height,
        },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'scan-page returned failure');
      return {
        pdfPage,
        printed: printedNumber(data.page_labels?.printed_page_number),
        ok: true,
        structures: data.structures || [],
      };
    } catch (e: any) {
      return { pdfPage, printed: null, ok: false, error: e?.message || String(e), structures: [] };
    }
  }

  const pdfPages = Array.from({ length: total }, (_, i) => i + 1);
  const results: ScanResult[] = new Array(total);
  let next = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = next++;
      if (i >= total) break;
      let r = await scanPdfPage(pdfPages[i]);
      // One retry for transient provider/platform failures (non-2xx kills,
      // slow vision calls) — mirrors the teacher's per-page retry.
      if (!r.ok) {
        console.log(`  [${i + 1}/${total}] pdf p${r.pdfPage} failed (${r.error?.slice(0, 80)}) — retrying once…`);
        r = await scanPdfPage(pdfPages[i]);
      }
      results[i] = r;
      console.log(`  [${i + 1}/${total}] pdf p${r.pdfPage} printed=${r.printed ?? '?'} ${r.ok ? `structures=${r.structures.length}` : `FAILED: ${r.error}`}`);
    }
  });
  await Promise.all(workers);

  // ── assertions ─────────────────────────────────────────────────────────
  const failures: string[] = [];
  const warnings: string[] = [];

  const byPrinted = new Map<number, ScanResult>();
  for (const r of results) {
    if (r.ok && r.printed != null && !byPrinted.has(r.printed)) byPrinted.set(r.printed, r);
  }

  const vocabWords = (r: ScanResult): string[] =>
    r.structures
      .filter((s) => s.structure_type === 'vocab_set' || s.structure_type === 'clil_passage' || s.structure_type === 'reading_passage')
      .flatMap((s) => Array.isArray(s.data?.items) ? s.data.items.map((it: any) => normWord(it?.word)) : [])
      .filter(Boolean);

  const verbs = (r: ScanResult): string[] =>
    r.structures
      .filter((s) => s.structure_type === 'printed_activity' || s.structure_type === 'reading_passage')
      .flatMap((s) => {
        const acts = s.structure_type === 'reading_passage' && Array.isArray(s.data?.activities) ? s.data.activities : [s.data];
        return acts.map((a: any) => normWord(a?.verb || ''));
      })
      .filter(Boolean);

  const structuresText = (r: ScanResult, type: string): string =>
    normText(JSON.stringify(r.structures.filter((s) => s.structure_type === type)));

  for (const [printedStr, spec] of Object.entries<any>(GROUND_TRUTH.pages)) {
    const printed = parseInt(printedStr, 10);
    const r = byPrinted.get(printed);
    if (!r) {
      warnings.push(`p${printed}: no scanned page matched printed number (${spec.note})`);
      continue;
    }
    const types = new Set(r.structures.map((s) => s.structure_type));
    const words = vocabWords(r);
    const label = `p${printed}`;
    if (spec.require_types && !spec.require_types.every((t: string) => types.has(t))) {
      failures.push(`${label}: missing required types ${spec.require_types.filter((t: string) => !types.has(t)).join(', ')} — got [${[...types].join(', ')}]`);
    }
    if (spec.require_types_any && !spec.require_types_any.some((t: string) => types.has(t))) {
      failures.push(`${label}: none of [${spec.require_types_any.join(', ')}] found — got [${[...types].join(', ')}]`);
    }
    if (spec.soft_types_any && !spec.soft_types_any.some((t: string) => types.has(t))) {
      warnings.push(`${label}: (soft) none of [${spec.soft_types_any.join(', ')}] found — got [${[...types].join(', ')}]`);
    }
    const missingAll = (spec.require_words_all || []).filter((w: string) => !words.includes(normWord(w)));
    if (missingAll.length) failures.push(`${label}: vocabulary missing [${missingAll.join(', ')}] — found [${words.join(', ')}]`);
    if (spec.require_words_any && !spec.require_words_any.some((w: string) => words.includes(normWord(w)))) {
      failures.push(`${label}: none of [${spec.require_words_any.join(', ')}] found — found [${words.join(', ')}]`);
    }
    if (spec.soft_words_any && !spec.soft_words_any.some((w: string) => words.includes(normWord(w)))) {
      warnings.push(`${label}: (soft) none of [${spec.soft_words_any.join(', ')}] found — found [${words.join(', ')}]`);
    }
    if (spec.require_verbs_any && !spec.require_verbs_any.some((v: string) => verbs(r).includes(normWord(v)))) {
      warnings.push(`${label}: (soft) no activity verb in [${spec.require_verbs_any.join(', ')}] — got [${verbs(r).join(', ')}]`);
    }
    if (spec.require_text_contains) {
      for (const t of spec.require_text_contains) {
        if (!structuresText(r, 'grammar_box').includes(normText(t))) {
          failures.push(`${label}: grammar box does not contain "${t}" — text: ${structuresText(r, 'grammar_box').slice(0, 200)}`);
        }
      }
    }
    if (spec.require_text_contains_any && !spec.require_text_contains_any.some((t: string) => structuresText(r, 'grammar_box').includes(normText(t)))) {
      failures.push(`${label}: grammar box contains none of [${spec.require_text_contains_any.join(' / ')}]`);
    }
    const comics = r.structures.filter((s) => s.structure_type === 'comic');
    if (spec.comic_min_panels) {
      const maxPanels = Math.max(0, ...comics.map((c) => Array.isArray(c.data?.panels) ? c.data.panels.length : 0));
      if (maxPanels < spec.comic_min_panels) failures.push(`${label}: comic has ${maxPanels} panels (< ${spec.comic_min_panels})`);
    }
    const songs = r.structures.filter((s) => s.structure_type === 'song_sheet');
    if (spec.require_song_title_contains && !songs.some((s) => normText(s.data?.title || '').includes(normText(spec.require_song_title_contains[0])))) {
      failures.push(`${label}: song title missing "${spec.require_song_title_contains[0]}" — got ${songs.map((s) => s.data?.title).join(' | ') || '(no song)'}`);
    }
    if (spec.soft_reading_title_contains) {
      const readings = r.structures.filter((s) => s.structure_type === 'reading_passage');
      if (!readings.some((s) => normText(s.data?.title || '').includes(normText(spec.soft_reading_title_contains[0])))) {
        warnings.push(`${label}: (soft) reading title missing "${spec.soft_reading_title_contains[0]}" — got ${readings.map((s) => s.data?.title).join(' | ') || '(no title)'}`);
      }
    }
  }

  for (const [unitName, spec] of Object.entries<any>(GROUND_TRUTH.units)) {
    const [from, to] = spec.pages;
    const inRange = results.filter((r) => r.ok && r.printed != null && r.printed >= from && r.printed <= to);
    const allWords = new Set(inRange.flatMap(vocabWords));
    const allTypes = new Set(inRange.flatMap((r) => r.structures.map((s) => s.structure_type)));
    if (spec.min_total_words && allWords.size < spec.min_total_words) {
      failures.push(`${unitName}: only ${allWords.size} unique words (< ${spec.min_total_words}) — the old pipeline capped at 6-8 per page by design`);
    }
    if (spec.require_types_all) {
      const missing = spec.require_types_all.filter((t: string) => !allTypes.has(t));
      if (missing.length) failures.push(`${unitName}: missing unit-level types [${missing.join(', ')}] — got [${[...allTypes].join(', ')}]`);
    }
    for (const t of spec.require_grammar_boxes_containing || []) {
      const boxes = inRange.filter((r) => r.structures.some((s) => s.structure_type === 'grammar_box'));
      const found = boxes.some((r) => structuresText(r, 'grammar_box').includes(normText(t)));
      if (!found) failures.push(`${unitName}: no grammar box containing "${t}"`);
    }
  }

  // ── report ─────────────────────────────────────────────────────────────
  console.log('\n════════════ FIXTURE REPORT ════════════');
  for (const r of results.sort((a, b) => (a.printed ?? 999) - (b.printed ?? 999))) {
    const types = r.structures.map((s) => `${s.structure_type}${s.verification_flags?.length ? `⚠${s.verification_flags.length}` : ''}`);
    console.log(`printed ${String(r.printed ?? '?').padStart(3)} | pdf ${String(r.pdfPage).padStart(2)} | ${r.ok ? types.join(', ') || '(no structures)' : 'FAILED: ' + r.error}`);
  }
  console.log(`\nUnits: unit1 words=${new Set(results.filter((r) => r.ok && r.printed != null && r.printed >= 6 && r.printed <= 17).flatMap(vocabWords)).size}, unit2 words=${new Set(results.filter((r) => r.ok && r.printed != null && r.printed >= 18 && r.printed <= 29).flatMap(vocabWords)).size}`);
  if (warnings.length) { console.log(`\n⚠ Warnings (${warnings.length}):`); warnings.forEach((w) => console.log('  ' + w)); }
  if (failures.length) {
    console.error(`\n✗ FAILURES (${failures.length}):`);
    failures.forEach((f) => console.error('  ' + f));
  } else {
    console.log('\n✓ All hard assertions passed.');
  }

  // ── cleanup (soft-delete the scratch unit; rows stay inspectable) ──────
  await sb.from('units').update({ deleted_at: new Date().toISOString() }).eq('id', unit.id);
  console.log(`\nScratch unit soft-deleted (${unit.id}). Pages remain in book_pages for inspection.`);

  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
