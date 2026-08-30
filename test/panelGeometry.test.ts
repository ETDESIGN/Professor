// panelGeometry — deterministic gutter snapping for comic panel crops
// (doc 12 §7). The synthetic grids mirror the owner's reported failure
// (2026-08-31): scan-v8 boxes bleed vertically into the NEXT panel row, and
// only some panels carry a bbox at all.
import { describe, it, expect } from 'vitest';
import { snapBoxToGutters, planPanelBoxes, type InkGrid, type Box } from '../supabase/functions/_shared/panelGeometry';

/**
 * Build an ink grid representing a 2-col × 3-row comic on a white page.
 * Grid is w×h; each cell is drawn as content except gutters.
 * Panels: [x0, y0, x1, y1] inclusive cell ranges.
 */
function comicGrid(w: number, h: number, panels: Array<[number, number, number, number]>, gutter: number): InkGrid {
  const ink = new Uint8Array(w * h); // 0 = background
  for (const [px0, py0, px1, py1] of panels) {
    for (let y = py0; y <= py1; y++) {
      for (let x = px0; x <= px1; x++) {
        ink[y * w + x] = 1;
      }
    }
  }
  return { w, h, ink };
}

// The real page shape: 1500×2123 downsampled by 3 → 500×707. Comic region
// x 60..480, rows y 106..425, gutters ~10 cells (≈30px).
const W = 500;
const H = 707;
const GUTTER = 10;
// 2 columns: left 60..235, right 305..480 (center gutter 236..304).
// 3 rows: 106..199, 210..303, 314..425 (row heights vary like real comics).
const PANELS: Array<[number, number, number, number]> = [
  [60, 106, 235, 199],   // 0 left row1
  [305, 106, 480, 199],  // 1 right row1
  [60, 210, 235, 303],   // 2 left row2
  [305, 210, 480, 303],  // 3 right row2
  [60, 314, 235, 425],   // 4 left row3
  [305, 314, 480, 425],  // 5 right row3
];
const STRUCTURE: Box = [50, 100, 441, 332]; // comic region incl. outer gutters

const grid = comicGrid(W, H, PANELS, GUTTER);

describe('snapBoxToGutters', () => {
  it('contracts an over-tall box that bleeds into the next row (the reported bug)', () => {
    // Scan gave panel 0 as y 103..355 of 2123 → grid ≈ [60, 103, 176w, 152h]
    // (bottom lands mid-row-2). Expect the bottom to snap to the row1/row2
    // gutter (~204..209 → mid 206) and the top to hold ~103.
    const box: Box = [60, 103, 176, 152];
    const [x, y, w2, h2] = snapBoxToGutters(grid, box);
    expect(y).toBeLessThanOrEqual(106 + 2);          // top holds at panel top
    expect(y + h2).toBeGreaterThanOrEqual(204 - 2);  // bottom = row gutter top
    expect(y + h2).toBeLessThanOrEqual(209 + 2);     // …not past the gutter
    expect(x).toBeGreaterThanOrEqual(58);
    expect(x + w2).toBeLessThanOrEqual(237 + 2);
  });

  it('retracts a box that runs past the whole comic to the last content boundary', () => {
    // Scan gave panel 2 (left row2) a height spanning to y≈0.95 → grid bottom ~660.
    // Pure snapping cannot know the box MEANT one row (that disambiguation is
    // the row-height prior in planPanelBoxes) — but it must retract the wild
    // overshoot to the comic's last content boundary instead of trailing off
    // into the empty page.
    const box: Box = [60, 208, 176, 452];
    const [x, y, w2, h2] = snapBoxToGutters(grid, box);
    expect(y).toBeGreaterThanOrEqual(206 - 2);       // top = row1/row2 gutter
    expect(y).toBeLessThanOrEqual(211 + 2);
    expect(y + h2).toBeGreaterThanOrEqual(418);      // last content boundary
    expect(y + h2).toBeLessThanOrEqual(435);
    expect(x).toBeGreaterThanOrEqual(58);
  });

  it('converges an under-tight box to the same gutters (symmetry)', () => {
    const tight: Box = [60, 115, 170, 60];   // bottom 175, inside panel 0
    const over: Box = [60, 100, 180, 170];   // bottom 270, inside panel 2
    const a = snapBoxToGutters(grid, tight);
    const b = snapBoxToGutters(grid, over);
    // The over-cut box must contract to the row gutter; the tight one may
    // legitimately stay (dirty edges contract, never expand) — but must never
    // cross INTO the next row.
    expect(b[1] + b[3]).toBeLessThanOrEqual(211);
    expect(a[1] + a[3]).toBeLessThanOrEqual(211);
  });

  it('leaves a borderless box untouched when no gutter exists nearby', () => {
    const noise = { w: 100, h: 100, ink: new Uint8Array(100 * 100).fill(1) }; // all content
    const box: Box = [20, 20, 50, 50];
    expect(snapBoxToGutters(noise, box)).toEqual(box);
  });
});

