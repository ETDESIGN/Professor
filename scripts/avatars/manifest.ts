// Avatar v2 art manifest — the "Style Bible" + per-asset prompts.
// Shared by the generation pipeline (art-pipeline.ts). The skeleton is
// SACRED: every base shares proportions/pose/camera; items are generated
// as full-character i2i renders and extracted by diffing against the
// clean master (alignment by construction — spec §2.4).

export const AVATAR_HOUSE_STYLE = [
  'cute chibi cartoon character mascot, full body standing facing the camera',
  'extremely large round head that is 45% of total height, big expressive eyes, tiny body',
  'completely flat cel shading with soft simple shadows, no hatching, no sketch lines, no texture, thick clean uniform outlines, sticker-like vector art',
  'bright cheerful children\'s video game palette',
  'character fills 70% of canvas height, perfectly centered',
  'plain pure white background, no text, no watermark, no ground shadow',
].join(', ');

/** The neutral under-layer every master wears — outfits must cover it. */
export const NEUTRAL_OUTFIT = 'wearing only a plain light gray t-shirt and dark gray shorts';

/**
 * Anchor rects (1024-canvas space) where standalone item sprites are placed.
 * These match the master prompt skeleton (head ~45% of height, centered).
 * Vertical alignment: top-anchored for head/hair, centered otherwise.
 */
export const ITEM_ANCHORS: Record<string, { x: number; y: number; w: number; h: number; topAnchor?: boolean }> = {
  // Tuned 2026-09-04 against the processed masters (content top y=62,
  // height 900; head zone ≈ y62–480, face center ≈ y270, body y480–962).
  headwear: { x: 320, y: 50, w: 384, h: 290, topAnchor: true },
  hair:     { x: 310, y: 45, w: 404, h: 330, topAnchor: true },
  eyes:     { x: 395, y: 200, w: 234, h: 140 },
  face:     { x: 380, y: 185, w: 264, h: 170 },
  outfit:   { x: 340, y: 465, w: 344, h: 495 },
  handheld: { x: 700, y: 470, w: 260, h: 340 },
  back:     { x: 280, y: 430, w: 464, h: 470 },
  background: { x: 0, y: 0, w: 1024, h: 1024 },
};

/** Standalone (product-style) item render prompt — white bg, no character. */
export function standaloneItemPrompt(item: ItemSpec): string {
  if (item.slot === 'background' && item.bgPrompt) {
    return item.bgPrompt + ", flat cel style children's game background, bright and cheerful, no characters, no text";
  }
  const thing = item.wear.replace(/^(wearing|holding|proudly holding up) /, '');
  // Hard-won prompt lesson (2026-09-04): plain "a red cap" makes flux draw a
  // KID WEARING the cap. Inventory-icon framing + explicit negation is what
  // yields object-only renders.
  const framing: Record<string, string> = {
    headwear: `video game inventory icon of ${thing}, single hat object floating alone`,
    hair: `video game inventory icon of a ${thing} wig, single hairpiece object floating alone`,
    eyes: `video game inventory icon of ${thing}, just the eyes as a standalone pair`,
    face: `video game inventory icon of ${thing}, single eyewear object floating alone`,
    outfit: `video game costume icon: ${thing} complete outfit laid out flat like clothing on a table, top and bottoms together`,
    handheld: `video game inventory icon of ${thing}, single object floating alone`,
    back: `video game inventory icon of ${thing}, single back-accessory object floating alone`,
  };
  return [
    framing[item.slot] || `video game inventory icon of ${thing}, single object floating alone`,
    'flat cartoon style, thick clean outlines, soft cel shading, bright cheerful colors',
    'ABSOLUTELY NO person, NO character, NO face, NO mannequin, NO hands, NO body parts',
    'object centered with generous margin',
    // Chroma-key green: white/patterned backdrops and decorative frames made
    // flood-fill extraction unreliable (2026-09-04). Solid green is trivially
    // keyed and flux rarely frames it.
    'solid flat uniform pure green background (#00FF00), chroma-key cutout style, NO frame, NO border, NO vignette, no text, no shadow',
  ].join(', ');
}

export interface BaseSpec {
  id: 'human_boy' | 'human_girl' | 'robot' | 'alien' | 'monster';
  describe: string;
}

export const BASES: BaseSpec[] = [
  { id: 'human_boy', describe: 'a cheerful cartoon kid character with short neat brown hair' },
  { id: 'human_girl', describe: 'a cheerful cartoon kid character with long straight black hair and bangs' },
  { id: 'robot', describe: 'a friendly rounded toy robot character with a screen face showing two happy digital eyes, small antenna' },
  { id: 'alien', describe: 'a friendly small green alien character with a big oval head, three eyes and a tiny smile' },
  { id: 'monster', describe: 'a friendly fluffy purple monster kid character with two small round horns and a big happy grin' },
];

