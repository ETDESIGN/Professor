// Stitch test extraction — one-off companion to art-pipeline.ts.
// Crops the robot + accessory card thumbnails out of the Stitch screens and
// runs them through the same cutout pipeline (flood → largest component →
// anchor placement / skeleton align). NO network, NO catalog writes — the
// outputs are review-only until the owner approves (stitch test gate).
//
// Differences vs art-pipeline processing, deliberately:
//  - Circular card mask before flood: thumbnails sit on round cards whose
//    fill can carry colored rings; zeroing outside the inscribed circle
//    removes ring + page bg in one geometric stroke.
//  - NO skinKeyAlpha: the cowboy hat is brown (hue ~25°, sat in-band) and
//    would be keyed as "human skin". Thumbnails carry no skin anyway.
//
// Run: npx tsx scripts/avatars/stitch-extract.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_ANCHORS } from './manifest.js';

const W = 1024;
const OUT = path.join(import.meta.dirname, 'out', 'stitch');
const SRC = path.join(OUT, 'stitch1.png'); // canonical front-facing screen
fs.mkdirSync(path.join(OUT, 'extracted'), { recursive: true });

// Vision-grid-verified layout (2026-09-05). The four Stitch exports are
// artboards on WHITE — no UI mockups, no circular cards (earlier vision
// passes hallucinated those; pixel scans disproved them):
//   stitch1 (GRAYSCALE): clean robot + 4 loose objects on dark slate cards
//            → only the COWBOY HAT exists here (recolor from luminance).
//   stitch2 (color): robot A wearing red cap + black sunglasses (left),
//            robot B wearing headphones + yellow-rimmed glasses (right).
//   stitch3 (color): one big clean robot — the BASE master source.
//   stitch4 (color): same two-robot composition as stitch2, larger heads.
// Best-resolution source per item chosen across stitch2/4.
const ROBOTS = [
  { id: 'robot_stitch', src: 'stitch3.png', box: { left: 225, top: 64, width: 574, height: 880 } },
];
// TRUE layout (unprimed vision + pixel scans, 2026-09-05): stitch2/stitch4
// show TWO HUMAN KIDS (tan skin ~#B16430, black hair) — kid A (left): red
// cap + black sunglasses; kid B (right): yellow-rimmed round glasses +
// black over-ear headphones. Face anchors in stitch2: A eyes ≈ 368-431 x,
// 348-447 y; B eyes ≈ 593-656 x. Items are extracted by COLOR MASK within
// generous head regions (vision bboxes proved unreliable ±100px).
type Pred = (r: number, g: number, b: number) => boolean;
const PRED: Record<string, Pred> = {
  red: (r, g, b) => r > 130 && r > g + 45 && r > b + 45,
  yellow: (r, g, b) => r > 165 && g > 125 && b < 115,
  dark: (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b < 62,
};
const WORN = [
  { id: 'headwear_cap_red_stitch', src: 'stitch2.png', slot: 'headwear', region: { left: 320, top: 230, width: 160, height: 280 }, pred: 'red', mode: 'largest' as const, borderOk: true },
  { id: 'face_shades_stitch', src: 'stitch2.png', slot: 'face', region: { left: 330, top: 330, width: 140, height: 140 }, pred: 'dark', mode: 'largest' as const, borderOk: false },
  { id: 'face_glasses_yellow_stitch', src: 'stitch2.png', slot: 'face', region: { left: 555, top: 330, width: 140, height: 140 }, pred: 'yellow', mode: 'multi' as const, borderOk: true },
  { id: 'headwear_headphones_stitch', src: 'stitch2.png', slot: 'headwear', region: { left: 530, top: 230, width: 190, height: 280 }, pred: 'dark', mode: 'multi' as const, borderOk: false },
];
// Grayscale cowboy hat from stitch1's slate card → brown-tinted + raw gray.
const COWBOY = { src: 'stitch1.png', box: { left: 460, top: 385, width: 165, height: 135 } };

// ---- helpers copied from art-pipeline.ts (single-file, no exports there) --
function floodBackgroundAlpha(rgba: Buffer, globalOnly = false): { alpha: Buffer; removedPct: number } {
  const alpha = Buffer.alloc(W * W, 255);
  const buckets = new Map<string, { n: number; rgb: [number, number, number] }>();
  const bump = (r: number, g: number, b: number) => {
    const k = `${r >> 4}_${g >> 4}_${b >> 4}`;
    const e = buckets.get(k) || { n: 0, rgb: [r, g, b] };
    e.n++;
    buckets.set(k, e);
  };
  for (let x = 0; x < W; x += 4) {
    for (const y of [0, 1, W - 2, W - 1]) { const p = (y * W + x) * 4; bump(rgba[p], rgba[p + 1], rgba[p + 2]); }
  }
  for (let y = 0; y < W; y += 4) {
    for (const x of [0, 1, W - 2, W - 1]) { const p = (y * W + x) * 4; bump(rgba[p], rgba[p + 1], rgba[p + 2]); }
  }
  let bestN = -1; let bg: [number, number, number] = [255, 255, 255];
  for (const v of buckets.values()) if (v.n > bestN) { bestN = v.n; bg = v.rgb; }
  const distBg = (p: number) =>
    Math.sqrt((rgba[p] - bg[0]) ** 2 + (rgba[p + 1] - bg[1]) ** 2 + (rgba[p + 2] - bg[2]) ** 2);
  const distPx = (a: number, b: number) =>
    Math.sqrt((rgba[a] - rgba[b]) ** 2 + (rgba[a + 1] - rgba[b + 1]) ** 2 + (rgba[a + 2] - rgba[b + 2]) ** 2);
  const gdist = new Uint8Array(W * W).fill(255);
  const stack: number[] = [];
  const push = (idx: number, gd: number) => {
    if (gdist[idx] <= gd) return;
    gdist[idx] = gd;
    stack.push(idx);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x + (W - 1) * W, 0); }
  for (let y = 0; y < W; y++) { push(y * W, 0); push(W - 1 + y * W, 0); }
  let removed = 0;
  while (stack.length) {
    const idx = stack.pop()!;
    const myGd = gdist[idx];
    const p = idx * 4;
    if (distBg(p) > 85 && myGd >= 60) continue;
    alpha[idx] = 0;
    removed++;
    const x = idx % W, y = (idx - x) / W;
    const spread = (nidx: number) => {
      const np = nidx * 4;
      if (distBg(np) <= 85) push(nidx, 0);
      else if (!globalOnly && myGd < 60 && distPx(p, np) <= 28) push(nidx, myGd + 1);
    };
    if (x > 0) spread(idx - 1);
    if (x < W - 1) spread(idx + 1);
    if (y > 0) spread(idx - W);
    if (y < W - 1) spread(idx + W);
  }
  return { alpha, removedPct: removed / (W * W) };
}

