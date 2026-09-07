// Stitch test review sheet — review-only composites, no catalog/live changes.
// Rows: stitch bases alone → + our existing seedream items (shared-skeleton
// compatibility) → stitch cap on all 6 current bodies.
// Run: npx tsx scripts/avatars/stitch-sheet.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.join(import.meta.dirname, 'out');
const STITCH = path.join(HERE, 'stitch', 'extracted');
const EXTRACTED = path.join(HERE, 'extracted');
const MASTERS = path.join(HERE, 'masters');
const CELL = 240;
const GAP = 12;
const ROW_H = CELL + 44;

async function compositeCell(base: string, layers: string[]): Promise<Buffer> {
  let img = sharp(path.join(STITCH, base + '.png')).png();
  const comps = layers
    .map((l) => ({ input: fs.readFileSync(path.join(EXTRACTED, l + '.png')), top: 0, left: 0 }));
  if (comps.length) img = img.composite(comps);
  const flat = await img.flatten({ background: '#ffffff' }).png().toBuffer();
  return sharp(flat).resize(CELL, CELL, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
}

async function bodyCell(master: string, layerFile: string): Promise<Buffer> {
  const flat = await sharp(path.join(MASTERS, master))
    .composite([{ input: fs.readFileSync(path.join(STITCH, layerFile)), top: 0, left: 0 }])
    .flatten({ background: '#ffffff' }).png().toBuffer();
  return sharp(flat).resize(CELL, CELL, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
}

const label = (t: string, w: number) =>
  Buffer.from(`<svg width='${w}' height='30'><text x='0' y='21' font-size='16' font-family='sans-serif' fill='#111'>${t}</text></svg>`);

async function main() {
  const rows: { title: string; cells: Buffer[] }[] = [];

  rows.push({
    title: 'STITCH BASES (extracted, as-generated)',
    cells: await Promise.all(['robot_stitch', 'kid_stitch_A', 'kid_stitch_B'].map((b) => compositeCell(b, []))),
  });
  rows.push({
    title: 'STITCH BASES + our existing black shades (seedream art)',
    cells: await Promise.all(['robot_stitch', 'kid_stitch_A', 'kid_stitch_B'].map((b) => compositeCell(b, ['face_shades_classic']))),
  });
  rows.push({
    title: 'STITCH BASES + our existing cowboy hat (seedream art)',
    cells: await Promise.all(['robot_stitch', 'kid_stitch_A', 'kid_stitch_B'].map((b) => compositeCell(b, ['headwear_cowboy_hat']))),
  });
  rows.push({
    title: 'STITCH BASES + our existing red cap (seedream art)',
    cells: await Promise.all(['robot_stitch', 'kid_stitch_A', 'kid_stitch_B'].map((b) => compositeCell(b, ['headwear_cap_red']))),
  });
  const bodies = ['human_boy', 'human_girl', 'robot', 'robot_bender', 'alien', 'monster'];
  rows.push({
    title: 'STITCH CAP (angled) on our 6 current bodies',
    cells: await Promise.all(bodies.map((b) => bodyCell(`${b}_skin1.png`, 'headwear_cap_red_stitch.png'))),
  });

  const maxCols = Math.max(...rows.map((r) => r.cells.length));
  const width = maxCols * (CELL + GAP) + 20;
  const height = rows.length * ROW_H + 20;
  const comps: { input: Buffer; top: number; left: number }[] = [];
  rows.forEach((r, ri) => {
    comps.push({ input: label(r.title, width), top: ri * ROW_H + 8, left: 16 });
    r.cells.forEach((c, ci) => comps.push({ input: c, top: ri * ROW_H + 40, left: ci * (CELL + GAP) + 16 }));
  });
  await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(comps).png().toFile(path.join(HERE, 'stitch', 'review_sheet.png'));
  console.log('sheet written:', path.join(HERE, 'stitch', 'review_sheet.png'), width + 'x' + height);
}

main().catch((e) => { console.error(e); process.exit(1); });
