// Stitch batch-2 extraction — generalized: auto-detects components per screen,
// assigns them to 2x2 quadrants (or lineup x-slots), merges multi-part items
// (wings, horn pairs), and builds production-format layers:
//   bases    → alignToSkeleton (h900/top62 canvas)
//   items    → buildAnchoredLayer (slot anchor)
//   bgs      → quadrant → 1024 cover
// Run: npx tsx scripts/avatars/stitch2-extract.ts [--raw-only]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { ITEM_ANCHORS } from './manifest.js';

const W = 1024;
const SRC = path.join(import.meta.dirname, 'out', 'stitch2', 'src');
const OUT = path.join(import.meta.dirname, 'out', 'stitch2');
const EXTRACTED = path.join(OUT, 'extracted');
fs.mkdirSync(EXTRACTED, { recursive: true });
const RAW_ONLY = process.argv.includes('--raw-only');

// ---- light flood (native res) ---------------------------------------------
function keyLightFlood(data: Buffer, w: number, h: number): Buffer {
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
  while (stack.length) {
    const i = stack.pop()!;
    if (alpha[i] === 0 || !isLight(i)) continue;
    alpha[i] = 0;
    const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return alpha;
}

interface Comp { pixels: number[]; x1: number; y1: number; x2: number; y2: number; n: number }

function components(alpha: Buffer, w: number, h: number, minPx = 300): Comp[] {
  const seen = new Uint8Array(w * h);
  const out: Comp[] = [];
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || alpha[i] <= 40) continue;
    const pixels: number[] = [];
    const stack = [i];
    seen[i] = 1;
    let x1 = 1e9, y1 = 1e9, x2 = -1, y2 = -1;
    while (stack.length) {
      const idx = stack.pop()!;
      pixels.push(idx);
      const x = idx % w, y = (idx - x) / w;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      const push = (nx: number, ny: number) => {
        const nn = ny * w + nx;
        if (!seen[nn] && alpha[nn] > 40) { seen[nn] = 1; stack.push(nn); }
      };
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    if (pixels.length >= minPx) out.push({ pixels, x1, y1, x2, y2, n: pixels.length });
  }
  return out;
}

// ---- layer builders ---------------------------------------------------------
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

