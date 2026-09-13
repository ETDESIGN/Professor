# Exercise-Quality Rebuild + Student Story Fix — Implementation Plan (2026-09-14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix everything the owner reported in testing session 2: ambiguous/garbage generated exercises (Sentence Lab, Grammar Lab, Vocab Blitz, Unit Review), vocab-card English-word leak, Word Search difficulty + diagonal bug + dead hint, Spelling Bee dead keyboard + layout, and the missing story content in the student app.

**Architecture:** Client fixes land in `apps/student/**` + shared engines (no data-write changes — scoring/hearts/FSRS paths stay verbatim). Generation quality is fixed at the source in the `generate-exercises` edge function (deterministic rebuild) plus one batched region-safe AI validation gate per run. Story content reaches students by making the student reader resolve pages relational-first (mirroring the board) and mapping `STORY_STAGE_AG` onto it.

**Tech Stack:** Vite + React + TS + Tailwind (student app), Deno edge functions (Supabase), OpenRouter (region-safe models only), vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-exercise-quality-and-story-fixes-design.md` (owner decisions recorded there — read §"Owner decisions" first).

## Global Constraints

- Sacred data writes stay VERBATIM: `Engine.recordAttempt`, hearts (`loseHeart`/`restoreHeart`, `heartSafe`), GamificationService award latches, gems↔XP 1:1 inside `award_xp` RPCs, exactly-once patterns, `record:false` rules. No task below touches them.
- Region-safe AI only (`AI_MODEL_NAME` `moonshotai/kimi-k2.6`, fallback `deepseek/deepseek-chat`). NEVER openai/google/anthropic model IDs.
- Theme: Wonder Atlas × Duolingo white/pink light mix. No owl/animal mascots. Tap targets ≥48px where feasible.
- Edge functions never auto-deploy: after touching `supabase/functions/**` run `npx supabase functions deploy <name> --project-ref xsdnzijketjnzhakqtit --no-verify-jwt` from the repo root.
- Before EVERY commit: `git status` — commit only the files this task names (explicit paths, never `git add -A`). If a file this plan names shows unexpected pre-existing modifications, STOP and report instead of committing.
- Gauntlet at the end of each task (and full batch): `npx tsc --noEmit -p tsconfig.json` (0 errors), `npx vitest run` (≥ 835 passing), `npm run build` clean. For function tasks also: `npx tsc --noEmit --noResolve` sweep over `supabase/functions/` (repo tsc does not cover it).
- Owner WIP check: current expected-clean tree (verified 2026-09-14): only `M .gitignore` + untracked `.ignore`, `AGENTS.md`, `PROMPT_STITCH_*`, `docs/audit/student-app-v3/stitch/30-dubbing-studio/`, `docs/superpowers/{plans,specs}/2026-08-28-video-dubbing*`, `scripts/testing/.owner-image-test.ts`, `scripts/testing/.prod-e2e4.mjs`. Anything else modified = owner WIP = do not commit.

---

### Task 1: `snapLine` diagonal fix (shared grid engine)

**Files:**
- Modify: `apps/board/templates/wordSearch/gridEngine.ts:114-140`
- Test: `test/wordSearchGridEngine.test.ts` (extend; import `snapLine` the way the file already imports gridEngine exports)

**Interfaces:**
- Produces (unchanged signature): `snapLine(anchor: Cell, target: Cell, size: number): Cell[]` — after this task, exact diagonal endpoints snap to the diagonal line. All consumers (student step, board) benefit with zero changes.

- [ ] **Step 1: Write the failing tests** — append to `test/wordSearchGridEngine.test.ts`:

```ts
describe('snapLine diagonal endpoints (owner 2026-09-14: diagonal words were unclickable)', () => {
  it('selects the exact down-right diagonal (0,0)→(2,2)', () => {
    expect(snapLine({ row: 0, col: 0 }, { row: 2, col: 2 }, 10))
      .toEqual([{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }]);
  });
  it('selects the exact up-right anti-diagonal (2,0)→(0,2)', () => {
    expect(snapLine({ row: 2, col: 0 }, { row: 0, col: 2 }, 10))
      .toEqual([{ row: 2, col: 0 }, { row: 1, col: 1 }, { row: 0, col: 2 }]);
  });
  it('still snaps horizontal exactly', () => {
    const cells = snapLine({ row: 1, col: 1 }, { row: 1, col: 4 }, 10);
    expect(cells.map((c) => c.col)).toEqual([1, 2, 3, 4]);
    expect(cells.every((c) => c.row === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/wordSearchGridEngine.test.ts` → the two diagonal cases FAIL (return horizontal/vertical lines), horizontal passes.

- [ ] **Step 3: Fix the projection** — in `snapLine`, normalize by the vector's squared length:

```ts
  for (const [vr, vc] of ALL_VECTORS) {
    // Projection of (dr,dc) onto the vector, normalized by its squared
    // length (1 for straight, 2 for diagonal) — without this, diagonal
    // candidates overshoot 2× and exact diagonal taps snap straight.
    const len2 = vr * vr + vc * vc;
    const proj = (dr * vr + dc * vc) / len2;
    if (proj <= 0) continue;
    const steps = Math.round(proj);
```

(rest of the loop unchanged)

- [ ] **Step 4: Run** `npx vitest run test/wordSearchGridEngine.test.ts` → ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/board/templates/wordSearch/gridEngine.ts test/wordSearchGridEngine.test.ts
git commit -m "fix(word-search): snapLine diagonal projection normalized — exact diagonal taps now select diagonal words (owner 2026-09-14)"
```

---

### Task 2: Word Search student step — easy directions, always-on hint, slide gesture

**Files:**
- Modify: `apps/student/steps/WordSearchStep.tsx` (:95-169 loading/handlers, :300-334 header/hint, :389-397 cell buttons; read `apps/board/templates/BoardWordSearch.tsx:1040-1100` first — the proven pointer-drag pattern to port)

**Interfaces:**
- Consumes: `DIRECTIONS_EASY`, `buildGrid`, `snapLine`, `matchSegment`, `Cell` from `apps/board/templates/wordSearch/gridEngine` (already imported; add `DIRECTIONS_EASY` to that import).
- Produces: no API changes — same `recordAnswer`/playCue calls per attempt (scoring untouched).

- [ ] **Step 1: Directions** — `:102`, pass EASY vectors (owner decision: words only left→right and top→bottom):

```ts
const built = buildGrid(toGridWords(round), { seed: (Math.random() * 0x7fffffff) | 0, fillBias: true, directions: DIRECTIONS_EASY });
```

- [ ] **Step 2: Hint always available with a 10s cooldown** — replace `canUseHint = missCount >= 3` (:300) and the guard `if (missCount < 3) return;` (:156):

```ts
const [hintCooldown, setHintCooldown] = useState(false);
const canUseHint = !hintCooldown && foundIds.length < words.length;
```

```ts
const handleUseHint = () => {
  if (hintCooldown) return;
  const unfound = words.find((w) => !foundIds.includes(w.id));
  if (!unfound || !grid) return;
  const placement = grid.placements.find((p) => p.wordId === unfound.id);
  if (!placement || placement.cells.length === 0) return;
  const firstCell = placement.cells[0];
  const key = `${firstCell.row}-${firstCell.col}`;
  setHintCell(key);
  playCue('reveal');
  setHintCooldown(true);
  setTimeout(() => setHintCooldown(false), 10000);
  setTimeout(() => { setHintCell((curr) => (curr === key ? null : curr)); }, 4000);
};
```

Update the label (:330-333): `title={canUseHint ? 'Show first letter of an unfound word' : 'Hint recharging…'}` and text `Hint{canUseHint ? '!' : ''}` (drop the miss counter). `missCount`/`setMissCount` may remain for the wrong-cells shake; remove the unused `canUseHint`-related references cleanly so tsc stays at 0 errors.

- [ ] **Step 3: Slide-over-word gesture alongside tap-tap** — port from `BoardWordSearch.tsx:1040-1100`. Add state and handlers:

```ts
const [dragAnchor, setDragAnchor] = useState<Cell | null>(null);
const [dragCell, setDragCell] = useState<Cell | null>(null);
const dragLine = dragAnchor && dragCell && (dragAnchor.row !== dragCell.row || dragAnchor.col !== dragCell.col)
  ? snapLine(dragAnchor, dragCell, grid?.size ?? 0)
  : null;

const submitLine = (line: Cell[]) => {
  if (!grid || line.length < 2) return;
  statsRef.current.attempts += 1;
  const candidates = toGridWords(words.filter((w) => !foundIds.includes(w.id)));
  const hit = matchSegment(line, grid, candidates);
  if (hit) {
    const idx = wordIndex(hit.id);
    const word = words[idx];
    setFoundIds((prev) => [...prev, hit.id]);
    statsRef.current.found += 1;
    recordAnswer(true);
    playCue('correct');
    if (word?.audioUrl) playAudioUrl(word.audioUrl, word.word).catch(() => {});
    if (statsRef.current.found >= words.length) { playCue('win'); setTimeout(() => setScreen('done'), 500); }
  } else {
    recordAnswer(false);
    playCue('wrong');
    setMissCount((m) => m + 1);
    setWrongCells(line.map((c) => `${c.row}-${c.col}`));
    setTimeout(() => setWrongCells([]), 450);
  }
};
```

Refactor `handleCell` to reuse `submitLine` (tap-tap path: first tap sets `anchor`, second computes `snapLine` then `submitLine`). On each cell button add pointer handlers (keep `onClick` for tap-tap):

```tsx
onPointerDown={(e) => { if (screen !== 'play') return; setDragAnchor(cell); setDragCell(cell); (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); }}
onPointerEnter={() => { if (dragAnchor) setDragCell(cell); }}
onPointerUp={() => {
  if (!dragAnchor) return;
  if (dragCell && (dragCell.row !== dragAnchor.row || dragCell.col !== dragAnchor.col)) {
    submitLine(snapLine(dragAnchor, dragCell, grid!.size));
  } else {
    handleCell(cell); // finger never left the cell → normal tap-tap behavior
  }
  setDragAnchor(null); setDragCell(null);
}}
onPointerCancel={() => { setDragAnchor(null); setDragCell(null); }}
```

Give the grid container `style={{ touchAction: 'none' }}` (prevents scroll hijack during slides). Render `dragLine` cells with a distinct preview style (e.g. same trail classes as selection at reduced opacity — reuse whatever `anchor`/selection styling exists at :389-397, adding `dragLine?.some(...)` to the active-cell condition).

- [ ] **Step 4: Verify** — `npx tsc --noEmit -p tsconfig.json` 0 errors; `npx vitest run` green; `npm run build` clean. Manual smoke (dev server, any unit with ≥4 words): drag across a left→right word → it locks; tap-tap still works; hint pill is amber/active immediately.

- [ ] **Step 5: Commit**

```bash
git add apps/student/steps/WordSearchStep.tsx
git commit -m "feat(word-search): student step — easy directions only, always-on hint w/ cooldown, slide-to-select gesture (owner 2026-09-14)"
```

---

### Task 3: Spelling Bee — fix the wave-change timer race (dead keyboard P1)

**Files:**
- Modify: `components/games/spellingBee/useSpellingBeeTurn.ts` (:112-141 reset, :324-336 effects)
- Test: create `test/useSpellingBeeTurn.test.ts`

**Interfaces:**
- Produces: unchanged hook return type. Behavior guarantee: after ANY `waveWords` identity change, `status` transitions `'presenting' → 'typing'` after `PRESENT_BEAT_MS` (3200ms) — the on-screen keyboard becomes tappable.

- [ ] **Step 1: Write the failing regression test.** Read the hook's `SpellingBeeWord`/settings types first and adapt the fixtures to the REAL shapes (fields used at a minimum: `id`, `letters`; plus whatever the type requires):

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useSpellingBeeTurn } from '../components/games/spellingBee/useSpellingBeeTurn';

const mkWords = (tag: string) => Array.from({ length: 3 }, (_, i) => ({
  id: `${tag}-${i}`,
  word: `word${i}x${tag}`,
  letters: `word${i}`.split(''),
  audioUrl: '',
  image_url: '',
}));
const settings = { timerSeconds: 20, letterRemoval: true, removalSpeed: 1 } as any;

it('reaches typing after a wave change — keyboard not stuck (owner 2026-09-14: dead keyboard)', () => {
  vi.useFakeTimers();
  try {
    const { result, rerender } = renderHook(
      ({ w }) => useSpellingBeeTurn(w as any, settings),
      { initialProps: { w: mkWords('a') as any } },
    );
    act(() => { vi.advanceTimersByTime(3400); });
    expect(result.current.status).toBe('typing');
    rerender({ w: mkWords('b') as any });
    act(() => { vi.advanceTimersByTime(3400); });
    expect(result.current.status).toBe('typing'); // fails pre-fix: stays 'presenting'
  } finally { vi.useRealTimers(); }
});
```

- [ ] **Step 2: Run** `npx vitest run test/useSpellingBeeTurn.test.ts` → FAIL (status stays `'presenting'` after rerender).

- [ ] **Step 3: Fix.** In `resetTurnState` (:112-135) DELETE the line `later(() => beginTyping(), PRESENT_BEAT_MS);` and add a helper next to `later`:

```ts
const schedulePresentBeat = () => { later(() => beginTyping(), PRESENT_BEAT_MS); };
```

Replace the bare clear effect (:332-334) so the beat is scheduled AFTER the clears (guaranteed effect ordering) and also covers mount-with-words:

```ts
// Wave changes reset synchronously in render (lastWaveRef above); this
// effect owns the timer lifecycle: clear stale holds FIRST, then (re)
// schedule the presenting→typing beat so it can never be cleared by the
// same wave change that scheduled it (the dead-keyboard race, 2026-09-14).
useEffect(() => {
  clearTimeouts();
  if (statusRef.current === 'presenting') schedulePresentBeat();
}, [waveWords]);
```

In the `resetTurn` callback (:326-330) add the beat after its clear: `clearTimeouts(); resetTurnState(); schedulePresentBeat();`. Verify `beginTyping` is declared before `schedulePresentBeat` runs (it is called at :125 today, so the same ordering works).

- [ ] **Step 4: Run** `npx vitest run test/useSpellingBeeTurn.test.ts` → PASS; then full `npx vitest run` (fastVocab/spellingBee suites must stay green).

- [ ] **Step 5: Commit**

```bash
git add components/games/spellingBee/useSpellingBeeTurn.ts test/useSpellingBeeTurn.test.ts
git commit -m "fix(spelling-bee): wave-change no longer kills the beginTyping timer — on-screen keyboard alive at every round start (P1, owner 2026-09-14)"
```

---

### Task 4: Spelling Bee — layout (kill the dead bands, phone-sized keyboard) + compact Ready chip

**Files:**
- Modify: `apps/student/steps/SpellingBeeStep.tsx` (:453-474 stage container), `apps/student/SpellingBeeGame.tsx` (:903-924), `components/games/spellingBee/SpellingBeeStage.tsx` (:55-70 presenting screen, :196-199 root layout, :388-450 keyboard)

**Interfaces:** none (visual only; no scoring/state changes).

- [ ] **Step 1: Containers stop centering a short child** — in both `SpellingBeeStep.tsx:453` and `SpellingBeeGame.tsx:903` change `flex-1 min-h-0 flex items-center justify-center px-3 …` to `flex-1 min-h-0 flex flex-col px-3 …`, and pass `className="w-full flex-1 flex flex-col"` to the stage child (currently `w-full` only) so the stage's own `justify-between` gets real height to distribute.

- [ ] **Step 2: Keyboard grows to phone size** — `SpellingBeeStage.tsx`: key classes `h-10 sm:h-12 md:h-14` → `h-12 sm:h-14 md:h-16`; `max-w-[136px]` → `max-w-[150px]`; compact glyph `text-lg sm:text-xl` → `text-xl sm:text-2xl`; row container `gap-1 sm:gap-2` → `gap-1.5 sm:gap-2.5`; keep the `<450px`-height media shrink (:490-504) intact.

- [ ] **Step 3: Prompt restacks on phones** — in the stage's prompt card (where the word image sits LEFT of the letter/word line), make the row `flex-col sm:flex-row` with the image container `w-full sm:w-auto` so portrait phones stack image above the word (owner: "the images are on the left side of the writing… should be better designed to fit a mobile phone screen").

- [ ] **Step 4: Compact "Ready to spell" chip** — `SpellingBeeStage.tsx:58` currently renders the skip-presenting button only when `!compact`. Extend: on `presenting && compact`, render a small pill button (48px+ tap target) labeled `Ready to spell →` calling the SAME handler the non-compact button uses. This is belt-and-suspenders behind the Task-3 race fix.

- [ ] **Step 5: Verify** — tsc 0 / vitest green / build clean; dev-server smoke on a 390px viewport: no dead bands, keyboard rows fill width, tap keys → letters appear.

- [ ] **Step 6: Commit**

```bash
git add apps/student/steps/SpellingBeeStep.tsx apps/student/SpellingBeeGame.tsx components/games/spellingBee/SpellingBeeStage.tsx
git commit -m "feat(spelling-bee): phone-fit layout — full-height stage, bigger keyboard, stacked prompt, compact Ready chip (owner 2026-09-14)"
```

---

### Task 5: ChoiceExercise — image-only cards, uniform modality, fill the frame

**Files:**
- Modify: `apps/student/exercises/ChoiceExercise.tsx` (:87 imageOptions computation, :258-343 image grid block)

**Interfaces:** none (rendering only; `onComplete` payload contract untouched).

- [ ] **Step 1: Uniform image modality** — replace the `:87` computation:

```ts
const rawOptions: any[] = Array.isArray(c.options) ? c.options : [];
const allHaveImages = rawOptions.length > 0 && rawOptions.every((o: any) => typeof o === 'object' && !!o?.image_url);
const imageOptions = allHaveImages && (kind === 'IMAGE_SELECT' || kind === 'LISTEN_SELECT');
```

A set with SOME images now renders as the uniform TEXT grid (no mixed modality); IMAGE_SELECT and LISTEN_SELECT with all-images render the image grid.

- [ ] **Step 2: Image grid is always image-only** — in the `imageOptions` block: delete the `imageOnly` conditional pattern (`:278`, `:286`, `:301`, `:306-310`, `:331-339`): card container becomes `p-0 aspect-square`, the `<img>` class becomes `'w-full h-full object-cover'` (edge-to-edge inside the rounded card — owner: "fit from side to side and corner to corner"), and the label strip block (`:333-339`) is DELETED (keep `alt={optText}` for accessibility).

- [ ] **Step 3: Verify** — tsc 0 / vitest green / build clean. Dev smoke: Word Detective + a Sound Lab LISTEN_SELECT question → cards show pictures only; a question whose siblings lack images → all-text options.

- [ ] **Step 4: Commit**

```bash
git add apps/student/exercises/ChoiceExercise.tsx
git commit -m "feat(choice): image cards are image-only + edge-to-edge object-cover; mixed-modality sets degrade to uniform text (owner 2026-09-14)"
```

---

### Task 6: Student story data path (fix "No content for Story")

**Files:**
- Modify: `types/stage.ts:76-81`, `services/gameRouting.ts:103-127`, `apps/student/SoloLessonPlayer.tsx` (:666-671 renderStoryStage, :1309-1311 render switch)

**Interfaces:**
- Consumes: `getStory(manifest, structureIds | null)` from `services/manifest.ts:214-280` (READ it first — confirm the relational page field names and mirror them in the mapping below; `_relational` is already attached to the manifest by `store/SoloSessionContext.tsx:124-128`).
- Produces: `STORY_STAGE_AG` becomes student-eligible and renders through the existing story reader. `deriveDefaultPath` will start including it for new paths; saved studentPaths keep working via the relational fallback.

- [ ] **Step 1: Eligibility + title** — `types/stage.ts` add `'STORY_STAGE_AG',` to the `STUDENT_ELIGIBLE_TYPES` literal; `services/gameRouting.ts` `GAME_TITLES` add `STORY_STAGE_AG: 'Story',`.

- [ ] **Step 2: Runtime page resolution** — in `SoloLessonPlayer.tsx`, extend the existing manifest import with `getStory`, then rewrite `renderStoryStage`'s page source:

```tsx
const renderStoryStage = () => {
  const data: any = currentStep.data || {};
  // Board parity (BoardStoryStage.tsx:105-110): relational story_pages first
  // (survives stale/AI flows and the removed vault bridge write), frozen
  // data.pages as fallback.
  const relPages = getStory(state.activeUnit?.manifest, Array.isArray(data.structure_ids) ? data.structure_ids : null).pages || [];
  const mapped = relPages.map((p: any) => ({ ...p, imageUrl: p.imageUrl ?? p.image_url ?? p.image }));
  const pages = mapped.length > 0 ? mapped : (data.pages || []);
  if (pages.length === 0) return <EmptyStep title="Story" />;
  const page = pages[activePageIndex];
  if (!page) return <EmptyStep title="Story" />;
  // …rest unchanged
```

In the render switch add `STORY_STAGE_AG` next to `STORY_STAGE` (`case 'STORY_STAGE': case 'STORY_STAGE_AG': return renderStoryStage();`).

- [ ] **Step 3: Verify** — tsc 0 / vitest green / build clean. Dev smoke on Unit 2 (`7e50177c`): the lesson flow's story step renders the 5-paragraph story with scene images (relational), and a synthetic block with `data: {title}` only ALSO renders (fallback proves the path).

- [ ] **Step 4: Commit** (surgical shared-file changes named in the message per session rules)

```bash
git add types/stage.ts services/gameRouting.ts apps/student/SoloLessonPlayer.tsx
git commit -m "fix(student-story): STORY_STAGE_AG student-eligible + relational-first page resolution via getStory(structure_ids) — stories render again (P1, owner 2026-09-14; surgical: types/stage.ts, gameRouting, SoloLessonPlayer)"
```

---

### Task 7: `exerciseQuality` pure module (generation helpers)

**Files:**
- Create: `supabase/functions/_shared/exerciseQuality.ts`
- Test: create `test/exerciseQuality.test.ts` (pattern precedent: `_shared/contentGroups.ts` + `test/contentGroups.test.ts`)

**Interfaces:**
- Produces: `normalizeForDedupe(s: string): string`, `sanitizeConfusables(list: unknown): string[]`, `dedupeDistinct(correct: string, distractors: string[]): string[]`, `grammarMutations(sentence: string): string[]` — consumed by Task 8.

- [ ] **Step 1: Write the failing tests** (`test/exerciseQuality.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { normalizeForDedupe, sanitizeConfusables, dedupeDistinct, grammarMutations } from '../supabase/functions/_shared/exerciseQuality';

describe('normalizeForDedupe', () => {
  it('folds case, curly apostrophes, terminal punctuation, whitespace', () => {
    expect(normalizeForDedupe("He mustn’t go outside.")).toBe(normalizeForDedupe("he mustn't go outside"));
  });
});

describe('sanitizeConfusables', () => {
  it('drops vs-joined alternatives and questions, keeps real words', () => {
    expect(sanitizeConfusables(['Friday vs Saturday', 'Tuesday', 'watch a DVD', 'which day?', ''])).toEqual(['Tuesday', 'watch a DVD']);
  });
});

describe('dedupeDistinct', () => {
  it('dedupes distractors vs correct AND each other (normalized)', () => {
    expect(dedupeDistinct('Tuesday', ['TUESDAY.', 'tuesday', 'Wednesday'])).toEqual(['Wednesday']);
  });
});

describe('grammarMutations — real-grammar wrong variants only, never invented words', () => {
  it('moves the frequency adverb to the wrong slot', () => {
    expect(grammarMutations('I always eat breakfast')).toContain('I eat always breakfast');
  });
  it('inserts to after a modal', () => {
    expect(grammarMutations('You must wear shoes')).toContain('You must to wear shoes');
  });
  it('drops the third-person s', () => {
    expect(grammarMutations('She eats vegetables at dinner')).toContain('She eat vegetables at dinner');
  });
  it('swaps a/an wrongly', () => {
    expect(grammarMutations('I have an egg')).toContain('I have a egg');
  });
  it('returns [] when nothing matches', () => {
    expect(grammarMutations('The sky is blue')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/exerciseQuality.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `supabase/functions/_shared/exerciseQuality.ts` (pure, no Deno APIs so the repo test imports it):

```ts
// Pure exercise-quality helpers for generate-exercises (repo-tested via
// test/exerciseQuality.test.ts — same pattern as _shared/contentGroups.ts).
export function normalizeForDedupe(s: string): string {
  return String(s ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const VS_JOINER = /\bvs\.?\b|\bor\b|\|/i;
export function sanitizeConfusables(list: unknown): string[] {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0 && x.length < 60 && !VS_JOINER.test(x) && !x.includes('?'));
}

export function dedupeDistinct(correct: string, distractors: string[]): string[] {
  const seen = new Set([normalizeForDedupe(correct)]);
  const out: string[] = [];
  for (const d of distractors) {
    const key = normalizeForDedupe(d);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

const FREQ_ADVERBS = new Set(['always', 'never', 'often', 'sometimes', 'usually', 'rarely', 'seldom']);
const MODALS = new Set(['must', "mustn't", 'should', "shouldn't", 'will', "won't", 'may', 'might']);

/**
 * REAL-grammar wrong variants of a CORRECT sentence — word-order inversions
 * and classic ESL error classes only. Never invents words (owner 2026-09-14:
 * "creating fake words doesn't make sense; inverting word order is enough").
 */