function largestComponent(alpha: Buffer): { alpha: Buffer; keptPct: number } {
  const seen = new Uint8Array(W * W);
  let best: number[] | null = null;
  for (let i = 0; i < W * W; i++) {
    if (seen[i] || alpha[i] <= 40) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      comp.push(idx);
      const x = idx % W, y = (idx - x) / W;
      const push = (nx: number, ny: number) => {
        const n = ny * W + nx;
        if (!seen[n] && alpha[n] > 40) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) push(x - 1, y);
      if (x < W - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < W - 1) push(x, y + 1);
    }
    if (!best || comp.length > best.length) best = comp;
  }
  if (!best) return { alpha, keptPct: 0 };
  const out = Buffer.alloc(W * W, 0);
  for (const idx of best) out[idx] = alpha[idx];
  return { alpha: out, keptPct: best.length / (W * W) };
}

function alphaBBox(alpha: Buffer): { x: number; y: number; w: number; h: number } | null {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 40) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function rgbaWithAlpha(rgba: Buffer, alpha: Buffer): Buffer {
  const out = Buffer.allocUnsafe(W * W * 4);
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    out[p] = rgba[p]; out[p + 1] = rgba[p + 1]; out[p + 2] = rgba[p + 2];
    out[p + 3] = alpha[i];
  }
  return out;
}

async function featherAlpha(alpha: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(Buffer.from(alpha), { raw: { width: W, height: W, channels: 1 } })
    .blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const out = Buffer.allocUnsafe(W * W);
  for (let i = 0; i < W * W; i++) out[i] = data[i * ch];
  return out;
}

