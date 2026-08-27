// scripts/testing/illustration-bakeoff.ts — run with:
//   AI_API_KEY=sk-or-... npx tsx scripts/testing/illustration-bakeoff.ts
// Shortlist follow-up (reference-fidelity check) — 1-2 models, scene-* prompts
// use the uploaded portrait as input_reference:
//   AI_API_KEY=sk-or-... npx tsx scripts/testing/illustration-bakeoff.ts \
//     --model bytedance-seed/seedream-4.5 \
//     --refs 'https://xsdnzijketjnzhakqtit.supabase.co/storage/v1/object/public/generated-media/images/<unitId>/<file>.png'
// Generates 6 canonical prompts x 3 candidate models, saves images + an HTML
// contact sheet to /tmp/illustration-bakeoff/ for the owner to judge.
import { writeFileSync, mkdirSync } from 'node:fs';
import { callOpenRouterImages } from '../../supabase/functions/_shared/illustrationCore';

const KEY = process.env.AI_API_KEY;
if (!KEY) { console.error('AI_API_KEY env var required'); process.exit(1); }

const DEFAULT_MODELS = ['bytedance-seed/seedream-4.5', 'bytedance-seed/seedream-5-0-lite', 'black-forest-labs/flux.2-pro'];

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

// --model <id> (comma-separated list accepted): override the candidate list —
// used by the shortlist follow-up to re-run only 1-2 models.
const modelFlag = argValue('--model');
const MODELS = modelFlag ? modelFlag.split(',').map((m) => m.trim()).filter(Boolean) : DEFAULT_MODELS;

// --refs <public portrait URL>: passed as input_references for the two scene-*
// prompts. OpenRouter needs public URLs for input_references — local files
// won't do, which is why the main bake-off run leaves scenes un-ref'd.
const REFS_URL = argValue('--refs');
if (REFS_URL && !/^https?:\/\//.test(REFS_URL)) {
  console.error('--refs must be a public http(s) URL (OpenRouter cannot read local files)');
  process.exit(1);
}

const HOUSE = "modern children's picture-book illustration, soft rounded shapes, warm friendly palette, clean flat vector style with subtle gradients, gentle outlines, cheerful and expressive, high contrast for classroom projection, uncluttered composition";
const NO_TEXT = 'Strictly no text, no letters, no numbers, no logos, no watermark.';
const UNIT = { title: 'Space Adventure', topic: 'planets and rockets', dir: 'deep blue palette; rockets, stars, soft glow' };

const PROMPTS: { name: string; prompt: string; aspect: string }[] = [
  { name: 'vocab-astronaut', aspect: '1:1', prompt: `a cartoon astronaut child waving. Style: ${HOUSE}. single main subject, perfectly centered, plain soft background. Art direction: ${UNIT.dir}. Unit context: ${UNIT.title}. ${NO_TEXT}` },
  { name: 'vocab-planet', aspect: '1:1', prompt: `a happy cartoon planet with a ring, smiling. Style: ${HOUSE}. single main subject, perfectly centered, plain soft background. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'cover', aspect: '16:9', prompt: `cover illustration for the unit "${UNIT.title}" about ${UNIT.topic}. Style: ${HOUSE}. wide establishing scene, upper third visually calm for a title. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'portrait-mia', aspect: '1:1', prompt: `character portrait of Mia: a curious 8-year-old girl with curly hair and round glasses. Style: ${HOUSE}. bust portrait facing the viewer, friendly expression, simple soft background. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'scene-mia-launch', aspect: '16:9', prompt: `Mia the astronaut waving from a launchpad at night, rocket lights glowing behind her. Style: ${HOUSE}. cinematic storybook scene, characters drawn exactly as in the reference images. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
  { name: 'scene-mia-planet', aspect: '16:9', prompt: `Mia landing on a friendly planet, planting a small flag, stars above. Style: ${HOUSE}. cinematic storybook scene, characters drawn exactly as in the reference images. Art direction: ${UNIT.dir}. ${NO_TEXT}` },
];

const OUT = '/tmp/illustration-bakeoff';
mkdirSync(OUT, { recursive: true });

let totalCost = 0;

async function gen(model: string, name: string, prompt: string, aspect: string, refs?: string[]): Promise<string> {
  const r = await callOpenRouterImages({ openrouterKey: KEY! }, { model, prompt, aspectRatio: aspect, inputReferences: refs });
  // `r.ok === false` (not `!r.ok`): this non-strict tsconfig does not narrow
  // the ImageGenResult union inside a negated-truthiness branch.
  if (r.ok === false) { console.error(`FAIL ${model}/${name}: ${r.error}`); return ''; }
  const file = `${model.split('/')[1]}-${name}.png`;
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.b64, 'base64'));
  if (r.cost != null) totalCost += r.cost;
  console.log(`ok ${model}/${name} cost=${r.cost ?? '?'}`);
  return `${OUT}/${file}`;
}

function cell(model: string, name: string, img: string): string {
  const file = img ? img.split('/').pop() : '';
  return file
    ? `<div><h3>${model} — ${name}</h3><img src="${file}" width="360"></div>`
    : `<div><h3>${model} — ${name}</h3><p>FAILED</p></div>`;
}

async function main() {
  console.log(`bake-off: ${PROMPTS.length} prompts x ${MODELS.length} model(s): ${MODELS.join(', ')}${REFS_URL ? ` | scene refs: ${REFS_URL}` : ''}`);
  const cells: string[] = [];
  for (const model of MODELS) {
    for (const p of PROMPTS) {
      // NOTE: the main bake-off runs the scene-* prompts WITHOUT refs
      // (OpenRouter needs public URLs for input_references; local files
      // won't do). Reference-fidelity is judged in the shortlist
      // follow-up: after the owner shortlists 1-2 models, upload one
      // portrait to storage and re-run with --refs <public URL>.
      const useRefs = p.name.startsWith('scene-') && REFS_URL ? [REFS_URL] : undefined;
      const img = await gen(model, p.name, p.prompt, p.aspect, useRefs);
      cells.push(cell(model, p.name, img));
    }
  }
  writeFileSync(`${OUT}/contact-sheet.html`, `<html><body style="font-family:sans-serif"><h1>Illustration bake-off</h1>${cells.join('\n')}</body></html>`);
  console.log(`\nContact sheet: ${OUT}/contact-sheet.html`);
  console.log(`total cost: $${totalCost.toFixed(4)}`);
}
main();
