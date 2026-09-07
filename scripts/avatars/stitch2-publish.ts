// Stitch library publish — uploads production assets, renders roster
// defaults, then purges all retired seedream art. Run AFTER the catalog
// migration (20260907000001) and BEFORE the edge/Vercel deploy.
//   npx tsx scripts/avatars/stitch2-publish.ts [--no-purge]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.join(import.meta.dirname, 'out', 'stitch2', 'extracted');
const BASES = ['human_boy', 'human_girl', 'robot', 'alien', 'monster', 'dragon'];
const LAYERS = [
  'headwear_cap_red', 'headwear_beanie_yellow', 'headwear_party_hat', 'headwear_cowboy_hat',
  'headwear_wizard_hat', 'headwear_flower_crown', 'headwear_headphones', 'headwear_crown_gold',
  'face_shades_black', 'face_glasses_round_yellow', 'face_glasses_nerd_red', 'face_glasses_round_blue',
  'face_eye_patch', 'face_ski_goggles', 'face_shades_heart_pink', 'face_shades_star',
  'handheld_balloon_red', 'handheld_book', 'handheld_pencil', 'handheld_soccer_ball',
  'handheld_ice_cream', 'handheld_game_controller', 'handheld_microphone', 'handheld_trophy',
  'back_backpack_school', 'back_cape_red', 'back_wings_fairy', 'back_jetpack',
  'outfit_hoodie_red', 'outfit_pirate_top', 'outfit_superhero_top', 'outfit_astronaut_top',
  'bg_park', 'bg_forest', 'bg_beach', 'bg_space',
  'hair_spiky_brown', 'hair_curly_brown', 'hair_buzz_cut', 'hair_mohawk',
  'hair_braids_long', 'hair_pigtails', 'hair_wavy_long', 'hair_top_bun',
  'headwear_antenna_bolt', 'headwear_antenna_sphere', 'headwear_antenna_spring', 'face_pixel_smile',
  'headwear_horns_gold', 'headwear_horns_devil', 'outfit_fur_collar', 'handheld_star_medal',
  'back_wings_dragon', 'back_tail_bow', 'hair_scale_mohawk', 'headwear_flame_clip',
  'headwear_star_clip', 'face_space_visor', 'headwear_antenna_rings', 'face_third_eye_monocle',
];
const SIZES = [128, 256, 512, 768];

function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of fs.readFileSync(path.resolve(import.meta.dirname, '../../.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* none */ }
  return out;
}

async function main() {
  const PAT = process.env.SUPABASE_ACCESS_TOKEN || readEnvLocal().SUPABASE_ACCESS_TOKEN;
  if (!PAT) throw new Error('SUPABASE_ACCESS_TOKEN missing');
  const keyRows = await (await fetch('https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/api-keys', {
    headers: { Authorization: `Bearer ${PAT}` },
  })).json();
  const svc = keyRows.filter((k: any) => k.name === 'service_role').map((k: any) => k.api_key)
    .sort((a: string, b: string) => (b.startsWith('eyJ') ? 1 : 0) - (a.startsWith('eyJ') ? 1 : 0))[0];
  const SUPA = 'https://xsdnzijketjnzhakqtit.supabase.co';
  const authHeaders = { apikey: svc, Authorization: `Bearer ${svc}` };

  const upload = async (remote: string, bytes: Buffer) => {
    const r = await fetch(`${SUPA}/storage/v1/object/generated-media/${remote}`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: bytes,
    });
    if (!r.ok) throw new Error(`upload ${remote} ${r.status}: ${(await r.text()).slice(0, 150)}`);
  };

  // 1) bases (single-skin paths)
  for (const b of BASES) {
    await upload(`avatars/bases/${b}.png`, fs.readFileSync(path.join(HERE, b + '.png')));
    console.log(`base ${b} ✓`);
  }

  // 2) item layers + trimmed 256 thumbs
  for (const id of LAYERS) {
    const layerBytes = fs.readFileSync(path.join(HERE, id + '.png'));
    await upload(`avatars/layers/${id}.png`, layerBytes);
    const thumb = await sharp(layerBytes).trim({ threshold: 12 })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
    await upload(`avatars/thumbs/${id}.png`, thumb);
    process.stdout.write('.');
  }
  console.log(`\n${LAYERS.length} layers + thumbs ✓`);

  // 3) roster defaults: 12 = each base on two different backgrounds
  const DEFAULT_PAIRS: [string, string][] = [
    ['human_boy', 'bg_park'], ['human_girl', 'bg_forest'], ['robot', 'bg_space'],
    ['alien', 'bg_beach'], ['monster', 'bg_forest'], ['dragon', 'bg_beach'],
    ['human_boy', 'bg_beach'], ['human_girl', 'bg_park'], ['robot', 'bg_park'],
    ['alien', 'bg_space'], ['monster', 'bg_beach'], ['dragon', 'bg_forest'],
  ];
  for (let i = 0; i < 12; i++) {
    const [body, bg] = DEFAULT_PAIRS[i];
    const flat = await sharp(path.join(HERE, bg + '.png'))
      .composite([{ input: fs.readFileSync(path.join(HERE, body + '.png')), top: 0, left: 0 }])
      .png().toBuffer();
    for (const s of SIZES) {
      await upload(`avatars/defaults/def${i}_${s}.png`, await sharp(flat).resize(s, s).png().toBuffer());
    }
    process.stdout.write(`def${i}(${body}+${bg}) `);
  }
  console.log('\ndefaults ✓');

  if (process.argv.includes('--no-purge')) { console.log('purge skipped'); return; }

  // 4) purge retired art: everything under avatars/ except the new set
  const keep = new Set<string>([
    ...BASES.map((b) => `avatars/bases/${b}.png`),
    ...LAYERS.map((l) => `avatars/layers/${l}.png`),
    ...LAYERS.map((l) => `avatars/thumbs/${l}.png`),
    ...Array.from({ length: 12 }, (_, i) => SIZES.map((s) => `avatars/defaults/def${i}_${s}.png`)).flat(),
  ]);
  const listAll = async (prefix: string): Promise<string[]> => {
    const out: string[] = [];
    let offset = 0;
    for (;;) {
      const r = await fetch(`${SUPA}/storage/v1/object/list/generated-media`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 200, offset, sort: { column: 'name', order: 'asc' } }),
      });
      const items = await r.json();
      if (!Array.isArray(items) || items.length === 0) break;
      for (const it of items) {
        const p = `${prefix}${it.name}`;
        if (it.id === null) out.push(...(await listAll(p + '/')));
        else out.push(p);
      }
      offset += items.length;
      if (items.length < 200) break;
    }
    return out;
  };
  const del = async (paths: string[]) => {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const r = await fetch(`${SUPA}/storage/v1/object/generated-media`, {
        method: 'DELETE',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: chunk }),
      });
      if (!r.ok) throw new Error(`delete ${r.status}: ${(await r.text()).slice(0, 150)}`);
    }
  };
  for (const dir of ['avatars/bases/', 'avatars/layers/', 'avatars/thumbs/', 'avatars/defaults/', 'avatars/renders/']) {
    const all = await listAll(dir);
    const doomed = all.filter((p) => !keep.has(p));
    if (doomed.length) await del(doomed);
    console.log(`purge ${dir}: ${doomed.length} deleted (${all.length - doomed.length} kept)`);
  }
  console.log('PUBLISH DONE');
}

main().catch((e) => { console.error(e); process.exit(1); });