export function grammarMutations(sentence: string): string[] {
  const src = String(sentence ?? '').trim().replace(/\s+/g, ' ');
  if (!src) return [];
  const toks = src.split(' ');
  const norm = normalizeForDedupe(src);
  const out = new Set<string>();
  const push = (cand: string[]) => {
    const s = cand.join(' ');
    if (cand.length !== toks.length && cand.length !== toks.length + 1) return;
    if (normalizeForDedupe(s) !== norm) out.add(s);
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].toLowerCase().replace(/[.!?,;:]+$/, '');
    // 1) frequency adverb swapped with its neighbour ("I always eat" → "I eat always")
    if (FREQ_ADVERBS.has(t)) {
      const j = i + 1 < toks.length ? i + 1 : i - 1;
      if (j >= 0) { const cand = [...toks]; [cand[i], cand[j]] = [cand[j], cand[i]]; push(cand); }
    }
    // 2) modal + to ("must wear" → "must to wear")
    if (MODALS.has(t) && (toks[i + 1] || '').toLowerCase() !== 'to' && (toks[i + 1] || '').toLowerCase() !== 'be') {
      push([...toks.slice(0, i + 1), 'to', ...toks.slice(i + 1)]);
    }
    // 3) third-person -s drop ("she eats" → "she eat")
    if (i > 0 && /^(he|she|it)$/i.test(toks[i - 1]) && /^[a-z]+s$/i.test(t) && !/(ss|us|is)$/i.test(t)) {
      push([...toks.slice(0, i), toks[i].replace(/s$/i, ''), ...toks.slice(i + 1)]);
    }
    // 4) a/an misuse
    const next0 = (toks[i + 1] || '').replace(/[^a-z]/gi, '')[0]?.toLowerCase();
    if (t === 'a' && next0 && 'aeiou'.includes(next0)) { const cand = [...toks]; cand[i] = 'an'; push(cand); }
    if (t === 'an' && next0 && !'aeiou'.includes(next0)) { const cand = [...toks]; cand[i] = 'a'; push(cand); }
    // 5) don't/doesn't swap
    if (t === "doesn't") { const cand = [...toks]; cand[i] = "don't"; push(cand); }
    else if (t === "don't") { const cand = [...toks]; cand[i] = "doesn't"; push(cand); }
  }
  return [...out];
}
```

- [ ] **Step 4: Run** `npx vitest run test/exerciseQuality.test.ts` → ALL PASS (adjust nothing in the tests; fix the module if a case fails).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/exerciseQuality.ts test/exerciseQuality.test.ts
git commit -m "feat(generation): pure exerciseQuality helpers — normalized dedupe, confusable sanitization, real-grammar mutations (owner 2026-09-14)"
```

