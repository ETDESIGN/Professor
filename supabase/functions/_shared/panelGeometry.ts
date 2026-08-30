// Panel geometry refinement — deterministic gutter snapping for comic panel
// crops (doc 12 §7; owner report 2026-08-31: "the images are cut in the
// middle of the image").
//
// Why: vision scan bboxes are directionally right (x/y/w good) but bleed
// vertically into the NEXT panel row — a "height" that spans 1.5 rows cuts
// the crop through the middle of the neighbor. And 1-4 panels per comic come
// back with no bbox at all. This module fixes both WITHOUT AI:
//   * snapBoxToGutters — tighten a provided box to the whitespace gutter
//     bands around the panel (rows/columns of the box's span that are ≥95%
//     background). A dirty edge (cutting through content) CONTRACTS toward
//     the box center; a clean edge holds at its gutter band (mid-band, or the
//     content-side boundary of a very wide band).
//   * planPanelBoxes — snaps provided boxes, applies a same-column ROW-HEIGHT
//     PRIOR (an over-tall outlier re-anchors its far edge at top+median row
//     height, then local-snaps), seeds missing panels by mirroring across the
//     comic's center gutter or stacking below the last known row inside the
//     structure box, and snaps the seeds too.
//
// Pure TypeScript — NO Deno/image imports — so vitest covers it directly
// (same contract as _shared/bookScan.ts). The caller builds the InkGrid from
// the decoded page image (bookCrop.ts) with an adaptive background threshold.

export interface InkGrid {
  w: number; // grid width in cells (caller downsamples)
  h: number;
  /** 1 = content ink, 0 = background. Length w*h. */
  ink: Uint8Array;
}

/** [x, y, w, h] in grid cells. */
export type Box = [number, number, number, number];

export interface RefineOptions {
  /** Fraction of background cells for a row/column line to count as clean. */
  cleanRatio?: number; // default 0.95
  /** Minimum consecutive clean lines to count as a gutter band. */
  minBand?: number; // default 2
  /** Max edge movement for DIRTY-edge contraction (fraction of dimension). */
  maxShift?: number; // default 0.2
  /** Bands longer than this fraction hug the content side instead of mid. */
  hugLimit?: number; // default 0.04
  /** Height ratio over which a same-column box is treated as over-tall. */
  rowPriorRatio?: number; // default 1.6
  /** A refined edge may never shrink the box below this fraction of its
   *  original span along that axis. */
  minSpanRatio?: number; // default 0.4
}