export const SKIN_TONES: string[] = [
  'very light skin tone',
  'light skin tone',
  'medium beige skin tone',
  'tan skin tone',
  'brown skin tone',
  'deep brown skin tone',
];

export type ItemSlot =
  | 'hair' | 'eyes' | 'outfit' | 'headwear' | 'face' | 'handheld' | 'back' | 'background';

export interface ItemSpec {
  id: string;
  slot: ItemSlot;
  /** What the character wears/holds — injected into the i2i scaffold. */
  wear: string;
  /** Backgrounds are generated directly (full-canvas art, no diff). */
  bgPrompt?: string;
  /** Generate the i2i on a non-default master (species signatures). */
  onBody?: string;
}

export const ITEMS: ItemSpec[] = [
  // hair
  { id: 'hair_short_brown',  slot: 'hair', wear: 'short neat brown hair' },
  { id: 'hair_long_black',   slot: 'hair', wear: 'long straight black hair with neat bangs' },
  { id: 'hair_curly_blonde', slot: 'hair', wear: 'voluminous curly blonde hair' },
  { id: 'hair_spiky_pink',   slot: 'hair', wear: 'a spiky bright pink mohawk hairstyle' },
  { id: 'hair_ponytail_red', slot: 'hair', wear: 'a red ponytail hairstyle' },
  { id: 'hair_afro_dark',    slot: 'hair', wear: 'a big rounded dark afro puff hairstyle' },
  { id: 'hair_bun_blonde',   slot: 'hair', wear: 'blonde hair in an elegant top bun' },
  { id: 'hair_mohawk_green', slot: 'hair', wear: 'a tall green mohawk' },
  // eyes
  { id: 'eyes_happy_brown', slot: 'eyes', wear: 'happy big brown eyes' },
  { id: 'eyes_wink_blue',   slot: 'eyes', wear: 'one eye winking with big blue eyes' },
  { id: 'eyes_star_blue',   slot: 'eyes', wear: 'sparkling star-shaped blue eyes' },
  { id: 'eyes_sleepy_grey', slot: 'eyes', wear: 'sleepy half-closed grey eyes' },
  { id: 'eyes_laser_cyber', slot: 'eyes', wear: 'glowing neon cyan cyber visor eyes' },
  // outfit
  { id: 'outfit_hoodie_blue',    slot: 'outfit', wear: 'a cozy blue hoodie with pockets and blue jeans' },
  { id: 'outfit_tshirt_red',     slot: 'outfit', wear: 'a bright red t-shirt and dark shorts' },
  { id: 'outfit_overalls_denim', slot: 'outfit', wear: 'classic blue denim overalls over a white shirt' },
  { id: 'outfit_soccer_kit',     slot: 'outfit', wear: 'a red and white soccer kit with shorts and socks' },
  { id: 'outfit_chef_whites',    slot: 'outfit', wear: 'a white chef jacket and checkered trousers' },
  { id: 'outfit_lab_coat',       slot: 'outfit', wear: 'a white scientist lab coat over a blue shirt' },
  { id: 'outfit_astronaut_suit', slot: 'outfit', wear: 'a white and orange astronaut space suit' },
  { id: 'outfit_karate_gi',      slot: 'outfit', wear: 'a white karate gi with a colored belt' },
  { id: 'shirt_space',           slot: 'outfit', wear: 'a sleek futuristic silver space suit with glowing accents' },
  { id: 'outfit_pirate_captain', slot: 'outfit', wear: 'a pirate captain coat with gold trim' },
  { id: 'outfit_wizard_robe',    slot: 'outfit', wear: 'a long purple wizard robe with star patterns' },
  { id: 'outfit_superhero_suit', slot: 'outfit', wear: 'a red and gold superhero suit' },
  // headwear (universal)
  { id: 'headwear_cap_red',      slot: 'headwear', wear: 'a red baseball cap' },
  { id: 'headwear_party_hat',    slot: 'headwear', wear: 'a colorful striped cone party hat' },
  { id: 'headwear_beanie_orange',slot: 'headwear', wear: 'an orange knitted beanie' },
  { id: 'headwear_gamer_headset',slot: 'headwear', wear: 'large black and blue gamer headphones' },
  { id: 'headwear_cat_ears',     slot: 'headwear', wear: 'a cute headband with gray cat ears' },
  { id: 'headwear_viking_helmet',slot: 'headwear', wear: 'a silver viking helmet with small white wings' },
  { id: 'headwear_wizard_hat',   slot: 'headwear', wear: 'a tall pointed purple wizard hat with stars' },
  { id: 'hat_crown',             slot: 'headwear', wear: 'a shiny golden crown with small red gems' },
  // face
  { id: 'face_round_glasses', slot: 'face', wear: 'big round black-frame glasses' },
  { id: 'glass_cool',         slot: 'face', wear: 'cool black sunglasses' },
  { id: 'face_monocle',       slot: 'face', wear: 'a golden monocle' },
  { id: 'face_party_mask',    slot: 'face', wear: 'a colorful carnival party eye mask' },
  { id: 'face_cyber_visor',   slot: 'face', wear: 'a glowing neon cyan cyber visor' },
  // handheld
  { id: 'handheld_pencil_hero',   slot: 'handheld', wear: 'a giant yellow hero pencil' },
  { id: 'handheld_flag_checkered',slot: 'handheld', wear: 'a small checkered racing flag on a stick' },
  { id: 'handheld_ice_wand',      slot: 'handheld', wear: 'a sparkling blue ice wand' },
  { id: 'handheld_trophy_gold',   slot: 'handheld', wear: 'a golden trophy cup' },
  // back
  { id: 'back_cape_pink',      slot: 'back', wear: 'a flowing pink cape' },
  { id: 'back_fairy_wings',    slot: 'back', wear: 'translucent sparkly fairy wings' },
  { id: 'back_rocket_jetpack', slot: 'back', wear: 'a silver rocket jetpack' },
  // background
  { id: 'bg_sky',     slot: 'background', wear: '', bgPrompt: 'soft pastel blue sky with fluffy white clouds and tiny sparkles, gentle children\'s game background art, flat cel style, bright and cheerful, no characters, no text' },
  { id: 'bg_stars',   slot: 'background', wear: '', bgPrompt: 'deep blue night sky full of golden stars and tiny planets, children\'s game background art, flat cel style, no characters, no text' },
  { id: 'bg_forest',  slot: 'background', wear: '', bgPrompt: 'soft green forest with rounded cartoon trees and fireflies, children\'s game background art, flat cel style, no characters, no text' },
  { id: 'bg_galaxy',  slot: 'background', wear: '', bgPrompt: 'swirling purple and teal galaxy with nebulas and shooting stars, children\'s game background art, flat cel style, no characters, no text' },
  // species signatures
  { id: 'sig_robot_antenna', slot: 'headwear', wear: 'a glowing neon antenna with a light bulb tip', onBody: 'robot' },
  { id: 'sig_robot_core',    slot: 'face',     wear: 'a glowing round energy core', onBody: 'robot' },
  { id: 'sig_monster_horns', slot: 'headwear', wear: 'a pair of colorful party horn accessories', onBody: 'monster' },
  { id: 'sig_alien_crown',   slot: 'headwear', wear: 'a small translucent cosmic tiara', onBody: 'alien' },
];

