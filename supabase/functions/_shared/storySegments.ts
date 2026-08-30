// Story segmentation (doc 10 §5 image default, story fidelity): split a
// verbatim reading passage into per-paragraph story pages, each anchored to
// the scene illustration the book prints beside it — so every story page can
// carry its OWN book crop, with the scene's visual_description as the AI
// fallback prompt.
//
// Precision first: an anchor is the scan model's explicit scene→paragraph
// link, so a scene is only bound to a paragraph it was anchored to. An
// unbound paragraph simply gets no book art (AI/text fallback) — showing the
// WRONG artwork next to a paragraph would break book fidelity outright.
//
// Pure TypeScript — NO Deno imports — so vitest and the edge runtime share
// the exact same behavior (same contract as bookScan.ts).

import type { SceneIllustration } from './bookScan.ts';

export interface StorySegment {
  /** Verbatim paragraph text (whitespace-collapsed; words untouched). */
  text: string;
  /** Index into the passage's scene_illustrations for this segment, or null. */
  sceneIndex: number | null;
}

/** Collapse all whitespace runs to single spaces and trim. */
function flatten(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

interface ParagraphSpan {
  text: string;
  start: number;
  end: number;
}

interface ResolvedAnchor {
  sceneIndex: number;
  start: number;
  end: number;
}

/**
 * The passage's blank-line paragraphs with their [start, end) spans inside the
 * flattened passage (flattened paragraphs joined with single spaces reproduce
 * the flattened passage exactly).
 */
function buildParagraphSpans(passageText: string): ParagraphSpan[] {
  const flat = flatten(passageText);
  const paras = String(passageText || '')
    .split(/\n\s*\n+/)
    .map(flatten)
    .filter((p) => p.length > 0);
  if (paras.length <= 1) return [{ text: flat, start: 0, end: flat.length }];
  const spans: ParagraphSpan[] = [];
  let pos = 0;
  for (const p of paras) {
    const at = flat.indexOf(p, pos); // always found: both derive from the same text
    const start = at < 0 ? pos : at;
    spans.push({ text: p, start, end: start + p.length });
    pos = start + p.length;
  }
  return spans;
}

/**
 * Locate each scene's anchor_text inside the flattened passage. Matching is
 * tolerant (case/whitespace-insensitive, falling back to the anchor's opening
 * words) and monotonic — each scene is searched only after the previous
 * scene's anchor, because scenes are listed in reading order.
 */
function resolveAnchors(flat: string, scenes: SceneIllustration[]): ResolvedAnchor[] {
  const hay = flat.toLowerCase();
  const resolved: ResolvedAnchor[] = [];
  let searchFrom = 0;
  for (let i = 0; i < scenes.length; i++) {
    const anchor = flatten(String(scenes[i]?.anchor_text || ''));
    const words = anchor.split(' ').filter(Boolean);
    if (words.length < 2) continue;
    const candidates = [words.join(' ')];
    if (words.length > 4) candidates.push(words.slice(0, 4).join(' '));
    if (words.length > 3) candidates.push(words.slice(0, 3).join(' '));
    let hit = -1;
    let hitLen = 0;
    for (const cand of candidates) {
      const needle = cand.toLowerCase();
      const at = hay.indexOf(needle, searchFrom);
      if (at >= 0) {
        hit = at;
        hitLen = needle.length;
        break;
      }
    }
    if (hit < 0) continue;
    resolved.push({ sceneIndex: i, start: hit, end: hit + hitLen });
    searchFrom = hit + hitLen;
  }
  return resolved;
}

/**
 * Anchor path with paragraph structure: one page per paragraph; a paragraph
 * carries the crop of the first scene anchored into it. Title-sized
 * unanchored fragments merge into a neighbour instead of becoming junk pages.
 */
function segmentAnchoredParagraphs(paras: ParagraphSpan[], anchors: ResolvedAnchor[]): StorySegment[] {
  const owner = new Map<number, number>(); // paragraph index → scene index
  for (const a of anchors) {
    let paraIdx = paras.findIndex((p) => a.start >= p.start && a.start < p.end);
    if (paraIdx === -1) paraIdx = paras.findIndex((p) => a.start < p.start);
    if (paraIdx === -1) continue;
    if (!owner.has(paraIdx)) owner.set(paraIdx, a.sceneIndex);
  }
  if (owner.size === 0) return [];
  const segments = paras.map((p, i) => ({ text: p.text, sceneIndex: owner.has(i) ? owner.get(i)! : null }));
  return mergeTinyUnanchored(segments);
}

/** Merge unanchored title-sized fragments into a neighbouring page. */
function mergeTinyUnanchored(segs: StorySegment[]): StorySegment[] {
  const out = segs.map((s) => ({ ...s }));
  for (let i = 0; i < out.length - 1;) {
    if (out[i].sceneIndex === null && out[i].text.length < 25) {
      out[i + 1] = { text: `${out[i].text} ${out[i + 1].text}`.trim(), sceneIndex: out[i + 1].sceneIndex };
      out.splice(i, 1);
    } else i++;
  }
  const last = out.length - 1;
  if (last > 0 && out[last].sceneIndex === null && out[last].text.length < 25) {
    out[last - 1] = { text: `${out[last - 1].text} ${out[last].text}`.trim(), sceneIndex: out[last - 1].sceneIndex };
    out.pop();
  }
  return out.filter((s) => s.text.length >= 2);
}

/**
 * Anchor path without paragraph structure (the passage prints as one block):
 * cut the flattened passage purely at the anchor positions; the first scene
 * at each cut owns the page.
 */
function segmentByAnchorCuts(flat: string, anchors: ResolvedAnchor[]): StorySegment[] {
  const cuts: ResolvedAnchor[] = [];
  for (const a of anchors) {
    const prev = cuts[cuts.length - 1];
    if (prev && a.start - prev.start < 30) continue;
    cuts.push(a);
  }
  if (cuts.length === 0) return [];
  const segments: StorySegment[] = [];
  const leading = flat.slice(0, cuts[0].start).trim();
  if (leading.length >= 25) segments.push({ text: leading, sceneIndex: null });
  for (let c = 0; c < cuts.length; c++) {
    const from = cuts[c].start;
    const to = c + 1 < cuts.length ? cuts[c + 1].start : flat.length;
    const text = (c === 0 && leading.length < 25 ? `${leading} ` : '') + flat.slice(from, to).trim();
    segments.push({ text: text.trim(), sceneIndex: cuts[c].sceneIndex });
  }
  return segments.filter((s) => s.text.length >= 2);
}

/** Pair scenes to paragraphs via paragraph_index when valid, else zipped in order. */
function segmentByParagraphs(paragraphs: string[], scenes: SceneIllustration[]): StorySegment[] {
  const byIndex = new Map<number, number>();
  const allIndexed = scenes.length > 0 && scenes.every((s) => {
    const idx = s?.paragraph_index;
    return Number.isInteger(idx) && (idx as number) >= 0 && (idx as number) < paragraphs.length;
  });
  if (allIndexed) {
    for (let i = 0; i < scenes.length; i++) {
      const idx = scenes[i].paragraph_index as number;
      if (!byIndex.has(idx)) byIndex.set(idx, i);
    }
  }
  return paragraphs.map((text, i) => ({
    text,
    sceneIndex: byIndex.has(i) ? byIndex.get(i)! : (allIndexed ? null : (i < scenes.length ? i : null)),
  }));
}

/**
 * Segment a verbatim passage into story pages, each bound to its scene.
 *
 * Priority: (1) scene anchors — one page per paragraph, a paragraph carrying
 * the crop of the scene anchored to it (pure anchor cuts when the passage
 * has no blank-line structure); (2) blank-line paragraphs paired by
 * paragraph_index, or zipped in reading order; (3) the whole passage as one
 * page with the first scene — the pre-v7 behavior, so units scanned before
 * anchoring keep working.
 *
 * Words are never altered — only whitespace is normalized.
 */
export function segmentPassageByScenes(
  passageText: string,
  scenes: SceneIllustration[] | null | undefined,
): StorySegment[] {
  const flat = flatten(passageText);
  if (!flat) return [];
  const sceneList = Array.isArray(scenes)
    ? scenes.filter((s): s is SceneIllustration => !!s && typeof s === 'object')
    : [];
  if (sceneList.length === 0) return [{ text: flat, sceneIndex: null }];

  const paras = buildParagraphSpans(passageText);
  const anchors = resolveAnchors(flat, sceneList);

  let segments: StorySegment[];
  if (anchors.length > 0 && paras.length > 1) {
    segments = segmentAnchoredParagraphs(paras, anchors);
  } else if (anchors.length > 0) {
    segments = segmentByAnchorCuts(flat, anchors);
  } else if (paras.length > 1) {
    segments = segmentByParagraphs(paras.map((p) => p.text), sceneList);
  } else {
    segments = [{ text: flat, sceneIndex: sceneList[0] ? 0 : null }];
  }
  if (segments.length === 0) segments = [{ text: flat, sceneIndex: sceneList[0] ? 0 : null }];
  return segments;
}
