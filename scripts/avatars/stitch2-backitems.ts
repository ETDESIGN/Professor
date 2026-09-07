// Round-2 back items: extract the usable CAPE from the regenerated sheet
// (sheet_backitems2, TR quadrant) and salvage the DRAGON TAIL by placing it
// to peek from behind the lower-left hip (front-facing semantics). Also
// builds audit composites. Run: npx tsx scripts/avatars/stitch2-backitems.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const W = 1024;
const OUT = path.join(import.meta.dirname, 'out', 'stitch2');
const EXTRACTED = path.join(OUT, 'extracted');
const SRC2 = path.join(OUT, 'src', 'sheet_backitems2.png'); // owner screenshot, top 70px cropped

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

function largestComp(alpha: Buffer, w: number, h: number): Buffer {
  const seen = new Uint8Array(w * h);
  let best: number[] | null = null;
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
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    if (!best || comp.length > best.length) best = comp;
  }
  const out = Buffer.alloc(w * h, 0);
  if (best) for (const i of best) out[i] = alpha[i];
  return out;
}

async function cutoutAt(src: string, box: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const { data, info } = await sharp(src).extract(box).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = largestComp(keyLightFlood(data, info.width, info.height), info.width, info.height);
  const out = Buffer.allocUnsafe(info.width * info.height * 4);
  for (let i = 0, p = 0; i < info.width * info.height; i++, p += 4) {
    out[p] = data[p]; out[p + 1] = data[p + 1]; out[p + 2] = data[p + 2];
    out[p + 3] = alpha[i];
  }
  return sharp(Buffer.from(out), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function placeFree(cutoutPng: Buffer, dw: number, dh: number, left: number, top: number): Promise<Buffer> {
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const sprite = await sharp(trimmed).resize(dw, dh, { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: W, height: W, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }]).png().toBuffer();
}

async function fitAnchor(cutoutPng: Buffer, slot: 'back' | 'handheld'): Promise<Buffer> {
  const anchors = { back: { x: 280, y: 430, w: 464, h: 470 }, handheld: { x: 700, y: 470, w: 260, h: 340 } };
  const a = anchors[slot];
  const trimmed = await sharp(cutoutPng).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const iw = meta.width || 1, ih = meta.height || 1;
  const scale = Math.min(a.w / iw, a.h / ih, 1);
  const dw = Math.round(iw * scale), dh = Math.round(ih * scale);
  return placeFree(trimmed, dw, dh, Math.round(a.x + (a.w - dw) / 2), Math.round(a.y + (a.h - dh) / 2));
}

async function main() {
  // 1) CAPE from regenerated sheet TR quadrant → replace back_cape_red
  const cape = await cutoutAt(SRC2, { left: 673, top: 65, width: 570, height: 478 });
  const capeLayer = await fitAnchor(cape, 'back');
  fs.writeFileSync(path.join(EXTRACTED, 'back_cape_red.png'), capeLayer);
  console.log('cape: replaced back_cape_red');

  // 2) TAIL candidates → peek from behind lower-left hip
  //    a) round-2 BR quadrant  b) round-1 sheet_back raw
  const tail2 = await cutoutAt(SRC2, { left: 724, top: 692, width: 510, height: 422 });
  const tail1 = fs.existsSync(path.join(OUT, 'raw', 'sheet_dragon', 'back_tail_bow.png'))
    ? await sharp(path.join(OUT, 'raw', 'sheet_dragon', 'back_tail_bow.png')).png().toBuffer()
    : null;
  // place each: scale height ~330, anchored so only the left curl peeks out from behind the hip (hip ≈ x330-700, y500-700)
  const tail2Layer = await placeFree(tail2, 380, 330, 95, 470);
  fs.writeFileSync(path.join(EXTRACTED, 'back_tail_bow.png'), tail2Layer);
  console.log('tail2 (round-2) placed as back_tail_bow (lower-left peek)');
  if (tail1) fs.writeFileSync(path.join(OUT, 'tail1_candidate.png'), await placeFree(tail1, 380, 330, 95, 470));

  // 3) audit composites: dragon + cape, dragon + tail2, dragon + tail1
  const dragon = path.join(EXTRACTED, 'dragon.png');
  for (const [name, layerPath] of [
    ['audit_dragon_cape', path.join(EXTRACTED, 'back_cape_red.png')],
    ['audit_dragon_tail2', path.join(EXTRACTED, 'back_tail_bow.png')],
    ['audit_dragon_tail1', path.join(OUT, 'tail1_candidate.png')],
  ] as [string, string][]) {
    const flat = await sharp(dragon).composite([{ input: fs.readFileSync(layerPath), top: 0, left: 0 }])
      .flatten({ background: '#ffffff' }).png().toBuffer();
    fs.writeFileSync(path.join(OUT, name + '.png'), await sharp(flat).resize(512, 512).png().toBuffer());
  }
  console.log('audit composites written');
}

main().catch((e) => { console.error(e); process.exit(1); });
