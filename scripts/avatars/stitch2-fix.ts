// Stitch batch-2 post-audit fixes (ChatGPT review 2026-09-06):
//  A) 8 human wigs: drop the ENCLOSED white face-fill components (border flood
//     couldn't reach them — they're ringed by hair). Result: transparent face
//     opening framed by the hair's own inner outline. Also drop small opaque
//     islands left inside the opening (stray eye strokes).
//  B) 3 ADJUST nudges: face_pixel_smile → eyes anchor; outfit_fur_collar →
//     neckline placement (y≈485, 80% anchor width); back_wings_dragon →
//     115% scale, up 35px.
// Run: npx tsx scripts/avatars/stitch2-fix.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_ANCHORS } from './manifest.js';

const W = 1024;
const OUT = path.join(import.meta.dirname, 'out', 'stitch2');
const EXTRACTED = path.join(OUT, 'extracted');

const WIGS: { id: string; sheet: string }[] = [
  { id: 'hair_spiky_brown', sheet: 'sheet_wigs1' }, { id: 'hair_curly_brown', sheet: 'sheet_wigs1' },
  { id: 'hair_mohawk', sheet: 'sheet_wigs1' }, { id: 'hair_buzz_cut', sheet: 'sheet_wigs1' },
  { id: 'hair_braids_long', sheet: 'sheet_wigs2' }, { id: 'hair_pigtails', sheet: 'sheet_wigs2' },
  { id: 'hair_top_bun', sheet: 'sheet_wigs2' }, { id: 'hair_wavy_long', sheet: 'sheet_wigs2' },
];

function comps(mask: Uint8Array, w: number, h: number, minPx: number) {
  const seen = new Uint8Array(w * h);
  const out: { pixels: number[]; x1: number; y1: number; x2: number; y2: number; touchesBorder: boolean }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !mask[i]) continue;
    const pixels: number[] = [];
    const stack = [i];
    seen[i] = 1;
    let x1 = 1e9, y1 = 1e9, x2 = -1, y2 = -1, touches = false;
    while (stack.length) {
      const idx = stack.pop()!;
      pixels.push(idx);
      const x = idx % w, y = (idx - x) / w;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) touches = true;
      const push = (nx: number, ny: number) => {
        const n = ny * w + nx;
        if (!seen[n] && mask[n]) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    if (pixels.length >= minPx) out.push({ pixels, x1, y1, x2, y2, touchesBorder: touches });
  }
  return out;
}

async function fixWig(id: string, sheet: string) {
  const rawPath = path.join(OUT, 'raw', sheet, id + '.png');
  const { data, info } = await sharp(rawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let opaque = 0;
  for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] > 40) opaque++;

  // light mask (near-white): the face fill; blonde hair is sat>0.15 so safe
  const light = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (data[p + 3] <= 40) continue;
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    const mx = Math.max(data[p], data[p + 1], data[p + 2]), mn = Math.min(data[p], data[p + 1], data[p + 2]);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (lum > 195 && sat < 0.15) light[i] = 1;
  }
  const removed: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let removedPx = 0;
  for (const c of comps(light, w, h, Math.round(opaque * 0.02))) {
    if (c.touchesBorder) continue; // border-connected light = genuine bg leftovers, already handled
    if (c.pixels.length > opaque * 0.6) continue; // paranoia: never eat the whole sprite
    for (const i of c.pixels) data[i * 4 + 3] = 0;
    removed.push({ x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 });
    removedPx += c.pixels.length;
  }
  // drop small opaque islands stranded inside removed regions (stray eye/face strokes)
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = data[i * 4 + 3] > 40 ? 1 : 0;
  let islands = 0;
  for (const c of comps(solid, w, h, 30)) {
    const inside = removed.some((r) => c.x1 >= r.x1 - 6 && c.x2 <= r.x2 + 6 && c.y1 >= r.y1 - 6 && c.y2 <= r.y2 + 6);
    if (inside && c.pixels.length < opaque * 0.04) {
      for (const i of c.pixels) data[i * 4 + 3] = 0;
      islands++;
    }
  }
  const png = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const layer = await placeAnchored(png, 'hair');
  fs.writeFileSync(path.join(EXTRACTED, id + '.png'), layer);
  console.log(`${id}: removed ${(removedPx / opaque * 100).toFixed(0)}% fill (${removed.length} region(s)), ${islands} island(s) → hair layer rebuilt`);
}

async function placeAnchored(cutoutPng: Buffer | string, slot: string, opts?: { scaleMul?: number; topY?: number; widthPct?: number }): Promise<Buffer> {
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  const anchor = ITEM_ANCHORS[slot];
  let scale = Math.min(anchor.w / iw, anchor.h / ih, 1);
  if (opts?.widthPct) scale = (anchor.w * opts.widthPct) / iw;
  if (opts?.scaleMul) scale *= opts.scaleMul;
  const dw = Math.min(W, Math.max(1, Math.round(iw * scale)));
  const dh = Math.min(W, Math.max(1, Math.round(ih * scale)));
  const left = Math.max(0, Math.min(W - dw, Math.round(anchor.x + (anchor.w - dw) / 2)));
  let top: number;
  if (opts?.topY !== undefined) top = opts.topY;
  else top = Math.max(0, Math.min(W - dh, anchor.topAnchor ? anchor.y : Math.round(anchor.y + (anchor.h - dh) / 2)));
  const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }]).png().toBuffer();
}

async function refit(id: string, slot: string, opts?: { scaleMul?: number; topY?: number; widthPct?: number }) {
  // find the raw source (search all sheet dirs)
  for (const sheet of fs.readdirSync(path.join(OUT, 'raw'))) {
    const p = path.join(OUT, 'raw', sheet, id + '.png');
    if (fs.existsSync(p)) {
      const layer = await placeAnchored(p, slot, opts);
      fs.writeFileSync(path.join(EXTRACTED, id + '.png'), layer);
      console.log(`${id}: refit ${slot} ${JSON.stringify(opts ?? {})}`);
      return;
    }
  }
  console.log(`${id}: RAW NOT FOUND`);
}

async function main() {
  for (const wig of WIGS) await fixWig(wig.id, wig.sheet);
  await refit('face_pixel_smile', 'eyes'); // onto the robot's display band
  await refit('outfit_fur_collar', 'outfit', { topY: 485, widthPct: 0.8 }); // neckline, not torso-center
  await refit('back_wings_dragon', 'back', { scaleMul: 1.15, topY: ITEM_ANCHORS.back.y - 35 });
  console.log('DONE fixes');
}

main().catch((e) => { console.error(e); process.exit(1); });