---

### Task 8: generate-exercises rebuild + AI validation gate (+ enrich-unit prompt)

**Files:**
- Modify: `supabase/functions/generate-exercises/index.ts` (:83-178 buildVocabItems, :122-129 LISTEN_SELECT, :139-143 SPELL_CLOZE, :200-263 ERROR_SPOT, :299-315 GRAMMAR_FILL, publish/persist pass ~:1093-1110)
- Modify: `supabase/functions/enrich-unit/index.ts` (:581 and :656-657 confusables prompt lines — verify the file is git-clean first: `git status --porcelain supabase/functions/enrich-unit/index.ts` must be empty)

**Interfaces:**
- Consumes: Task 7 helpers (`import { normalizeForDedupe, sanitizeConfusables, dedupeDistinct, grammarMutations } from '../_shared/exerciseQuality.ts';` — mirror the existing `_shared` import style in this file).
- Produces: same PoolItemRow shapes; new optional content flag `needs_ai_check?: true` (stripped before persist); fewer, higher-quality items.

- [ ] **Step 1: SPELL_CLOZE rebuild** — in `buildVocabItems`, replace `:139-143`. The unit's vocab rows are already in scope in this builder (the same array `siblingWords`/`siblingMeanings` derive from — use its elements' `word` fields):

```ts
if (example && confusables.length >= 1) {
  const clean = sanitizeConfusables(confusables);
  const unitWordNorms = new Set(unitVocabRows.map((v: any) => normalizeForDedupe(String(v?.word || ''))).filter(Boolean));
  const distractors = dedupeDistinct(word, clean).slice(0, 3);
  // Same-unit distractor = the ambiguity signature (Wednesday↔Tuesday); the
  // AI gate is the semantic authority, the flag drives the deterministic fallback.
  const ambiguousRisk = distractors.some((d) => unitWordNorms.has(normalizeForDedupe(d)));
  if (distractors.length >= 1) {
    const c = buildChoices(word, distractors, Math.min(4, distractors.length + 1));
    push('SPELL_CLOZE', { sentence_with_blank: blankOut(example, word), ...c, ...(ambiguousRisk ? { needs_ai_check: true } : {}) });
  }
}
```

