// Stitch batch-2 review sheets — composites proving shared-skeleton fit.
// Run: npx tsx scripts/avatars/stitch2-sheet.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.join(import.meta.dirname, 'out', 'stitch2');
const EXTRACTED = path.join(HERE, 'extracted');
const CELL = 230;
const GAP = 10;
const ROW_H = CELL + 36;

const layer = (id: string) => fs.readFileSync(path.join(EXTRACTED, id + '.png'));

async function cell(ids: string[]): Promise<Buffer> {
  let img = sharp(layer(ids[0])).png();
  if (ids.length > 1) img = img.composite(ids.slice(1).map((l) => ({ input: layer(l), top: 0, left: 0 })));
  const flat = await img.flatten({ background: '#ffffff' }).png().toBuffer();
  return sharp(flat).resize(CELL, CELL, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
}

const label = (t: string, w: number) =>
  Buffer.from(`<svg width='${w}' height='28'><text x='0' y='20' font-size='15' font-family='sans-serif' fill='#111'>${t}</text></svg>`);

async function main() {
  const rows: { title: string; cells: Buffer[] }[] = [];
  const bases = ['human_boy', 'human_girl', 'robot', 'alien', 'monster', 'dragon'];

  // Universal items on every base (the fit test)
  const universal: [string, string[]][] = [
    ['black shades', ['face_shades_black']],
    ['cowboy hat', ['headwear_cowboy_hat']],
    ['red cap', ['headwear_cap_red']],
    ['wizard hat', ['headwear_wizard_hat']],
    ['headphones', ['headwear_headphones']],
    ['cape', ['back_cape_red']],
  ];
  for (const base of bases) {
    rows.push({
      title: `${base.toUpperCase()} — alone + universal items`,
      cells: await Promise.all([[base], ...universal.map(([, l]) => [base, ...l])].map((ids) => cell(ids))),
    });
  }

  // Exclusive items on their owners
  rows.push({
    title: 'BOY + wigs (spiky, curly, mohawk, buzz)',
    cells: await Promise.all([
      ['human_boy', 'hair_spiky_brown'], ['human_boy', 'hair_curly_brown'],
      ['human_boy', 'hair_mohawk'], ['human_boy', 'hair_buzz_cut'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'GIRL + wigs (braids, pigtails, bun, wavy)',
    cells: await Promise.all([
      ['human_girl', 'hair_braids_long'], ['human_girl', 'hair_pigtails'],
      ['human_girl', 'hair_top_bun'], ['human_girl', 'hair_wavy_long'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'ROBOT + antenna (bolt, sphere, spring) + pixel face + star shades',
    cells: await Promise.all([
      ['robot', 'headwear_antenna_bolt'], ['robot', 'headwear_antenna_sphere'],
      ['robot', 'headwear_antenna_spring'], ['robot', 'face_pixel_smile'], ['robot', 'face_shades_star'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'MONSTER + gold horns, devil horns | DRAGON + wings, tail | ALIEN + visor, monocle',
    cells: await Promise.all([
      ['monster', 'headwear_horns_gold'], ['monster', 'headwear_horns_devil'],
      ['dragon', 'back_wings_dragon'], ['dragon', 'back_tail_bow'],
      ['alien', 'face_space_visor'], ['alien', 'face_third_eye_monocle'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'BACK ITEMS after regeneration (backpack, jetpack straps-first + cape, tail salvage)',
    cells: await Promise.all([
      ['human_boy', 'back_backpack_school'], ['human_boy', 'back_jetpack'],
      ['robot', 'back_backpack_school'], ['robot', 'back_jetpack'],
      ['human_girl', 'back_cape_red'], ['dragon', 'back_tail_bow'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'ROBOT + outfits (superhero, pirate, astronaut, hoodie)',
    cells: await Promise.all([
      ['robot', 'outfit_superhero_top'], ['robot', 'outfit_pirate_top'],
      ['robot', 'outfit_astronaut_top'], ['robot', 'outfit_hoodie_red'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'ROBOT + handhelds (balloon, trophy, controller, ice cream)',
    cells: await Promise.all([
      ['robot', 'handheld_balloon_red'], ['robot', 'handheld_trophy'],
      ['robot', 'handheld_game_controller'], ['robot', 'handheld_ice_cream'],
    ].map((ids) => cell(ids))),
  });
  rows.push({
    title: 'BACKGROUNDS (park, space, forest, beach) + girl on park bg',
    cells: await Promise.all([
      ['bg_park'], ['bg_space'], ['bg_forest'], ['bg_beach'],
      ['bg_park', 'human_girl', 'headwear_flower_crown'],
    ].map((ids) => cell(ids))),
  });

  const maxCols = Math.max(...rows.map((r) => r.cells.length));
  const width = maxCols * (CELL + GAP) + 20;
  const height = rows.length * ROW_H + 20;
  const comps: { input: Buffer; top: number; left: number }[] = [];
  rows.forEach((r, ri) => {
    comps.push({ input: label(r.title, width), top: ri * ROW_H + 6, left: 16 });
    r.cells.forEach((c, ci) => comps.push({ input: c, top: ri * ROW_H + 32, left: ci * (CELL + GAP) + 16 }));
  });
  await sharp({ create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(comps).png().toFile(path.join(HERE, 'review_sheet.png'));
  console.log('sheet:', width + 'x' + height, rows.length, 'rows');
}

main().catch((e) => { console.error(e); process.exit(1); });
