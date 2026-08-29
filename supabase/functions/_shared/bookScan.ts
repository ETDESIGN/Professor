// Book-fidelity extraction contracts (FIXPLAN_F P1.2, doc 10 §7).
//
// Pure TypeScript — NO Deno/OpenRouter imports — so the same contract is
// shared by scan-page (edge), vitest verification tests, and the frontend
// (types/pipeline.ts re-exports it). The dormant VisualZoneType block it
// replaces was the seed of this contract (doc 10 §11).
//
// Hard rules encoded here (doc 10 §3):
//   * verbatim reproduction — schemas transcribe, they never generate
//   * no quotas — nothing here imposes or implies counts
//   * absence = absence — empty arrays are valid, complete answers

export const EXTRACTOR_VERSION = 'scan-v6';

/** Normalized [x, y, w, h], origin top-left, each in [0, 1] of the full page. */
export type Bbox = [number, number, number, number];

export const STRUCTURE_TYPES = [
  'vocab_set',
  'comic',
  'grammar_box',
  'song_sheet',
  'reading_passage',
  'printed_activity',
  'review_statements',
  'mission_opener',
  'character_appearance',
  'clil_passage',
  'dialogue_sequence',
] as const;

export type StructureType = (typeof STRUCTURE_TYPES)[number];

// ── Per-structure verbatim payloads (doc 10 §7) ──────────────────────────

/** A labelled word-picture pair. Multi-word lexical items are first-class. */
export interface VocabItem {
  word: string;
  /** bbox of the PICTURE paired with the word (→ word-image crop). */
  picture_bbox?: Bbox;
}

export interface VocabSetData {
  set_label?: string;
  lesson_header?: string;
  items: VocabItem[];
}

export interface SpeechBubble {
  bbox?: Bbox;
  speaker?: string;
  /** Verbatim bubble text. */
  text: string;
}

export interface ComicPanel {
  bbox?: Bbox;
  order_index: number;
  narration?: string;
  bubbles: SpeechBubble[];
}

export interface ComicData {
  panels: ComicPanel[];
}

export interface GrammarBoxData {
  /** Rule text word-for-word from the box (tier = BOX). */
  rule_text: string;
  example_sentences: string[];
}

export interface SongActionLine {
  text: string;
  illustration_bbox?: Bbox;
}

export interface SongSheetData {
  title?: string;
  /** Full lyrics, verbatim, line-preserving. */
  lyrics: string;
  action_lines?: SongActionLine[];
}

export interface ActivityRef {
  instruction: string;
  verb?: string;
  content?: string;
}

export interface SceneIllustration {
  bbox?: Bbox;
  caption?: string;
}

export interface ReadingPassageData {
  title?: string;
  passage_text: string;
  scene_illustrations?: SceneIllustration[];
  activities?: ActivityRef[];
  /** The passage's own word strip, when one is printed beside/under it. */
  set_label?: string;
  items?: VocabItem[];
}

export interface PrintedActivityData {
  instruction: string;
  verb?: string;
  content?: string;
}

export interface ReviewStatementsData {
  /** "I can…" lines, verbatim. */
  statements: string[];
}

export interface MissionOpenerData {
  mission_text?: string;
  /** Printed unit number/title — METADATA ONLY, never unit authority. */
  printed_unit_number?: string;
  printed_title?: string;
  opener_art_bbox?: Bbox;
}

export interface CharacterAppearanceData {
  name?: string;
  /**
   * Exhaustive visual description (appearance, features, clothing, colors,
   * species, age, art style) — precise enough to regenerate the character
   * later. Extraction side of the parked cast workstream (doc 10 §7.9).
   */
  visual_description: string;
}

export interface ClilPassageData extends ReadingPassageData {
  /** The passage's own word set — also enters the vocabulary basket with a CLIL tag. */
  set_label?: string;
  items: VocabItem[];
}

export interface DialogueLineRef {
  speaker?: string;
  text: string;
  bbox?: Bbox;
}

export interface DialogueSequenceData {
  lines: DialogueLineRef[];
}

export type StructureData =
  | VocabSetData
  | ComicData
  | GrammarBoxData
  | SongSheetData
  | ReadingPassageData
  | PrintedActivityData
  | ReviewStatementsData
  | MissionOpenerData
  | CharacterAppearanceData
  | ClilPassageData
  | DialogueSequenceData;

// ── Raw model output → verified rows ─────────────────────────────────────

export interface RawStructure {
  structure_type: string;
  order_index?: number;
  bbox?: unknown;
  confidence?: number;
  set_label?: string;
  data?: unknown;
}

export interface VerifiedStructure {
  structure_type: StructureType;
  order_index: number;
  bbox: Bbox | null;
  confidence: number | null;
  set_label: string | null;
  grammar_tier: 'BOX' | null;
  data: Record<string, any>;
  verification_flags: string[];
}