- [ ] **Step 2: LISTEN_SELECT all-or-nothing images** — at `:122-129`, only emit when the word AND ≥3 siblings have real images:

```ts
const imgSiblings = siblings.filter((s: any) => isRealImage(String(s?.image_url || '')));
if (image && imgSiblings.length >= 3) {
  const correct = { text: word, image_url: image };
  const distractorImgs = imgSiblings.slice(0, 3).map((s: any) => ({ text: String(s.word), image_url: String(s.image_url) }));
  const c = buildChoices(correct, distractorImgs, 4);
  push('LISTEN_SELECT', { ...c });
}
```

(Reuse the file's existing real-image check helper/pattern from the IMAGE_SELECT gate at `:132` — if `isRealImage` doesn't exist by that name, use whatever predicate IMAGE_SELECT uses.)

- [ ] **Step 3: ERROR_SPOT rebuild** — DELETE `inflectionVariants` (:216-227). Distractors per error pair become: (a) cross-apply sibling errors' wrong tokens at fix positions (existing :241-248 loop, KEEP but pass results through `dedupeDistinct`), (b) `grammarMutations(correct)`. Skip the item unless ≥2 distinct distractors survive:

```ts
const list = dedupeDistinct(correct, [
  ...crossApplied,          // from the existing (a) loop, collected into an array
  ...grammarMutations(correct),
]).slice(0, 3);
if (list.length >= 2) {
  const c = buildChoices(correct, list, Math.min(4, list.length + 1));
  push('ERROR_SPOT', { sentence: wrong, ...c, explanation: g?.explanation });
}
```