describe('planPanelBoxes (missing panels)', () => {
  it('mirrors missing right-column panels and splits the stacked row at the center gutter', () => {
    // Only panels 0 and 2 were scanned (the owner's test unit shape).
    const plan = planPanelBoxes(grid, STRUCTURE, [
      { order: 0, bbox: [60, 103, 176, 152] as Box }, // over-tall, will snap
      { order: 1, bbox: null },
      { order: 2, bbox: [60, 208, 176, 452] as Box }, // spans 2+ rows → row prior
      { order: 3, bbox: null },
      { order: 4, bbox: null },
      { order: 5, bbox: null },
    ]);
    expect(plan.size).toBe(6);

    const p1 = plan.get(1)!;
    expect(p1[0]).toBeGreaterThanOrEqual(301);        // right column
    expect(p1[0]).toBeLessThanOrEqual(309);
    expect(p1[2]).toBeGreaterThan(150);
    expect(p1[1]).toBeGreaterThanOrEqual(104);        // same row band as p0
    expect(p1[1] + p1[3]).toBeLessThanOrEqual(211);

    // Row-height prior collapses the 2-row-tall scan box to ONE row.
    const p2 = plan.get(2)!;
    expect(p2[1]).toBeGreaterThanOrEqual(204);
    expect(p2[1] + p2[3]).toBeLessThanOrEqual(311);

    const p3 = plan.get(3)!;
    expect(p3[0]).toBeGreaterThanOrEqual(301);
    expect(p3[1]).toBeGreaterThanOrEqual(204);
    expect(p3[1] + p3[3]).toBeLessThanOrEqual(311);

    // Row 3 (both missing): stacked below the last known row, SPLIT into
    // left/right halves at the comic's center gutter.
    const p4 = plan.get(4)!;
    expect(p4[1]).toBeGreaterThanOrEqual(308);
    expect(p4[1]).toBeLessThanOrEqual(320);
    expect(p4[1] + p4[3]).toBeGreaterThanOrEqual(420);
    expect(p4[1] + p4[3]).toBeLessThanOrEqual(435);
    expect(p4[0] + p4[2]).toBeLessThanOrEqual(240);   // left half only

    const p5 = plan.get(5)!;
    expect(p5[0]).toBeGreaterThanOrEqual(300);        // right half
    expect(p5[0]).toBeLessThanOrEqual(310);
    expect(p5[1]).toBeGreaterThanOrEqual(308);
    expect(p5[1] + p5[3]).toBeLessThanOrEqual(435);
  });

  it('returns only provided boxes when nothing anchors the grid', () => {
    const plan = planPanelBoxes(grid, STRUCTURE, [
      { order: 0, bbox: null },
      { order: 1, bbox: null },
    ]);
    expect(plan.size).toBe(0);
  });

  it('a single provided box still gutter-aligns (row prior needs a sibling column)', () => {
    const plan = planPanelBoxes(grid, STRUCTURE, [{ order: 2, bbox: [60, 208, 176, 452] as Box }]);
    expect(plan.size).toBe(1);
    const p2 = plan.get(2)!;
    expect(p2[1]).toBeGreaterThanOrEqual(204);       // top = row1/row2 gutter
    expect(p2[1]).toBeLessThanOrEqual(211);
    // Without a sibling the 2-row span is geometrically ambiguous: the bottom
    // hugs the last content boundary (just under row 3), never past it.
    expect(p2[1] + p2[3]).toBeGreaterThanOrEqual(418);
    expect(p2[1] + p2[3]).toBeLessThanOrEqual(435);
  });
});