const DEFAULTS: Required<RefineOptions> = {
  cleanRatio: 0.95,
  minBand: 2,
  // 0.2: the observed scan-v8 bleed reaches ~0.14 of the page past the panel
  // (verified on the owner's test unit, doc 12 §7) — the window must reach
  // the next gutter up. The span guard below prevents over-contraction.
  maxShift: 0.2,
  hugLimit: 0.04,
  rowPriorRatio: 1.6,
  /** A refined edge may never shrink the box below this fraction of its
   *  original span (guards against collapsing onto the far gutter). */
  minSpanRatio: 0.4,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function rowClean(grid: InkGrid, y: number, x0: number, x1: number, cleanRatio: number): boolean {
  let bg = 0;
  const n = x1 - x0 + 1;
  const base = y * grid.w;
  for (let x = x0; x <= x1; x++) if (!grid.ink[base + x]) bg++;
  return bg / n >= cleanRatio;
}

function colClean(grid: InkGrid, x: number, y0: number, y1: number, cleanRatio: number): boolean {
  let bg = 0;
  const n = y1 - y0 + 1;
  for (let y = y0; y <= y1; y++) if (!grid.ink[y * grid.w + x]) bg++;
  return bg / n >= cleanRatio;
}

interface Band {
  a: number; // first clean line
  b: number; // last clean line
}

/** Band of consecutive clean lines CONTAINING `at` (null when `at` is dirty). */
function containingBand(isClean: (i: number) => boolean, at: number, lo: number, hi: number): Band | null {
  if (!isClean(at)) return null;
  let a = at;
  let b = at;
  while (a - 1 >= lo && isClean(a - 1)) a--;
  while (b + 1 <= hi && isClean(b + 1)) b++;
  return { a, b };
}

/** First clean band (≥ minBand) strictly between `from` and `to`, scanning
 *  from `from` toward `to`. Null when none. */
function firstBand(isClean: (i: number) => boolean, from: number, to: number, minBand: number): Band | null {
  const step = from < to ? 1 : -1;
  for (let i = from; i !== to + step; i += step) {
    if (!isClean(i)) continue;
    let b = i;
    while (b + step !== to + step && isClean(b + step)) b += step;
    if (Math.abs(b - i) + 1 >= minBand) return { a: Math.min(i, b), b: Math.max(i, b) };
    i = b; // skip the too-short run
  }
  return null;
}

/** Snap an edge line to a gutter. `at` = current edge, `center` = box center
 *  on the same axis (content side for clean edges / contraction direction for
 *  dirty ones). Returns the refined edge or `at`. */
function refineEdge(
  isClean: (i: number) => boolean,
  at: number,
  center: number,
  lo: number,
  hi: number,
  dim: number,
  opts: Required<RefineOptions>,
): number {
  const maxShift = Math.round(dim * opts.maxShift);
  const hugLimit = Math.round(dim * opts.hugLimit);
  const contentSide = center > at ? 'b' : 'a'; // which band boundary faces the panel

  const inside = containingBand(isClean, at, lo, hi);
  if (inside) {
    // Clean edge: hold in the gutter. Small gutter → its middle (stable from
    // both over- and under-cut seeds). Very wide band (page margin / big
    // empty area the box overshoots into) → hug the content-side boundary;
    // NOT capped, because the whole point is retracting a wild overshoot.
    if (inside.b - inside.a + 1 <= hugLimit) return Math.round((inside.a + inside.b) / 2);
    return contentSide === 'b' ? inside.b : inside.a;
  }

  // Dirty edge (mid-artwork): contract toward the box center to the first
  // real gutter. Capped — contraction beyond the cap leaves the edge alone
  // (the cropper's padding then compensates a slightly tight box).
  const toward = center > at ? Math.min(hi, at + maxShift) : Math.max(lo, at - maxShift);
  const band = firstBand(isClean, at + (center > at ? 1 : -1), toward, opts.minBand);
  if (band) {
    const mid = Math.round((band.a + band.b) / 2);
    if (Math.abs(mid - at) <= maxShift) return mid;
  }
  return at;
}

/** Local snap around an ESTIMATE (row-height prior): the estimate's gutter if
 *  clean, else the nearest clean line within `radius`, else the estimate. */
function localSnap(isClean: (i: number) => boolean, estimate: number, lo: number, hi: number, radius: number): number {
  const est = clamp(Math.round(estimate), lo, hi);
  const inside = containingBand(isClean, est, lo, hi);
  if (inside) return Math.round((inside.a + inside.b) / 2);
  for (let d = 1; d <= radius; d++) {
    for (const i of [est - d, est + d]) {
      if (i < lo || i > hi) continue;
      const band = containingBand(isClean, i, lo, hi);
      if (band) return Math.round((band.a + band.b) / 2);
    }
  }
  return est;
}

/** Snap a box's four edges to the whitespace gutters around its panel. */
export function snapBoxToGutters(grid: InkGrid, box: Box, opts: RefineOptions = {}): Box {
  const o = { ...DEFAULTS, ...opts };
  const x0 = clamp(Math.round(box[0]), 0, grid.w - 1);
  const y0 = clamp(Math.round(box[1]), 0, grid.h - 1);
  const x1 = clamp(Math.round(box[0] + box[2]) - 1, 0, grid.w - 1);
  const y1 = clamp(Math.round(box[1] + box[3]) - 1, 0, grid.h - 1);
  if (x1 - x0 < 2 || y1 - y0 < 2) return box;

  const cx = Math.round((x0 + x1) / 2);
  const cy = Math.round((y0 + y1) / 2);
  const minW = Math.max(3, Math.round((x1 - x0 + 1) * o.minSpanRatio));
  const minH = Math.max(3, Math.round((y1 - y0 + 1) * o.minSpanRatio));

  // Vertical pair — accept both, or whichever single move keeps the span
  // above the collapse guard (a wildly wrong gutter must not crush the box).
  const cTop = refineEdge((y) => rowClean(grid, y, x0, x1, o.cleanRatio), y0, cy, 0, grid.h - 1, grid.h, o);
  const cBottom = refineEdge((y) => rowClean(grid, y, x0, x1, o.cleanRatio), y1, cy, 0, grid.h - 1, grid.h, o);
  let top = y0;
  let bottom = y1;
  if (cBottom - cTop + 1 >= minH) { top = cTop; bottom = cBottom; }
  else if (cBottom - y0 + 1 >= minH) bottom = cBottom;
  else if (y1 - cTop + 1 >= minH) top = cTop;

  // Horizontal pair.
  const cLeft = refineEdge((x) => colClean(grid, x, y0, y1, o.cleanRatio), x0, cx, 0, grid.w - 1, grid.w, o);
  const cRight = refineEdge((x) => colClean(grid, x, y0, y1, o.cleanRatio), x1, cx, 0, grid.w - 1, grid.w, o);
  let left = x0;
  let right = x1;
  if (cRight - cLeft + 1 >= minW) { left = cLeft; right = cRight; }
  else if (cRight - x0 + 1 >= minW) right = cRight;
  else if (x1 - cLeft + 1 >= minW) left = cLeft;

  const nx0 = Math.min(left, right - 1);
  const nx1 = Math.max(right, nx0 + 1);
  const ny0 = Math.min(top, bottom - 1);
  const ny1 = Math.max(bottom, ny0 + 1);
  return [nx0, ny0, nx1 - nx0 + 1, ny1 - ny0 + 1];
}

export interface PanelSeed {
  order: number;
  /** Grid-cell box when the scan provided one; null when missing. */
  bbox?: Box | null;
}

const median = (ns: number[]): number => {
  const s = ns.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const xOverlapFrac = (a: Box, b: Box): number => {
  const ov = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  return ov / Math.min(a[2], b[2]);
};

/**
 * Plan a refined box for EVERY panel of a comic:
 *   1. snap every provided box to its gutters;
 *   2. row-height prior: a same-column box far taller than the column's
 *      median row height is an over-cut spanning 2+ rows — re-anchor its
 *      bottom at top+median and local-snap (the observed scan-v8 failure:
 *      heights bleeding into the next row);
 *   3. seed each missing panel — mirror across the comic's center gutter
 *      when a same-row sibling exists (2-column comics), else stack below
 *      the lowest known row inside the structure box;
 *   4. snap the seeds.
 * Returns order → refined grid-cell box. Panels with no bbox and no credible
 * seed (no provided boxes at all) are omitted — absence = absence.
 */
export function planPanelBoxes(
  grid: InkGrid,
  structureBox: Box,
  panels: PanelSeed[],
  opts: RefineOptions = {},
): Map<number, Box> {
  const o = { ...DEFAULTS, ...opts };
  const out = new Map<number, Box>();

  const sx0 = clamp(Math.round(structureBox[0]), 0, grid.w - 1);
  const sy0 = clamp(Math.round(structureBox[1]), 0, grid.h - 1);
  const sx1 = clamp(Math.round(structureBox[0] + structureBox[2]) - 1, 0, grid.w - 1);
  const sy1 = clamp(Math.round(structureBox[1] + structureBox[3]) - 1, 0, grid.h - 1);

  // Nothing a panel plan produces may escape the comic's own structure box —
  // the scan's region bbox (inventory stage) bounds the comic and excludes
  // neighbouring content like the activity line below it (real-page lesson,
  // doc 12 §7: an over-tall box otherwise hugs the activity text's bottom).
  const clampToStructure = (b: Box): Box => {
    const bx0 = clamp(b[0], sx0, sx1 - 2);
    const by0 = clamp(b[1], sy0, sy1 - 2);
    const bx1 = clamp(Math.max(b[0] + b[2] - 1, bx0 + 2), bx0 + 2, sx1);
    const by1 = clamp(Math.max(b[1] + b[3] - 1, by0 + 2), by0 + 2, sy1);
    return [bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1];
  };

  const snapped = new Map<number, Box>();
  for (const p of panels) {
    // Clamp to the structure box BEFORE snapping: a raw scan box that runs
    // past the comic (into the activity line below) would otherwise poison
    // the column/row cleanliness tests with foreign content.
    if (p.bbox) snapped.set(p.order, snapBoxToGutters(grid, clampToStructure(p.bbox), o));
  }
  if (snapped.size === 0) return out;

  // Row-height prior per column (x-overlap ≥ 50%).
  const colMedian = new Map<number, number>();
  for (const [order, box] of snapped) {
    const colHeights = [...snapped.values()]
      .filter((b) => b !== box && xOverlapFrac(b, box) >= 0.5)
      .map((b) => b[3]);
    if (colHeights.length > 0) colMedian.set(order, median(colHeights));
  }
  for (const [order, box] of snapped) {
    let refined = box;
    const med = colMedian.get(order);
    if (med && box[3] > med * o.rowPriorRatio) {
      const estBottom = box[1] + med - 1;
      const newBottom = localSnap(
        (y) => rowClean(grid, y, box[0], box[0] + box[2] - 1, o.cleanRatio),
        estBottom, 0, grid.h - 1, Math.round(grid.h * 0.08),
      );
      if (newBottom > box[1] + 1) refined = [box[0], box[1], box[2], newBottom - box[1] + 1];
    }
    out.set(order, clampToStructure(refined));
  }

  // Vertical center gutter of the comic region (2-column layout), scanned in
  // the middle third of the structure box over the provided rows' y-range —
  // CLAMPED to the structure box so content below the comic (activity lines)
  // cannot poison the column-cleanliness test.
  const provRows = [...out.values()];
  const comicY0 = Math.max(sy0, Math.min(...provRows.map((b) => b[1])));
  const comicY1 = Math.min(sy1, Math.max(...provRows.map((b) => b[1] + b[3] - 1)));
  let centerMid = -1;
  const midThird0 = sx0 + Math.round((sx1 - sx0) * 0.33);
  const midThird1 = sx0 + Math.round((sx1 - sx0) * 0.67);
  for (let x = midThird0; x <= midThird1 && centerMid < 0; x++) {
    const band = containingBand((i) => colClean(grid, i, comicY0, comicY1, o.cleanRatio), x, sx0, sx1);
    if (band && band.b - band.a + 1 >= o.minBand) centerMid = Math.round((band.a + band.b) / 2);
  }

  const gutterGuess = Math.max(2, Math.round(grid.h * 0.01));
  for (const p of panels) {
    if (out.has(p.order)) continue;

    // Same-row sibling (2-column reading-order pairs 0/1, 2/3, 4/5 …): mirror
    // its x-span across the center gutter. Side test on the sibling's CENTER
    // (not edges — a snapped edge can sit in or past the gutter); a sibling
    // centered ON the gutter spans both columns and cannot be mirrored.
    const sib = out.get(p.order ^ 1);
    const sibCx = sib !== undefined ? sib[0] + sib[2] / 2 : -1;
    const sibOnOneSide = sib !== undefined && centerMid >= 0 &&
      Math.abs(sibCx - centerMid) > Math.max(5, Math.round(grid.w * 0.04));
    if (sib && sibOnOneSide) {
      const sibX0 = sib[0];
      const sibX1 = sib[0] + sib[2] - 1;
      const mx0 = clamp(2 * centerMid - sibX1 + 1, sx0, sx1 - 2);
      const mx1 = clamp(2 * centerMid - sibX0 - 1, mx0 + 2, sx1);
      const seed: Box = [mx0, sib[1], mx1 - mx0 + 1, sib[3]];
      out.set(p.order, clampToStructure(snapBoxToGutters(grid, seed, o)));
      continue;
    }

    // No credible sibling: stack a fresh ROW below the lowest known one; the
    // snap pulls the vertical edges to real gutters. With a known center
    // gutter the row is SPLIT into left/right halves (2-column comics)
    // assigned to this order and its reading-order pair.
    const lowest = Math.max(...[...out.values()].map((b) => b[1] + b[3] - 1));
    const ny0 = clamp(lowest + gutterGuess, sy0, sy1 - 2);
    if (ny0 > sy1 - Math.round(grid.h * 0.05)) continue; // no room for a row
    const halves: Array<[number, number]> = centerMid >= 0
      ? [[sx0, clamp(centerMid - 1, sx0 + 2, sx1)], [clamp(centerMid + 1, sx0, sx1 - 2), sx1]]
      : [[sx0, sx1]];
    const orders = halves.length === 2 ? [p.order, p.order ^ 1] : [p.order];
    for (let k = 0; k < halves.length; k++) {
      const ord = orders[k];
      if (ord === undefined || out.has(ord)) continue;
      const [hx0, hx1] = halves[k];
      const seed: Box = [hx0, ny0, hx1 - hx0 + 1, Math.max(3, sy1 - ny0 + 1)];
      const sn = snapBoxToGutters(grid, seed, o);
      if (Math.abs(sn[1] - ny0) <= Math.round(grid.h * o.maxShift)) {
        out.set(ord, clampToStructure(sn));
      }
    }
  }
  return out;
}