- [ ] **Step 4: GRAMMAR_FILL rebuild** — replace `:299-315`; options stay on the SAME stem:

```ts
const correctSentence = pairs.length > 0 ? String(pairs[0]?.transformed || '') : (examples.length > 0 ? String(examples[0]) : '');
if (correctSentence) {
  const pairOriginal = pairs.length > 0 ? String(pairs[0]?.original || '') : '';
  const list = dedupeDistinct(correctSentence, [
    ...(pairOriginal ? [pairOriginal] : []),
    ...grammarMutations(correctSentence),
    ...errors.map((e: any) => String(e?.wrong || '')), // only same-sentence wrongs survive dedupe vs stem
  ]).filter((s) => normalizeForDedupe(s) !== normalizeForDedupe(correctSentence)).slice(0, 3);
  if (list.length >= 2) {
    const c = buildChoices(correctSentence, list, Math.min(4, list.length + 1));
    push('GRAMMAR_FILL', { rule_name: rule, sentence_with_blank: g?.pattern_template || '', ...c, explanation: g?.explanation });
  }
}
```

(Note: unrelated error sentences still get filtered by the AI gate; the dedupe pass alone doesn't guarantee same-stem — that is why Step 6 exists.)

- [ ] **Step 5: AI validation gate** — add a local async helper + call it in the publish pass right before persist (~:1093), on the rows built this run whose `exercise_type` is an MCQ type:

```ts
const AI_GATE_MODEL = () => Deno.env.get('AI_MODEL_NAME') || 'deepseek/deepseek-chat';
const AI_GATE_FALLBACK_MODEL = () => Deno.env.get('FALLBACK_MODEL_NAME') || 'qwen/qwen3-235b-a22b';

async function aiValidateItems(items: { idx: number; prompt: string; options: string[]; correct_index: number }[]): Promise<Map<number, boolean> | null> {
  const key = Deno.env.get('AI_API_KEY');
  if (!key || items.length === 0) return null;
  const payload = items.map((it) => ({ i: it.idx, question: it.prompt, options: it.options, correct: it.correct_index }));
  const body = {
    model: AI_GATE_MODEL(),
    messages: [
      { role: 'system', content: 'You are an ESL exam QA checker. For each question decide if EXACTLY ONE option is a correct answer and every other option is clearly wrong for a 6-12 year old English learner. Reply with STRICT JSON only: {"verdicts":[{"i":<id>,"ok":true|false}]}. ok=false when more than one option could be correct, the question is unanswerable, options are identical/nonsense, or the correct option is wrong.' },
      { role: 'user', content: JSON.stringify({ questions: payload }) },
    ],
    max_tokens: 4000,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`gate ${res.status}`);
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content || '');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('gate no-json');
    const parsed = JSON.parse(match[0]);
    const out = new Map<number, boolean>();
    for (const v of parsed?.verdicts || []) if (typeof v?.i === 'number') out.set(v.i, v.ok !== false);
    return out;
  } catch {
    return null; // non-fatal — deterministic fallback applies
  } finally {
    clearTimeout(timer);
  }
}
```

Call site (before the retire-and-insert block): build the item list (prompt = `sentence_with_blank || sentence || prompt_sentence || word/meaning per type`; options = each option's `text || label`), run the gate; if it returns a map → drop rows whose verdict is `false`; if it returned null (AI failed) → drop rows whose content carried `needs_ai_check`. Strip `needs_ai_check` from content before persist. Log: `console.log('[quality-gate] kept X/Y (dropped A ambiguous, B fallback)')` and warn if dropped > 30% (`console.warn('[quality-gate] >30% dropped — consider re-enriching this unit')`).

- [ ] **Step 6: enrich-unit prompt tightening** — at the two confusables prompt sites (:581, :656-657), extend the field instruction to: `"confusables": ["ONE word or short phrase that would be GRAMMATICALLY WRONG in this word's example sentence — never two alternatives joined by 'vs' or 'or'"]` and add to the rules line: `The example sentence must be true for THIS word and false for every confusable.`

- [ ] **Step 7: Function sweep** — `npx tsc --noEmit --noResolve` over `supabase/functions/` (0 signal errors) + repo gauntlet (tsc/vitest/build).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/generate-exercises/index.ts supabase/functions/enrich-unit/index.ts
git commit -m "feat(generation): quality rebuild — sanitized cloze distractors, real-grammar same-stem grammar options, LISTEN_SELECT all-image gate, batched AI validation (region-safe, non-fatal) (owner 2026-09-14)"
```

---

### Task 9: Deploy, regenerate the owner's test unit, verify, document

**Files:**
- Modify (docs only): `docs/audit/student-app-v3/_INDEX.md` (changelog), `docs/audit/student-app-v3/{05,07,09,11,12,13}-*.md` (§7 implementation notes for each fix)

- [ ] **Step 1: Deploy edge functions** (they never auto-deploy):

```bash
npx supabase functions deploy generate-exercises enrich-unit --project-ref xsdnzijketjnzhakqtit --no-verify-jwt
```

Verify per AGENTS.md §8: `curl -s -o /dev/null -w '%{http_code}' -X POST https://xsdnzijketjnzhakqtit.supabase.co/functions/v1/generate-exercises -H 'apikey: <anon>'` → expect 401 (not 404).

- [ ] **Step 2: Push client** — `git push origin master` → Vercel auto-deploys → verify `curl -sI https://professor-ruby.vercel.app/student` `last-modified` is fresh.

- [ ] **Step 3: Regenerate Unit 2 only** (owner decision: units he tests). Trigger a generate-exercises run for unit `7e50177c` — prefer the app's own path (Unit Studio → Generate exercises) signed in as the pipeline teacher; if a headless path is needed, follow the `scripts/testing/content-groups-backfill.ts` precedent (service-role key from `.env.local`, direct function invocation). Watch the function logs for the `[quality-gate] kept X/Y` line.

- [ ] **Step 4: DB verification** (Supabase MCP / Management API SQL):

```sql
-- zero vs-joined options remain for the unit
select count(*) from pool_items where unit_id = '7e50177c' and content::text ilike '% vs %';
-- every MCQ item's options are pairwise normalized-distinct (spot list first)
select id, exercise_type, content->'options' from pool_items
 where unit_id = '7e50177c' and exercise_type in ('SPELL_CLOZE','ERROR_SPOT','GRAMMAR_FILL') limit 20;
```

Manually spot-read the listed items: SPELL_CLOZE distractors must not be interchangeable in-sentence; GRAMMAR_FILL options must share one stem; no "Yous"/"Ewing"-class non-words.

- [ ] **Step 5: Update audit docs** — add §7 implementation notes to files 05/07/09/11/12/13 (one line each: what changed, file refs) and append the `_INDEX.md` changelog entry for 2026-09-14 (batch summary + owner decisions + parked items: Word-Search teacher difficulty knob, fleet regen, Phase-2 story/comic design round with his verbatim direction).

- [ ] **Step 6: Commit docs**

```bash
git add docs/audit/student-app-v3/_INDEX.md docs/audit/student-app-v3/05-story-stage.md docs/audit/student-app-v3/07-speed-quiz.md docs/audit/student-app-v3/09-word-search-step.md docs/audit/student-app-v3/11-spelling-bee-step.md docs/audit/student-app-v3/12-exercise-battery.md docs/audit/student-app-v3/13-choice-exercise.md
git commit -m "docs(audit): session-2 batch — §2 verbatim + §3 addenda + §7 implementation notes, _INDEX changelog (owner 2026-09-14)"
```

- [ ] **Step 7: Report to owner** — plain-English per-game summary + FRESH-TAB / hard-refresh reminder (PWA keeps old code in open tabs), and note Phase 2 (story + comic immersive exercises) starts its design round next.

---

## Self-review (done at write time)

- Spec coverage: ambiguous cloze → T7/T8; grammar garbage → T7/T8; card leak → T5 (+T8 Step 2 source gate); Word Search → T1/T2; Spelling Bee → T3/T4; story → T6; regen scope + verification → T9; Phase-2 story/comic design round → recorded in spec + T9 Step 5 docs (design round itself is post-approval, out of this plan's code tasks by design).
- Type consistency: `schedulePresentBeat`, `submitLine`, `dedupeDistinct`/`grammarMutations`/`sanitizeConfusables`/`normalizeForDedupe`, `needs_ai_check` used consistently across tasks; `unitVocabRows` in T8 Step 1 names the in-scope vocab array — the executor binds it to the actual variable in `buildVocabItems` (siblingWords' source).
- Placeholders: none; every code step carries real code; the two "adapt to the real shape/type" spots (T3 fixture fields, T8 sibling-array name) are bounded reads of named files, not deferred work.