export const VERIFICATION_FLAG = {
  LOW_CONFIDENCE: 'low_confidence',
  INVALID_BBOX: 'invalid_bbox',
  DEGENERATE_BBOX: 'degenerate_bbox',
  OVERLAP: 'overlap',
  NO_IMAGE: 'no_image',
  MISSING_REQUIRED: 'missing_required',
  EMPTY_TEXT: 'empty_text',
} as const;

const CONFIDENCE_FLOOR = 0.6;
const MIN_SIDE = 0.01;
/** Two same-type boxes overlapping more than this fraction of the smaller one. */
const OVERLAP_RATIO = 0.6;

/**
 * Clamp/validate a model-produced box into a normalized Bbox.
 * Returns null for unusable boxes; `degenerate` for sub-minimum sizes.
 */
export function sanitizeBbox(raw: unknown): { bbox: Bbox | null; degenerate: boolean } {
  if (!Array.isArray(raw) || raw.length !== 4) return { bbox: null, degenerate: false };
  const nums = raw.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return { bbox: null, degenerate: false };
  let [x, y, w, h] = nums;
  if (w < 0) { x += w; w = -w; } // tolerate sign slips by flipping
  if (h < 0) { y += h; h = -h; }
  // Small tolerance for models that nudge past the page edges.
  if (x < -0.02 || y < -0.02 || w <= 0 || h <= 0 || x + w > 1.05 || y + h > 1.05) {
    return { bbox: null, degenerate: false };
  }
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  w = Math.min(1 - x, Math.max(0, w));
  h = Math.min(1 - y, Math.max(0, h));
  if (w < MIN_SIDE || h < MIN_SIDE) return { bbox: null, degenerate: true };
  return { bbox: [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000, Math.round(w * 10000) / 10000, Math.round(h * 10000) / 10000], degenerate: false };
}

function overlapRatio(a: Bbox, b: Bbox): number {
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const minArea = Math.min(a[2] * a[3], b[2] * b[3]);
  return minArea > 0 ? inter / minArea : 0;
}

function isBbox(v: unknown): v is Bbox {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Sanitize every bbox-shaped array inside a payload (picture/panel/bubble/scene boxes). */
function sanitizeDataBboxes(data: Record<string, any>): { data: Record<string, any>; anyInvalid: boolean } {
  let anyInvalid = false;
  const walk = (node: any): any => {
    if (Array.isArray(node)) {
      if (node.length === 4 && node.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        const { bbox } = sanitizeBbox(node);
        if (!bbox) anyInvalid = true;
        return bbox;
      }
      return node.map(walk);
    }
    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };
  const data2 = walk(data) as Record<string, any>;
  // Drop null boxes the walk produced (an absent box is cleaner than null).
  const prune = (node: any): any => {
    if (Array.isArray(node)) return node.filter((n) => n !== null).map(prune);
    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        if (v === null && (k === 'bbox' || k.endsWith('_bbox'))) continue;
        out[k] = prune(v);
      }
      return out;
    }
    return node;
  };
  return { data: prune(data2), anyInvalid };
}

const nonEmpty = (s: unknown): boolean => typeof s === 'string' && s.trim().length > 0;
const nonEmptyArr = (a: unknown): boolean => Array.isArray(a) && a.length > 0;

/** Structural required-field checks per structure type (doc 10 §7). */
export function checkRequiredFields(type: StructureType, data: Record<string, any>): string[] {
  const flags: string[] = [];
  const missing = VERIFICATION_FLAG.MISSING_REQUIRED;
  switch (type) {
    case 'vocab_set':
      if (!nonEmptyArr(data.items) || !data.items.some((it: any) => nonEmpty(it?.word))) flags.push(missing);
      break;
    case 'comic':
      if (!nonEmptyArr(data.panels) ||
          !data.panels.some((p: any) => nonEmptyArr(p?.bubbles) && p.bubbles.some((b: any) => nonEmpty(b?.text))) &&
          !data.panels.some((p: any) => nonEmpty(p?.narration))) flags.push(missing);
      break;
    case 'grammar_box':
      // The box is valid with a printed rule OR with example sentences alone —
      // many boxes are examples-only and the model must not invent a rule.
      if (!nonEmpty(data.rule_text) && !nonEmptyArr(data.example_sentences)) flags.push(missing);
      break;
    case 'song_sheet':
      if (!nonEmpty(data.lyrics)) flags.push(missing);
      else if (!nonEmpty(data.title)) flags.push('missing_title');
      break;
    case 'reading_passage':
      if (!nonEmpty(data.passage_text)) flags.push(missing);
      break;
    case 'printed_activity':
      if (!nonEmpty(data.instruction)) flags.push(missing);
      break;
    case 'review_statements':
      if (!nonEmptyArr(data.statements) || !data.statements.some(nonEmpty)) flags.push(missing);
      break;
    case 'mission_opener':
      if (!nonEmpty(data.mission_text) && !nonEmpty(data.printed_title) && !isBbox(data.opener_art_bbox)) flags.push(missing);
      break;
    case 'character_appearance':
      if (!nonEmpty(data.visual_description)) flags.push(missing);
      break;
    case 'clil_passage':
      if (!nonEmpty(data.passage_text)) flags.push(missing);
      if (!nonEmptyArr(data.items)) flags.push('no_clil_vocab');
      break;
    case 'dialogue_sequence':
      if (!nonEmptyArr(data.lines) || !data.lines.some((l: any) => nonEmpty(l?.text))) flags.push(missing);
      break;
  }
  return flags;
}