async function buildAnchoredLayer(cutoutPng: Buffer, slot: string): Promise<Buffer> {
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

async function cutoutPng(data: Buffer, alpha: Buffer, w: number, h: number): Promise<Buffer> {
  const out = Buffer.allocUnsafe(w * h * 4);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    out[p] = data[p]; out[p + 1] = data[p + 1]; out[p + 2] = data[p + 2];
    out[p + 3] = alpha[i];
  }
  return sharp(Buffer.from(out), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

// ---- configs ----------------------------------------------------------------
// Quadrant order per sheet = the order the objects were listed in the Stitch
// prompt (TL, TR, BL, BR). Multi-part items merge all comps in a quadrant.
const BASES: Record<string, { id: string }> = {
  base1: { id: 'human_boy' }, base2: { id: 'human_girl' }, base3: { id: 'robot' },
  base4: { id: 'alien' }, base5: { id: 'monster' }, base6: { id: 'dragon' },
};

type SheetSpec = { id: string; slot: string }[]; // [TL, TR, BL, BR]
const SHEETS: Record<string, SheetSpec> = {
  sheet_hats: [
    { id: 'headwear_cap_red', slot: 'headwear' }, { id: 'headwear_cowboy_hat', slot: 'headwear' },
    { id: 'headwear_beanie_yellow', slot: 'headwear' }, { id: 'headwear_crown_gold', slot: 'headwear' },
  ],
  sheet_headwear: [
    { id: 'headwear_party_hat', slot: 'headwear' }, { id: 'headwear_wizard_hat', slot: 'headwear' },
    { id: 'headwear_flower_crown', slot: 'headwear' }, { id: 'headwear_headphones', slot: 'headwear' },
  ],
  sheet_eyewear1: [
    { id: 'face_shades_black', slot: 'face' }, { id: 'face_glasses_round_yellow', slot: 'face' },
    { id: 'face_glasses_nerd_red', slot: 'face' }, { id: 'face_eye_patch', slot: 'face' },
  ],
  sheet_eyewear2: [
    { id: 'face_ski_goggles', slot: 'face' }, { id: 'face_shades_heart_pink', slot: 'face' },
    { id: 'face_glasses_round_blue', slot: 'face' }, { id: 'face_shades_star', slot: 'face' },
  ],
  sheet_handheld1: [
    { id: 'handheld_balloon_red', slot: 'handheld' }, { id: 'handheld_soccer_ball', slot: 'handheld' },
    { id: 'handheld_ice_cream', slot: 'handheld' }, { id: 'handheld_book', slot: 'handheld' },
  ],
  sheet_handheld2: [
    { id: 'handheld_trophy', slot: 'handheld' }, { id: 'handheld_game_controller', slot: 'handheld' },
    { id: 'handheld_pencil', slot: 'handheld' }, { id: 'handheld_microphone', slot: 'handheld' },
  ],
  sheet_back: [
    { id: 'back_cape_red', slot: 'back' }, { id: 'back_wings_fairy', slot: 'back' },
    { id: 'back_jetpack', slot: 'back' }, { id: 'back_backpack_school', slot: 'back' },
  ],
  sheet_shirts: [
    { id: 'outfit_superhero_top', slot: 'outfit' }, { id: 'outfit_pirate_top', slot: 'outfit' },
    { id: 'outfit_astronaut_top', slot: 'outfit' }, { id: 'outfit_hoodie_red', slot: 'outfit' },
  ],
  sheet_wigs1: [
    { id: 'hair_spiky_brown', slot: 'hair' }, { id: 'hair_curly_brown', slot: 'hair' },
    { id: 'hair_mohawk', slot: 'hair' }, { id: 'hair_buzz_cut', slot: 'hair' },
  ],
  sheet_wigs2: [
    { id: 'hair_braids_long', slot: 'hair' }, { id: 'hair_pigtails', slot: 'hair' },
    { id: 'hair_top_bun', slot: 'hair' }, { id: 'hair_wavy_long', slot: 'hair' },
  ],
  sheet_robot: [
    { id: 'headwear_antenna_bolt', slot: 'headwear' }, { id: 'headwear_antenna_sphere', slot: 'headwear' },
    { id: 'face_pixel_smile', slot: 'face' }, { id: 'headwear_antenna_spring', slot: 'headwear' },
  ],
  sheet_monster: [
    { id: 'headwear_horns_gold', slot: 'headwear' }, { id: 'headwear_horns_devil', slot: 'headwear' },
    { id: 'outfit_fur_collar', slot: 'outfit' }, { id: 'handheld_star_medal', slot: 'handheld' },
  ],
  sheet_dragon: [
    { id: 'back_wings_dragon', slot: 'back' }, { id: 'back_tail_bow', slot: 'back' },
    { id: 'hair_scale_mohawk', slot: 'hair' }, { id: 'headwear_flame_clip', slot: 'headwear' },
  ],
  sheet_alien: [
    { id: 'headwear_star_clip', slot: 'headwear' }, { id: 'headwear_antenna_rings', slot: 'headwear' },
    { id: 'face_space_visor', slot: 'face' }, { id: 'face_third_eye_monocle', slot: 'face' },
  ],
};
const BACKGROUNDS = ['bg_park', 'bg_space', 'bg_forest', 'bg_beach']; // TL, TR, BL, BR

const QUADRANTS = [
  { name: 'TL', test: (cx: number, cy: number, w: number, h: number) => cx < w / 2 && cy < h / 2 },
  { name: 'TR', test: (cx: number, cy: number, w: number, h: number) => cx >= w / 2 && cy < h / 2 },
  { name: 'BL', test: (cx: number, cy: number, w: number, h: number) => cx < w / 2 && cy >= h / 2 },
  { name: 'BR', test: (cx: number, cy: number, w: number, h: number) => cx >= w / 2 && cy >= h / 2 },
];

async function main() {
  // ---- raw crops (always): quadrant montage for id verification ----------
  for (const file of fs.readdirSync(SRC).sort()) {
    const name = file.replace('.png', '');
    const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    const alpha = keyLightFlood(data, w, h);
    const comps = components(alpha, w, h, name === 'lineup' ? 3000 : 300);
    const rawDir = path.join(OUT, 'raw', name);
    fs.mkdirSync(rawDir, { recursive: true });

    const writeCutout = async (id: string, merged: Buffer) => {
      const png = await cutoutPng(data, merged, w, h);
      // trim to bbox for compact raw preview
      const trimmed = await sharp(png).trim({ threshold: 12 }).png().toBuffer();
      fs.writeFileSync(path.join(rawDir, id + '.png'), trimmed);
      return trimmed;
    };

    if (name.startsWith('base')) continue; // bases: single comp, no quadrants
    if (name === 'lineup') continue; // reference only, handled below
    const buckets: Record<string, Comp[]> = { TL: [], TR: [], BL: [], BR: [] };
    for (const c of comps) {
      const cx = (c.x1 + c.x2) / 2, cy = (c.y1 + c.y2) / 2;
      for (const q of QUADRANTS) if (q.test(cx, cy, w, h)) buckets[q.name].push(c);
    }
    let idx = 0;
    for (const q of ['TL', 'TR', 'BL', 'BR'] as const) {
      if (!buckets[q].length) { console.log(`${name} ${q}: EMPTY`); continue; }
      const merged = Buffer.alloc(w * h, 0);
      for (const c of buckets[q]) for (const i of c.pixels) merged[i] = alpha[i];
      const label = SHEETS[name]?.[idx]?.id ?? (name === 'backgrounds' ? BACKGROUNDS[idx] : q);
      await writeCutout(label, merged);
      const c0 = buckets[q][0];
      console.log(`${name} ${q} → ${label} (${buckets[q].length} part(s), ${c0.x1},${c0.y1} box)`);
      idx++;
    }
  }

  if (RAW_ONLY) { console.log('raw-only done'); return; }

  // ---- production layers ---------------------------------------------------
  // bases
  for (const [file, spec] of Object.entries(BASES)) {
    const { data, info } = await sharp(path.join(SRC, file + '.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    const alpha = keyLightFlood(data, w, h);
    const comps = components(alpha, w, h, 3000).sort((a, b) => b.n - a.n);
    const merged = Buffer.alloc(w * h, 0);
    for (const i of comps[0].pixels) merged[i] = alpha[i];
    const png = await cutoutPng(data, merged, w, h);
    const layer = await alignToSkeleton(png);
    fs.writeFileSync(path.join(EXTRACTED, spec.id + '.png'), layer);
    console.log(`base ${spec.id} ✓ (${(comps[0].n / 1000).toFixed(0)}k px)`);
  }
  // items from raw quadrant cutouts
  for (const [sheet, specs] of Object.entries(SHEETS)) {
    for (const spec of specs) {
      const rawPath = path.join(OUT, 'raw', sheet, spec.id + '.png');
      if (!fs.existsSync(rawPath)) { console.log(`MISSING raw ${sheet}/${spec.id}`); continue; }
      const big = await sharp(rawPath).resize(W, W, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
      const alphaBig = Buffer.alloc(W * W, 255);
      for (let i = 0; i < W * W; i++) alphaBig[i] = big[i * 4 + 3];
      const layer = await buildAnchoredLayer(await sharp(rawPath).png().toBuffer(), spec.slot);
      fs.writeFileSync(path.join(EXTRACTED, spec.id + '.png'), layer);
    }
    console.log(`sheet ${sheet} → ${specs.length} layers`);
  }
  // backgrounds: quadrant from raw, resize cover
  for (const bg of BACKGROUNDS) {
    const rawPath = path.join(OUT, 'raw', 'backgrounds', bg + '.png');
    if (!fs.existsSync(rawPath)) continue;
    const layer = await sharp(rawPath).resize(W, W, { fit: 'cover', position: 'centre' }).png().toBuffer();
    fs.writeFileSync(path.join(EXTRACTED, bg + '.png'), layer);
  }
  console.log('backgrounds → 4 layers');
  console.log('DONE stitch2 extraction');
}

main().catch((e) => { console.error(e); process.exit(1); });