async function alignToSkeleton(cutoutPng: Buffer): Promise<Buffer> {
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  const scale = 900 / ih;
  const dw = Math.min(W, Math.round(iw * scale));
  const sprite = await sharp(trimmed).resize(dw, 900, { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left: Math.max(0, Math.round((W - dw) / 2)), top: 62 }]).png().toBuffer();
}

async function buildAnchoredLayer(rgba: Buffer, alpha: Buffer, slot: string): Promise<Buffer> {
  const soft = await featherAlpha(alpha);
  const out = Buffer.allocUnsafe(W * W * 4);
  for (let i = 0, p = 0; i < W * W; i++, p += 4) {
    out[p] = rgba[p]; out[p + 1] = rgba[p + 1]; out[p + 2] = rgba[p + 2];
    out[p + 3] = soft[i];
  }
  const cutoutPng = await sharp(Buffer.from(out), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  const anchor = ITEM_ANCHORS[slot] || ITEM_ANCHORS.handheld;
  const scale = Math.min(anchor.w / iw, anchor.h / ih, 1);
  const dw = Math.min(W, Math.max(1, Math.round(iw * scale)));
  const dh = Math.min(W, Math.max(1, Math.round(ih * scale)));
  const left = Math.max(0, Math.min(W - dw, Math.round(anchor.x + (anchor.w - dw) / 2)));
  const top = Math.max(0, Math.min(W - dh, anchor.topAnchor ? anchor.y : Math.round(anchor.y + (anchor.h - dh) / 2)));
  const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }]).png().toBuffer();
}

// ---- stitch-specific -------------------------------------------------------

/** Crop → letterbox-pad to square with the crop's own corner color → 1024². */
async function cropToSquare(src: string, region: { left: number; top: number; width: number; height: number }): Promise<{ buf: Buffer; scale: number; offX: number; offY: number }> {
  const crop = await sharp(src).extract(region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const corner = crop.data.slice(0, 4); // top-left pixel = page/card bg
  const bg = { r: corner[0], g: corner[1], b: corner[2] };
  const side = Math.max(region.width, region.height);
  const canvas = await sharp({ create: { width: side, height: side, channels: 4, background: { ...bg, alpha: 1 } } })
    .composite([{ input: Buffer.from(crop.data), raw: { width: region.width, height: region.height, channels: 4 }, left: 0, top: 0 }])
    .png().toBuffer();
  const buf = await sharp(canvas).resize(W, W, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return { buf, scale: W / side, offX: 0, offY: 0 };
}

/** Native-res LIGHT flood: removes border-connected light pixels (white page,
 *  pastel circle backdrops, silver robot bodies — all lum>152 & sat<0.30).
 *  Dark outlines block the flood, so enclosed light interiors survive. This
 *  is what the white-tolerance flood could NOT do: silver (195,205,215) sits
 *  within 85 of white and got tunnelled through by the gradient follower. */
function keyLightFlood(data: Buffer, w: number, h: number): { alpha: Buffer; removedPct: number } {
  const alpha = Buffer.alloc(w * h, 255);
  const isLight = (i: number) => {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    return lum > 152 && sat < 0.30;
  };
  const stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
  let removed = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (alpha[i] === 0 || !isLight(i)) continue;
    alpha[i] = 0;
    removed++;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return { alpha, removedPct: removed / (w * h) };
}

interface CompInfo { pixels: number[]; x1: number; y1: number; x2: number; y2: number; n: number; touchesBorder: boolean }

/** Connected components with border-touch info (interior = item, border =
 *  hair/body sharing the predicate). */
function componentsWithBorderInfo(mask: Buffer, w: number, h: number): CompInfo[] {
  const seen = new Uint8Array(w * h);
  const out: CompInfo[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || mask[i] === 0) continue;
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
        if (!seen[n] && mask[n] > 0) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    if (pixels.length > 40) out.push({ pixels, x1, y1, x2, y2, n: pixels.length, touchesBorder: touches });
  }
  return out;
}

interface NativeComp { alpha: Buffer; keptPct: number; n: number }

/** Components at native res. mode 'largest' keeps one blob; 'multi' keeps all
 *  blobs ≥ 8% of the largest (headphones = band + 2 cups, disconnected once
 *  the head is keyed out) and drops specks like antenna tips. */
function componentsNative(alpha: Buffer, w: number, h: number, mode: 'largest' | 'multi'): NativeComp {
  const seen = new Uint8Array(w * h);
  const all: number[][] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || alpha[i] <= 40) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      comp.push(idx);
      const x = idx % w, y = (idx - x) / w;
      const push = (nx: number, ny: number) => {
        const n = ny * w + nx;
        if (!seen[n] && alpha[n] > 40) { seen[n] = 1; stack.push(n); }
      };
      if (x > 0) push(x - 1, y);
      if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1);
      if (y < h - 1) push(x, y + 1);
    }
    if (comp.length > 30) all.push(comp);
  }
  if (!all.length) return { alpha, keptPct: 0, n: 0 };
  all.sort((a, b) => b.length - a.length);
  const keep = mode === 'largest' ? all.slice(0, 1) : all.filter((c) => c.length >= all[0].length * 0.08);
  const out = Buffer.alloc(w * h, 0);
  let kept = 0;
  for (const comp of keep) for (const idx of comp) { out[idx] = alpha[idx]; kept++; }
  return { alpha: out, keptPct: kept / (w * h), n: keep.length };
}