export function masterPrompt(base: BaseSpec, tone?: string): string {
  return `${base.describe}${tone ? `, ${tone}` : ''}, ${NEUTRAL_OUTFIT}, ${AVATAR_HOUSE_STYLE}`;
}

export function skinPrompt(base: BaseSpec, tone: string): string {
  return `the exact same character, identical pose, camera, framing, outfit, style and white background — only change the skin tone to a ${tone}`;
}

export function itemPrompt(item: ItemSpec): string {
  if (item.slot === 'background' && item.bgPrompt) {
    return `${item.bgPrompt}, ${AVATAR_HOUSE_STYLE.replace(/,? plain pure white background[^,]*/, '')}`;
  }
  return `the exact same character, identical pose, camera, framing, background and art style — the ONLY change: now ${item.wear}. Everything else stays pixel-identical.`;
}

/** Deterministic roster defaults (must match avatarCore ROSTER_DEFAULT_COUNT). */
export const ROSTER_DEFAULTS: { body: string; items: Record<string, string | null> }[] = [
  // Pure base + background: the AI masters' own neutral outfits read as
  // intentional (placeholder clothes layered on AI bodies mismatched —
  // 2026-09-04 curation call).
  { body: 'human_boy', items: { background: 'bg_sky' } },
  { body: 'human_girl', items: { background: 'bg_forest' } },
  { body: 'robot', items: { background: 'bg_stars' } },
  { body: 'alien', items: { background: 'bg_galaxy' } },
  { body: 'monster', items: { background: 'bg_forest' } },
  { body: 'human_boy', items: { background: 'bg_stars' } },
  { body: 'human_girl', items: { background: 'bg_sky' } },
  { body: 'robot', items: { background: 'bg_galaxy' } },
  { body: 'alien', items: { background: 'bg_stars' } },
  { body: 'monster', items: { background: 'bg_sky' } },
  { body: 'human_boy', items: { background: 'bg_galaxy' } },
  { body: 'human_girl', items: { background: 'bg_forest' } },
];