/**
 * Deterministic verification pass (doc 10 §4 stage 3): shape/box validity,
 * required fields, confidence flags. NO second vision opinion. Teacher
 * review remains sovereign — flagged items are kept for review, never
 * silently dropped.
 */
export function verifyStructures(raw: RawStructure[]): VerifiedStructure[] {
  const validTypes = new Set<string>(STRUCTURE_TYPES);
  const seen = new Set<string>();

  const verified: VerifiedStructure[] = [];
  for (const r of raw) {
    if (!r || typeof r.structure_type !== 'string' || !validTypes.has(r.structure_type)) continue;
    const type = r.structure_type as StructureType;
    const data = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, any>;

    // Dedupe identical structures (same type + serialized payload) — models
    // sometimes emit a structure twice when asked twice.
    const key = `${type}:${JSON.stringify(data)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const flags: string[] = [];
    const { bbox, degenerate } = sanitizeBbox(r.bbox);
    if (r.bbox != null && !bbox) flags.push(degenerate ? VERIFICATION_FLAG.DEGENERATE_BBOX : VERIFICATION_FLAG.INVALID_BBOX);
    const { data: cleanData, anyInvalid } = sanitizeDataBboxes(data);
    if (anyInvalid) flags.push(VERIFICATION_FLAG.INVALID_BBOX);

    const confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? Math.max(0, Math.min(1, r.confidence))
      : null;
    if (confidence != null && confidence < CONFIDENCE_FLOOR) flags.push(VERIFICATION_FLAG.LOW_CONFIDENCE);

    flags.push(...checkRequiredFields(type, cleanData));

    if (type === 'vocab_set') {
      const items = Array.isArray(cleanData.items) ? cleanData.items : [];
      if (items.length > 0 && items.every((it: any) => !isBbox(it?.picture_bbox))) {
        flags.push(VERIFICATION_FLAG.NO_IMAGE);
      }
      // Owner report (2026-08-26): poster/scene titles and question captions
      // leak in as "words" ("BOOK CLUB", "FEED FRED THE FISH?"); partial
      // duplicates also appear ("elbow pads" vs "elbow and knee pads").
      // Flag for review — never silently keep or drop.
      const words = items.map((it: any) => String(it?.word || '').trim()).filter(Boolean);
      const labelLike = words.some((w) =>
        (w.length >= 4 && w === w.toUpperCase() && !/^\d+$/.test(w)) || /[?!]$/.test(w));
      if (labelLike) flags.push('label_like_item');
      const lower = words.map((w) => w.toLowerCase());
      // Significant-token subset ("elbow pads" ⊂ "elbow and knee pads") —
      // substring matching misses exactly this shape.
      const tokens = lower.map((w) => w.split(/\s+/).filter((t) => t.length >= 4));
      const containmentDup = tokens.some((tk, i) =>
        tk.length > 0 && tokens.some((other, j) => {
          if (j === i || other.length <= tk.length) return false;
          return tk.every((t) => other.includes(t));
        }));
      if (containmentDup) flags.push('duplicate_item');
    }
    if (type === 'grammar_box') {
      // Box grammar is always tier BOX (verbatim, mandatory); INFERRED rules
      // are produced downstream from the page's own usage, never at scan.
    }

    verified.push({
      structure_type: type,
      order_index: typeof r.order_index === 'number' && Number.isFinite(r.order_index) ? r.order_index : verified.length,
      bbox,
      confidence,
      set_label: typeof r.set_label === 'string' && r.set_label.trim() ? r.set_label.trim() : null,
      grammar_tier: type === 'grammar_box' ? 'BOX' : null,
      data: cleanData,
      verification_flags: [...new Set(flags)],
    });
  }

  // Pairwise overlap flagging within the same type.
  for (let i = 0; i < verified.length; i++) {
    for (let j = i + 1; j < verified.length; j++) {
      const a = verified[i], b = verified[j];
      if (a.structure_type !== b.structure_type || !a.bbox || !b.bbox) continue;
      if (overlapRatio(a.bbox, b.bbox) > OVERLAP_RATIO) {
        a.verification_flags.push(VERIFICATION_FLAG.OVERLAP);
        b.verification_flags.push(VERIFICATION_FLAG.OVERLAP);
      }
    }
  }
  for (const v of verified) v.verification_flags = [...new Set(v.verification_flags)];

  return verified;
}