async function main() {
  // ---- robot base (stitch3, clean, largest) + kid bases (stitch2, as-worn) --
  const BASES = [
    ...ROBOTS,
    { id: 'kid_stitch_A', src: 'stitch2.png', box: { left: 106, top: 290, width: 410, height: 440 } },
    { id: 'kid_stitch_B', src: 'stitch2.png', box: { left: 505, top: 290, width: 415, height: 440 } },
  ];
  for (const robot of BASES) {
    const src = path.join(OUT, robot.src);
    const bw = robot.box.width, bh = robot.box.height;
    const { data } = await sharp(src).extract(robot.box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { alpha, removedPct } = keyLightFlood(data, bw, bh);
    const cc = componentsNative(alpha, bw, bh, 'largest');
    console.log(`${robot.id} light-key ${(removedPct * 100).toFixed(0)}% → component ${(cc.keptPct * 100).toFixed(1)}%`);
    const rgbaN = Buffer.allocUnsafe(bw * bh * 4);
    for (let i = 0, p = 0; i < bw * bh; i++, p += 4) {
      rgbaN[p] = data[p]; rgbaN[p + 1] = data[p + 1]; rgbaN[p + 2] = data[p + 2];
      rgbaN[p + 3] = cc.alpha[i];
    }
    const cutout = await sharp(Buffer.from(rgbaN), { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
    const layer = await alignToSkeleton(cutout);
    fs.writeFileSync(path.join(OUT, 'extracted', `${robot.id}.png`), layer);
    const flat = await sharp(layer).flatten({ background: '#ffffff' }).resize(512, 512).png().toBuffer();
    fs.writeFileSync(path.join(OUT, `${robot.id}_preview.png`), flat);
  }

  // ---- worn items (color-mask extraction inside head regions) ---------------
  for (const obj of WORN) {
    const bw = obj.region.width, bh = obj.region.height;
    const { data } = await sharp(path.join(OUT, obj.src)).extract(obj.region).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pred = PRED[obj.pred];
    const maskRaw = Buffer.alloc(bw * bh, 255);
    let hits = 0;
    for (let i = 0, p = 0; i < bw * bh; i++, p += 4) {
      if (pred(data[p], data[p + 1], data[p + 2])) { maskRaw[i] = 255; hits++; }
      else maskRaw[i] = 0;
    }
    // components over the predicate mask; drop border-touching when hair/body
    // shares the predicate (dark hair vs dark shades) and items sit interior.
    const comps = componentsWithBorderInfo(maskRaw, bw, bh);
    const interior = comps.filter((c) => obj.borderOk || !c.touchesBorder);
    const pool = (interior.length ? interior : comps).sort((a, b) => b.n - a.n);
    const keep = obj.mode === 'multi'
      ? pool.filter((c) => c.n >= pool[0].n * 0.08)
      : pool.slice(0, 1);
    const alpha = Buffer.alloc(bw * bh, 0);
    for (const c of keep) for (const idx of c.pixels) alpha[idx] = 255;
    console.log(`${obj.id} pred ${(hits / (bw * bh) * 100).toFixed(0)}% → kept ${keep.length} comp(s) ${keep.map((c) => (c.x2 - c.x1 + 1) + 'x' + (c.y2 - c.y1 + 1)).join('+')}`);
    const rgbaN = Buffer.allocUnsafe(bw * bh * 4);
    for (let i = 0, p = 0; i < bw * bh; i++, p += 4) {
      rgbaN[p] = data[p]; rgbaN[p + 1] = data[p + 1]; rgbaN[p + 2] = data[p + 2];
      rgbaN[p + 3] = alpha[i];
    }
    const cutout = await sharp(Buffer.from(rgbaN), { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
    const big = await sharp(cutout).resize(W, W, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
    const alphaBig = Buffer.alloc(W * W, 255);
    for (let i = 0; i < W * W; i++) alphaBig[i] = big[i * 4 + 3];
    const layer = await buildAnchoredLayer(big, alphaBig, obj.slot);
    fs.writeFileSync(path.join(OUT, 'extracted', `${obj.id}.png`), layer);
  }

  // ---- grayscale cowboy hat (stitch1) → gray + brown-tinted variants -------
  {
    const bw = COWBOY.box.width, bh = COWBOY.box.height;
    const { data } = await sharp(path.join(OUT, COWBOY.src)).extract(COWBOY.box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // slate card key: flood border-connected pixels near the sampled card fill
    const ref: [number, number, number] = [data[0], data[1], data[2]];
    const alpha = Buffer.alloc(bw * bh, 255);
    const nearRef = (i: number) => {
      const p = i * 4;
      return Math.sqrt((data[p] - ref[0]) ** 2 + (data[p + 1] - ref[1]) ** 2 + (data[p + 2] - ref[2]) ** 2) <= 45;
    };
    const stack: number[] = [];
    for (let x = 0; x < bw; x++) { stack.push(x); stack.push((bh - 1) * bw + x); }
    for (let y = 0; y < bh; y++) { stack.push(y * bw); stack.push(y * bw + bw - 1); }
    while (stack.length) {
      const i = stack.pop()!;
      if (alpha[i] === 0 || !nearRef(i)) continue;
      alpha[i] = 0;
      const x = i % bw, y = (i - x) / bw;
      if (x > 0) stack.push(i - 1);
      if (x < bw - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - bw);
      if (y < bh - 1) stack.push(i + bw);
    }
    const cc = componentsNative(alpha, bw, bh, 'largest');
    console.log(`cowboy slate-key → component ${(cc.keptPct * 100).toFixed(1)}% (ref ${ref.join(',')})`);

    const buildVariant = async (id: string, tint: [number, number, number] | null) => {
      const rgbaN = Buffer.allocUnsafe(bw * bh * 4);
      for (let i = 0, p = 0; i < bw * bh; i++, p += 4) {
        if (tint) {
          // luminance → tint ramp: black→30% tint, white→100%+lighten
          const lum = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255;
          rgbaN[p] = Math.round(tint[0] * (0.3 + 0.7 * lum) + 40 * lum);
          rgbaN[p + 1] = Math.round(tint[1] * (0.3 + 0.7 * lum) + 40 * lum);
          rgbaN[p + 2] = Math.round(tint[2] * (0.3 + 0.7 * lum) + 40 * lum);
        } else {
          rgbaN[p] = data[p]; rgbaN[p + 1] = data[p + 1]; rgbaN[p + 2] = data[p + 2];
        }
        rgbaN[p + 3] = cc.alpha[i];
      }
      const cutout = await sharp(Buffer.from(rgbaN), { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
      const big = await sharp(cutout).resize(W, W, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
      const alphaBig = Buffer.alloc(W * W, 255);
      for (let i = 0; i < W * W; i++) alphaBig[i] = big[i * 4 + 3];
      const layer = await buildAnchoredLayer(big, alphaBig, 'headwear');
      fs.writeFileSync(path.join(OUT, 'extracted', `${id}.png`), layer);
    };
    await buildVariant('headwear_cowboy_stitch_gray', null);
    await buildVariant('headwear_cowboy_stitch', [150, 105, 65]); // saddle brown
  }
  console.log('DONE extraction');
}

main().catch((e) => { console.error(e); process.exit(1); });
