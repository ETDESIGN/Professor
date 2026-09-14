# Live Board Fixed 16:9 Stage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the classroom board a fixed 1280×720 logical stage that uniformly scales to any viewport (projector, laptop, iPad, iPhone), with the Commander preview as a true replica.

**Architecture:** One new `BoardStage` component (ResizeObserver + CSS transform + container queries) wraps a new shared `BoardCanvas` content tree, used by both `/board` and the Commander preview. Board templates are swept clean of all viewport-keyed CSS (phone-floor media queries, Tailwind responsive prefixes, `vh/vw/vmin` units, `window.innerWidth`) so the stage is the only sizing context.

**Tech Stack:** React 18 + TypeScript, Tailwind 3, framer-motion, vitest + @testing-library/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md` (read it first).

## Global Constraints

- All commands run from the repo root (`professor-0.1 (1)/`) — use the shell workdir, never `cd`.
- **Frontend-only**: no changes under `supabase/`, no migrations, no edge deploys. Deploy = push to `master` (Vercel auto-deploys; owner confirms before push — Task 11).
- The working tree contains intentional uncommitted files (`.gitignore`, `AGENTS.md`, `docs/audit/…`, `scripts/testing/.owner-*` etc.) — **stage only the exact files each task lists**; never `git add -A` / `git add .`.
- Full gates before any commit that touches code: `npm run lint` (repo-wide `tsc --noEmit`) and `npm run test` (vitest, 680+ tests — zero regressions).
- At viewport 1280×720 the stage computes scale 1.0 and is a no-op: existing desktop appearance and e2e behavior must stay identical.
- Shared components used by the responsive **student app** (`components/games/spellingBee/SpellingBeeStage.tsx`) keep their responsive CSS — they get a `fixedStage` prop instead (Task 9). Never blanket-edit shared student-app files.
- Do not touch the Commander's own layout/controls (header, sidebar, command deck) or `/remote` — only the preview picture inside the Commander (Task 3).
- House rule for comments: state constraints the code can't show; no changelog-style comments.

---

### Task 1: `BoardStage` component (the scaling primitive)

**Files:**
- Create: `components/shared/BoardStage.tsx`
- Test: `test/boardStage.test.tsx`

**Interfaces:**
- Produces: `export const STAGE_W = 1280`, `export const STAGE_H = 720`, `export const stageScale = (cw: number, ch: number) => number`, `export default BoardStage: React.FC<{ children: React.ReactNode; className?: string }>`. Later tasks import `BoardStage` from `../../components/shared/BoardStage` (board) / `../../../../components/shared/BoardStage` (commander panels).

- [ ] **Step 1: Write the failing tests**

Create `test/boardStage.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BoardStage, { stageScale, STAGE_W, STAGE_H } from '../components/shared/BoardStage';

// jsdom has no ResizeObserver — capture instances so tests can fire entries.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  static callback!: (entries: { contentRect: { width: number; height: number } }[]) => void;
  constructor(cb: (entries: any[]) => void) {
    MockResizeObserver.callback = cb;
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

describe('stageScale (pure math)', () => {
  it('is exactly 1.0 at the design point 1280×720', () => {
    expect(stageScale(1280, 720)).toBe(1);
  });
  it('letterboxes an iPad-mini landscape viewport (width-bound)', () => {
    expect(stageScale(1133, 744)).toBeCloseTo(1133 / 1280, 5);
  });
  it('is height-bound on an iPhone landscape viewport', () => {
    expect(stageScale(844, 390)).toBeCloseTo(390 / 720, 5);
  });
  it('is width-bound on a portrait phone', () => {
    expect(stageScale(390, 844)).toBeCloseTo(390 / 1280, 5);
  });
  it('upscales on a 1080p projector', () => {
    expect(stageScale(1920, 1080)).toBeCloseTo(1.5, 5);
  });
});

describe('BoardStage (component)', () => {
  it('renders a 1280×720 inner stage scaled to the measured container', async () => {
    const { container } = render(
      <BoardStage>
        <div>game</div>
      </BoardStage>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const stage = outer.firstElementChild as HTMLElement;

    // Measure path 1: the layout-effect sync measure via clientWidth stubs.
    const widthSpy = vi.spyOn(outer, 'clientWidth', 'get').mockReturnValue(744);
    const heightSpy = vi.spyOn(outer, 'clientHeight', 'get').mockReturnValue(1133);
    // Measure path 2: a later ResizeObserver notification (URL bar etc.).
    MockResizeObserver.callback([{ contentRect: { width: 744, height: 1133 } }]);

    await waitFor(() => {
      expect(stage.style.width).toBe(`${STAGE_W}px`);
      expect(stage.style.height).toBe(`${STAGE_H}px`);
      expect(stage.style.transform).toBe(`scale(${744 / 1280})`);
      expect(stage.style.getPropertyValue('--stage-scale')).toBe(`${744 / 1280}`);
      expect(stage.style.getPropertyValue('container-type')).toBe('size');
    });
    widthSpy.mockRestore();
    heightSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/boardStage.test.tsx`
Expected: FAIL — `Cannot find module '../components/shared/BoardStage'`.

- [ ] **Step 3: Implement `BoardStage`**

Create `components/shared/BoardStage.tsx`:

```tsx
// BoardStage — the classroom board's fixed 1280×720 logical stage, uniformly
// scaled to fit whatever container it is mounted in (projector window, iPad
// mirror, Commander preview). One composition everywhere: content inside is
// laid out at exactly STAGE_W×STAGE_H CSS px and never reflows. The inner
// div is a named size container, so container queries / cqw / cqh inside the
// stage evaluate deterministically at 1280×720 on every device.
// Spec: docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md

import React, { useLayoutEffect, useRef, useState } from 'react';

export const STAGE_W = 1280;
export const STAGE_H = 720;

/** Uniform scale that fits the stage inside a cw×ch container (no cap — a
 *  1080p projector renders at 1.5 and transform-scaled text stays crisp). */
export const stageScale = (cw: number, ch: number): number =>
  Math.min(cw / STAGE_W, ch / STAGE_H);

interface BoardStageProps {
  children: React.ReactNode;
  className?: string;
}

const BoardStage: React.FC<BoardStageProps> = ({ children, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw > 0 && ch > 0) setK(stageScale(cw, ch));
    };
    measure(); // before first paint — no unscaled flash
    const ro = new ResizeObserver(measure); // covers iOS dynamic viewport
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-black flex items-center justify-center ${className}`}
    >
      <div
        className="relative shrink-0"
        style={
          {
            width: STAGE_W,
            height: STAGE_H,
            transform: `scale(${k})`,
            transformOrigin: 'center center',
            'container-type': 'size',
            'container-name': 'stage',
            '--stage-scale': String(k),
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
};

export default BoardStage;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/boardStage.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Full gates + commit**

Run: `npm run lint && npm run test`
Expected: tsc clean, full vitest suite green.

```bash
git add components/shared/BoardStage.tsx test/boardStage.test.tsx
git commit -m "feat(board): BoardStage — fixed 1280x720 scale-to-fit stage primitive"
```

---

### Task 2: `BoardCanvas` extraction + `/board` on the stage + portrait hint

**Files:**
- Create: `apps/board/BoardCanvas.tsx`
- Modify: `apps/board/ClassroomBoard.tsx` (full rewrite of the render path)
- Test: `test/boardCanvas.test.tsx`

**Interfaces:**
- Consumes: `BoardStage` from Task 1.
- Produces: `export default BoardCanvas: React.FC<{}>` — renders the entire board content tree (overlays + `BoardShell` + current game) and reads everything from `useSession()`. No props; mounted inside a `BoardStage` by consumers.

- [ ] **Step 1: Write the failing test**

Create `test/boardCanvas.test.tsx` (mock pattern follows `test/BoardComponents.test.tsx`):

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import BoardCanvas from '../apps/board/BoardCanvas';

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({
    state: {
      status: 'LIVE',
      currentStepIndex: 0,
      activeSlideData: { type: 'FOCUS_CARDS', phase: 'INPUT', data: { words: [] } },
      activeUnit: { flow: [{ type: 'FOCUS_CARDS' }] },
      students: [
        { id: 's1', name: 'Alice', points: 100, avatar: '' },
        { id: 's2', name: 'Bob', points: 50, avatar: '' },
      ],
      isConnected: true,
      liveSnapImage: null,
      drawings: [],
      confettiTrigger: 0,
      activeOverlay: 'NONE',
      quickWheelWinner: null,
    },
  }),
}));

describe('BoardCanvas', () => {
  it('renders the shell frame and is stage-shaped (fills its parent)', () => {
    const { container, getByText } = render(<BoardCanvas />);
    expect(getByText('🏆 Leaderboard')).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('absolute inset-0');
  });
});
```

Run: `npx vitest run test/boardCanvas.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Create `BoardCanvas`**

Create `apps/board/BoardCanvas.tsx` — the content is moved **verbatim** from `ClassroomBoard.tsx:86-131` (everything inside the old `aspect-video` box), re-homed under an `absolute inset-0` root:

```tsx
// BoardCanvas — the board's entire content tree (overlays + BoardShell +
// current game), rendered inside a BoardStage by BOTH consumers: /board
// (ClassroomBoard) and the Commander preview. One tree ⇒ the Commander
// preview is a true replica of the projector at identical 1280×720 scale.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../store/SessionContext';
import ConfettiSystem from '../../components/effects/ConfettiSystem';
import DrawingLayer from '../../components/shared/DrawingLayer';
import { BOARD_MAP } from './templates/boardMap';
import BoardOverlayLayer from './templates/BoardOverlayLayer';
import ClassWeakBanner from './ClassWeakBanner';
import ClassLeaderboard from './ClassLeaderboard';
import BoardShell from './BoardShell';

const BoardCanvas: React.FC = () => {
  const { state } = useSession();
  const currentStep = state.activeSlideData;
  const phase = (currentStep as any)?.phase || '';

  return (
    <div className="absolute inset-0 overflow-hidden">
      <ConfettiSystem />
      <DrawingLayer isInteractive={false} className="pointer-events-none z-[60]" />
      <BoardOverlayLayer />
      {(phase === 'PRACTICE' || phase === 'ASSESS') && <ClassWeakBanner />}
      {state.activeOverlay === 'LEADERBOARD' && <ClassLeaderboard />}

      {state.liveSnapImage && (
        <div className="absolute inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-12 animate-fade-in">
          <div className="absolute top-8 left-8 flex items-center gap-4 text-white">
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
            <span className="font-bold tracking-widest uppercase">Live Camera Feed</span>
          </div>
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-[2rem] shadow-2xl overflow-hidden border-8 border-white/20">
            <img src={state.liveSnapImage} className="w-full h-full object-contain" alt="Live Snap" />
          </div>
        </div>
      )}

      <BoardShell>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${currentStep?.type}-${state.currentStepIndex}`}
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.98, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {(() => {
              if (!currentStep) return null;
              const BoardComponent = BOARD_MAP[currentStep.type];
              if (!BoardComponent) return null;
              if (currentStep.type === 'UNIT_SELECTION') return <BoardComponent />;
              return <BoardComponent data={currentStep.data} />;
            })()}
          </motion.div>
        </AnimatePresence>
      </BoardShell>
    </div>
  );
};

export default BoardCanvas;
```

- [ ] **Step 3: Rewrite `ClassroomBoard.tsx`**

Replace the whole file with (guards kept, dead code dropped — `timeString`/`Clock`/`progressPercent`/`PHASE_META`/`phaseMeta`/`currentTime` were computed but never rendered; verify with `grep -n "timeString\|progressPercent\|phaseMeta" apps/board/ClassroomBoard.tsx` before deleting, they must have zero JSX usages):

```tsx
import React, { useState, useEffect } from 'react';
import { useSession } from '../../store/SessionContext';
import { WifiOff } from 'lucide-react';
import BoardStage from '../../components/shared/BoardStage';
import BoardCanvas from './BoardCanvas';

const ClassroomBoard: React.FC = () => {
  const { state } = useSession();

  // Portrait phones/tablets: the 16:9 stage letterboxes into a thin strip.
  // Nudge the teacher to rotate (dismissible — the stage still renders).
  const [portrait, setPortrait] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(orientation: portrait)').matches,
  );
  const [hintDismissed, setHintDismissed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = (e: MediaQueryListEvent) => setPortrait(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // FIXPLAN E1.8: the gate requires BOTH channels — the broadcast bus
  // (isConnected) AND the classroom_sessions postgres_changes channel that
  // actually carries slide position (sessionSyncHealthy).
  if (!state.isConnected || !state.sessionSyncHealthy) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center border-4 border-red-500/50 relative z-10">
            <WifiOff size={40} className="text-red-500" />
          </div>
        </div>
        <h1 className="text-6xl font-mono tracking-tighter mb-4 font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-500">NO SIGNAL</h1>
        <div className="bg-slate-900 px-6 py-3 rounded-xl border border-slate-800 font-mono text-xl text-slate-400">
          Waiting for Teacher Connection...
        </div>
        <p className="mt-8 text-slate-600 font-mono text-sm">Waiting for connection...</p>
      </div>
    );
  }

  if (!state.activeSlideData) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center text-white font-mono">
        Initializing Session...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black relative">
      <BoardStage>
        <BoardCanvas />
      </BoardStage>
      {portrait && !hintDismissed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[110] bg-slate-900/90 backdrop-blur border border-white/15 rounded-full px-5 py-2.5 flex items-center gap-3 text-white text-sm font-semibold shadow-2xl">
          <span className="inline-block animate-pulse">⟳</span>
          Rotate for the big classroom view
          <button onClick={() => setHintDismissed(true)} className="text-slate-400 hover:text-white font-bold" aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
};

export default ClassroomBoard;
```

Note: `state.activeSlideData` replaces the local `currentStep` variable the old file had; the empty-flow/“no lesson flow” UI lives in the Commander (`LiveCommander.tsx:130-154`), not here — the board only ever shows Initializing.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/boardCanvas.test.tsx test/BoardComponents.test.tsx`
Expected: PASS (BoardComponents must stay green — it imports templates, which are untouched so far).

- [ ] **Step 5: Manual visual parity check**

Run `npx vite --port 5173`, open `http://localhost:5173/board` (it will show NO SIGNAL without a session — that's expected; verify the guard screens still fill the window with no scrollbars). Then resize the window: confirm nothing overflows horizontally at any size (guards use `h-screen w-screen`).

- [ ] **Step 6: Full gates + commit**

Run: `npm run lint && npm run test`

```bash
git add apps/board/BoardCanvas.tsx apps/board/ClassroomBoard.tsx test/boardCanvas.test.tsx
git commit -m "feat(board): /board renders inside the fixed BoardStage (16:9 letterbox) + portrait rotate hint"
```

---

### Task 3: Commander preview → true replica

**Files:**
- Modify: `apps/teacher/LiveCommander.tsx:355-380` (the preview monitor block)
- Delete (conditionally): `apps/teacher/live/panels/BoardRenderer.tsx`
- Modify: `docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md` (one cosmetic-detail amendment)

**Interfaces:**
- Consumes: `BoardStage` (Task 1), `BoardCanvas` (Task 2).
- Produces: nothing consumed later.

- [ ] **Step 1: Verify `BoardRenderer` consumers**

Run: `grep -rn "BoardRenderer" --include="*.tsx" --include="*.ts" apps/ components/ test/ e2e/ | grep -v "panels/BoardRenderer.tsx"`
Expected: only `apps/teacher/LiveCommander.tsx`. If other consumers exist, do NOT delete the file — leave it and note it in the commit message.

- [ ] **Step 2: Swap the preview block**

In `apps/teacher/LiveCommander.tsx`, replace the preview monitor's inner content. Current (lines ~355-363):

```tsx
                  <div className="w-full max-w-5xl aspect-video bg-black rounded-xl shadow-2xl border border-slate-800 relative overflow-hidden group">
                     <DrawingLayer isInteractive={isDrawingMode} color={drawingColor} className="z-20" />
                     <div className="absolute inset-0 overflow-hidden z-10 pointer-events-auto select-none">
                        <div className="w-[200%] h-[200%] origin-top-left transform scale-50">
                           <ErrorBoundary>
                              <BoardRenderer currentStep={currentStep} />
                           </ErrorBoundary>
                        </div>
                     </div>
```

becomes:

```tsx
                  <div className="w-full max-w-5xl aspect-video bg-black rounded-xl shadow-2xl border border-slate-800 relative overflow-hidden group">
                     {/* True replica: the exact BoardStage + BoardCanvas tree the
                         projector renders — preview scale === projector scale. */}
                     <div className="absolute inset-0 z-10">
                        <ErrorBoundary>
                           <BoardStage>
                              <BoardCanvas />
                           </BoardStage>
                        </ErrorBoundary>
                     </div>
                     <DrawingLayer isInteractive={isDrawingMode} color={drawingColor} className="z-20" />
```

The LIVE/PEN badges and pen/color controls that follow stay exactly where they are (they are siblings above, `z-30`). Update imports: remove `import { BoardRenderer } from './live/panels/BoardRenderer';`, add:

```tsx
import BoardStage from '../../components/shared/BoardStage';
import BoardCanvas from '../board/BoardCanvas';
```

Delete `apps/teacher/live/panels/BoardRenderer.tsx` if Step 1 confirmed the single consumer.

Rationale kept in code comment only if needed — no changelog comments.

- [ ] **Step 3: Amend the spec's stroke-width cosmetic line**

In `docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md` §3, replace the sentence starting `One cosmetic detail: multiply the overlay's strokeWidth…` with:

```
Pen-width note (decided at implementation): both layers draw the same ratio-based strokes, so they coincide exactly. The Commander's overlay stroke renders at viewport px while the replica's renders scale-multiplied — the same harmless difference that exists between the two surfaces today, so `DrawingLayer` is deliberately left untouched.
```

- [ ] **Step 4: Full gates + manual check**

Run: `npm run lint && npm run test`
Manual: `npx vite --port 5173`, open `/teacher.html`, enter a live session, confirm the preview now shows the leaderboard rail + whose-turn footer + phase badge around the game (the replica), pen drawing still lands where you draw, badges/pen controls still on top.

- [ ] **Step 5: Commit**

```bash
git add apps/teacher/LiveCommander.tsx apps/teacher/live/panels/BoardRenderer.tsx docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md
git commit -m "feat(commander): preview is a true replica — same BoardStage/BoardCanvas as the projector (replaces the 200%/scale-50 hack)"
```

---

### Task 4: `ConfettiSystem` — size from container, not window

**Files:**
- Modify: `components/effects/ConfettiSystem.tsx`

**Interfaces:** none (self-contained; consumers unchanged).

- [ ] **Step 1: Replace window sizing with container sizing**

The canvas is `absolute inset-0` inside the stage, so its `parentElement` is the 1280×720 stage div. Replace the two window-based sizing sites:

In `spawnConfetti` (lines 35-38), replace:

```ts
    if (canvas.width < window.innerWidth * 0.5 || canvas.height < window.innerHeight * 0.5) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
```

with:

```ts
    const host = canvas.parentElement;
    if (host && (canvas.width < host.clientWidth * 0.5 || canvas.height < host.clientHeight * 0.5)) {
      canvas.width = host.clientWidth;
      canvas.height = host.clientHeight;
    }
```

In the mount effect (lines 71-76), replace:

```ts
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();
```

with:

```ts
    const host = canvas.parentElement;
    const resize = () => {
      if (!host) return;
      canvas.width = host.clientWidth;
      canvas.height = host.clientHeight;
    };
    const ro = new ResizeObserver(resize);
    if (host) ro.observe(host);
    resize();
```

and in the cleanup (line 111-114) replace `window.removeEventListener('resize', resize);` with `ro.disconnect();`. Keep the WS #8 mount-order comments — they still apply.

- [ ] **Step 2: Gates + manual burst + commit**

Run: `npm run lint && npm run test`
Manual (same dev session as Task 3): award points until confetti fires — burst must fill the preview/stage, not a 300×150 corner.

```bash
git add components/effects/ConfettiSystem.tsx
git commit -m "fix(board): confetti canvas sizes from its stage container, not the browser window"
```

---

### Task 5: `ClassLeaderboard` overlay scrolls instead of clipping

**Files:**
- Modify: `apps/board/ClassLeaderboard.tsx:36`
- Test: extend `test/boardCanvas.test.tsx`

- [ ] **Step 1: Write the failing assertion**

Restructure `test/boardCanvas.test.tsx` so the session mock returns a mutable state object (single `vi.mock` factory), then add the ClassLeaderboard test. Full file shape:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import BoardCanvas from '../apps/board/BoardCanvas';
import ClassLeaderboard from '../apps/board/ClassLeaderboard';

const mockState: any = {
  status: 'LIVE',
  currentStepIndex: 0,
  activeSlideData: { type: 'FOCUS_CARDS', phase: 'INPUT', data: { words: [] } },
  activeUnit: { flow: [{ type: 'FOCUS_CARDS' }] },
  students: [
    { id: 's1', name: 'Alice', points: 100, avatar: '' },
    { id: 's2', name: 'Bob', points: 50, avatar: '' },
  ],
  isConnected: true,
  liveSnapImage: null,
  drawings: [],
  confettiTrigger: 0,
  activeOverlay: 'NONE',
  quickWheelWinner: null,
};

vi.mock('../store/SessionContext', () => ({
  useSession: () => ({ state: mockState }),
}));

describe('BoardCanvas', () => {
  it('renders the shell frame and is stage-shaped (fills its parent)', () => {
    const { container, getByText } = render(<BoardCanvas />);
    expect(getByText('🏆 Leaderboard')).toBeTruthy();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('absolute inset-0');
  });
});

describe('ClassLeaderboard overlay', () => {
  it('caps and scrolls long rosters inside the stage', () => {
    mockState.students = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`, name: `Student ${i}`, points: 100 - i, avatar: '',
    }));
    try {
      const { container } = render(<ClassLeaderboard />);
      const list = container.querySelector('.space-y-2') as HTMLElement;
      expect(list.className).toContain('max-h-[');
      expect(list.className).toContain('overflow-y-auto');
    } finally {
      mockState.students = [
        { id: 's1', name: 'Alice', points: 100, avatar: '' },
        { id: 's2', name: 'Bob', points: 50, avatar: '' },
      ];
    }
  });
});
```

(This replaces the Task 2 version of the file — the mock factory is the only structural change to the earlier test.)

- [ ] **Step 2: Run — expect FAIL** (`max-h-` / `overflow-y-auto` absent).

Run: `npx vitest run test/boardCanvas.test.tsx`

- [ ] **Step 3: Fix `ClassLeaderboard.tsx:36`**

Change:

```tsx
      <div className="w-full max-w-2xl space-y-2">
```

to:

```tsx
      <div className="w-full max-w-2xl space-y-2 max-h-[520px] overflow-y-auto pr-2">
```

(720px stage − ~90px title − ~60px footer hint − padding ⇒ 520px of list; `pr-2` keeps the scrollbar off the cards.)

- [ ] **Step 4: Pass + gates + commit**

Run: `npx vitest run test/boardCanvas.test.tsx && npm run lint && npm run test`

```bash
git add apps/board/ClassLeaderboard.tsx test/boardCanvas.test.tsx
git commit -m "fix(board): leaderboard overlay scrolls long rosters instead of clipping off-stage"
```

---

### Task 6: Viewport-unit replacements (4 files, 6 sites)

**Files:**
- Modify: `apps/board/templates/QuickWheelOverlay.tsx:226,264,388`
- Modify: `apps/board/templates/BoardMediaPlayer.tsx:255`
- Modify: `apps/board/templates/BoardWhatsMissing.tsx:819,858`
- Modify: `apps/board/templates/BoardDialogueStage.tsx:586`

**Interfaces:** none.

The stage is always 1280×720, so every viewport unit becomes the px value it was meant to cap at. Make exactly these edits (leave each file's responsive *prefixes* for Tasks 8a-8e — except `QuickWheelOverlay.tsx:391`'s `md:p-9`, which sits on an edited line, so collapse it here):

- [ ] **Step 1: Edit `QuickWheelOverlay.tsx`**

- Line 226: `className="relative w-[min(94vw,860px)] rounded-[32px]…"` → `className="relative w-[860px] rounded-[32px]…"`
- Line 264: `style={{ width: 'min(56vmin, 480px)', height: 'min(56vmin, 480px)' }}` → `style={{ width: '480px', height: '480px' }}`
- Line 388: `className="relative w-[min(92vw,720px)] rounded-3xl px-6 py-7 md:p-9 …"` → `className="relative w-[720px] rounded-3xl p-9 …"`

- [ ] **Step 2: Edit `BoardMediaPlayer.tsx:255`**

`max-h-[calc(100vh-100px)]` → `max-h-full` (the shell's center section already constrains height; the calc was compensating for a viewport that no longer sizes the layout).

- [ ] **Step 3: Edit `BoardWhatsMissing.tsx:819,858`**

- `max-h-[70vh]` → `max-h-[504px]`
- `max-h-[55vh]` → `max-h-[396px]`

- [ ] **Step 4: Edit `BoardDialogueStage.tsx:586`**

`max-h-[60vh]` → `max-h-[432px]`

- [ ] **Step 5: Gates + commit**

Run: `npm run lint && npm run test`

```bash
git add apps/board/templates/QuickWheelOverlay.tsx apps/board/templates/BoardMediaPlayer.tsx apps/board/templates/BoardWhatsMissing.tsx apps/board/templates/BoardDialogueStage.tsx
git commit -m "fix(board): replace viewport units with stage px (wheel overlay, media player, whats-missing, dialogue)"
```

---

### Task 7: Remove the phone-floor media queries (18 board files)

**Files (from `grep -rln "max-height:450\|max-height: 450" apps/board/`):**
`apps/board/templates/`: `BoardTeamBattle.tsx`, `BoardSentenceLab.tsx`, `BoardVocabBlitz.tsx`, `BoardMemoryLab.tsx`, `BoardPhonicsArena.tsx`, `BoardSoundLab.tsx`, `BoardFlashMatch.tsx`, `BoardGrammarLab.tsx`, `BoardStoryQuest.tsx`, `BoardListenTap.tsx`, `BoardUnscramble.tsx`, `BoardComicPanels.tsx`, `BoardGrammarForge.tsx`, `BoardClassRally.tsx`, `BoardWhatsMissing.tsx`, `BoardISayYouSay.tsx`, `BoardWordDetective.tsx`, `BoardFastVocab.tsx`.
**NOT touched here:** `components/games/spellingBee/SpellingBeeStage.tsx` (shared with the responsive student app — Task 9 handles it).

**Interfaces:** none.

- [ ] **Step 1: Enumerate every floor site**

Run: `grep -rn "max-height:450\|max-height: 450" apps/board/`
Expected: matches in exactly the 18 files above. Two forms exist: (a) `<style>` blocks containing `@media (max-height: 450px) { … }` — delete the entire `@media` block, keep the rest of the `<style>`; (b) Tailwind arbitrary variants like `[@media(max-height:450px)]:hidden` — delete the whole class token (the variant and its utility), leaving other tokens intact.

- [ ] **Step 2: Remove them all, file by file**

Read each match's surrounding block before deleting — the floor is a compact-mode override; the base styles above it stay untouched. Example (`BoardTeamBattle.tsx:503` region): the `<style>` block keeps its non-media rules, the `@media (max-height: 450px) { … }` block goes.

- [ ] **Step 3: Verify zero remain**

Run: `grep -rn "max-height:450\|max-height: 450" apps/board/`
Expected: no output (exit 1).

- [ ] **Step 4: Gates + commit**

Run: `npm run lint && npm run test`

```bash
git add apps/board/templates/
git commit -m "refactor(board): remove phone-floor media queries — the fixed stage makes viewport-keyed compact modes incoherent"
```

---

### Task 8a-8e: Collapse responsive Tailwind prefixes to the desktop branch

**The rule (identical for every file):** inside `apps/board/**`, a Tailwind responsive prefix (`sm:` / `md:` / `lg:` / `xl:` / `2xl:`) is replaced by its value at the largest breakpoint — because the stage always lays out at 1280×720 logical px, which is a ≥`xl` viewport for layout purposes. Concretely, for each class group:

1. Same utility at multiple sizes → keep only the largest: `pl-32 lg:pl-48` → `pl-48`; `h-36 sm:h-44 lg:h-52` → `h-52`; `gap-3 sm:gap-6` → `gap-6`; `w-40 sm:w-52 md:w-60` → `w-60`.
2. Variant-only (no base) → hoist it: `sm:w-[38%]` → `w-[38%]`; `md:min-h-[180px]` → `min-h-[180px]`; `md:col-span-6` → `col-span-6`; `xl:h-full` → `h-full`.
3. Visibility toggles → keep the desktop state: `hidden sm:flex` → `flex`; `hidden md:block` → `block`; `flex-col sm:flex-row` → `flex-row`.
4. Compound variants → drop the prefix, keep the rest: `lg:hover:scale-105` → `hover:scale-105`; `sm:rounded-3xl` → `rounded-3xl`.
5. Un-prefixed utilities in the same string are untouched (`min-w-40` in `w-40 sm:w-52 md:w-60 min-w-40` stays).
6. Do NOT touch non-responsive variants (`hover:`, `active:`, `focus:`, `group-hover:`, `disabled:`, `dark:`) or container queries (`cqw`/`cqh`, `@container`) — those are stage-relative and correct.

**Per-file done-check (run for every file you edit):** `grep -cE "\b(sm|md|lg|xl|2xl):" <file>` → `0`. (Expect a handful of false positives from words like `md:` inside comments/strings — fix or reword those too; the goal is a clean gate in Task 10.)

**Task 8a — `BoardMediaPlayer.tsx`, `BoardStoryStage.tsx`, `BoardStoryStage.ag.tsx`, `BoardWordSearch.tsx`, `QuickWheelOverlay.tsx`** (WordSearch's `xl:` row/orientation flip collapses to the `xl` = row branch; its container-query sizing stays untouched).

**Task 8b — `BoardMemoryLab.tsx`, `BoardVocabBlitz.tsx`, `BoardWordDetective.tsx`, `BoardFlashMatch.tsx`, `BoardGrammarLab.tsx`**

**Task 8c — `BoardUnscramble.tsx`, `BoardSentenceLab.tsx`, `BoardComicPanels.tsx`, `BoardStoryQuest.tsx`, `BoardClassRally.tsx`**

**Task 8d — `BoardFocusCards.tsx`, `BoardFastVocab.tsx`, `BoardGrammarForge.tsx`, `BoardISayYouSay.tsx`, `BoardPhonicsArena.tsx`**

**Task 8e — `BoardTeamBattle.tsx`, `BoardSpellingBee.tsx`, `BoardSoundLab.tsx`, `BoardListenTap.tsx`, `BoardSpeedQuiz.tsx`, `BoardWhatsMissing.tsx`**

For each of 8a-8e:

- [ ] **Step 1: Apply the rule to every responsive prefix in the task's files** (find them with `grep -nE "\b(sm|md|lg|xl|2xl):" <file>` per file).
- [ ] **Step 2: Verify per-file counts are 0** (command above).
- [ ] **Step 3: Gates:** `npm run lint && npm run test` — `test/BoardComponents.test.tsx` renders several of these templates and must stay green (it asserts behavior, not breakpoints).
- [ ] **Step 4: Commit:**

```bash
git add apps/board/templates/
git commit -m "refactor(board): collapse responsive prefixes to desktop values — stage is always 1280x720 (<task id>)"
```

---

### Task 9: `SpellingBeeStage` — `fixedStage` prop (board truth, student untouched)

**Files:**
- Modify: `components/games/spellingBee/SpellingBeeStage.tsx`
- Modify: `apps/board/templates/BoardSpellingBee.tsx` (pass the prop)
- Test: `test/spellingBeeStage.test.tsx`

**Interfaces:**
- Produces: `SpellingBeeStageProps.fixedStage?: boolean` — when true the component uses the fixed 1280×720 classes (the current `md:`/desktop values) instead of responsive ones. Student-app callers (`apps/student/SpellingBeeGame.tsx`, `apps/student/steps/SpellingBeeStep.tsx`) do NOT pass it — verify with `grep -rn "SpellingBeeStage" apps/student/`.

- [ ] **Step 1: Write the failing test**

Create `test/spellingBeeStage.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import SpellingBeeStage from '../components/games/spellingBee/SpellingBeeStage';

const word = {
  word: 'cat', letters: 'cat', meaning: 'a pet', imageUrl: null,
} as any;

const base = {
  word, typedCount: 0, wrongLetter: null, removedKeys: new Set<string>(),
  hintKey: null, status: 'typing' as const, onReady: () => {}, onType: () => {},
  onReplayAudio: () => {},
};

describe('SpellingBeeStage fixedStage', () => {
  it('board mode uses fixed desktop slot/keyboard sizes (no responsive prefixes)', () => {
    const { container } = render(<SpellingBeeStage {...base} fixedStage />);
    const html = container.innerHTML;
    expect(html).toContain('w-24');
    expect(html).not.toMatch(/\b(sm|md|lg|xl):/);
  });
  it('student mode keeps its responsive classes', () => {
    const { container } = render(<SpellingBeeStage {...base} compact lightTheme />);
    expect(container.innerHTML).toMatch(/sm:/);
  });
});
```

Run: `npx vitest run test/spellingBeeStage.test.tsx` — Expected: FAIL (`w-24` only appears behind `md:`).

- [ ] **Step 2: Add the prop and branch the responsive fragments**

In `SpellingBeeStage.tsx`:
- Add to the interface: `/** Board mode: fixed 1280×720 stage classes instead of viewport-responsive ones. */ fixedStage?: boolean;` and destructure `fixedStage = false`.
- Replace the responsive fragments with `fixedStage ? <desktop> : <current>` conditionals at these exact sites (desktop value in parentheses):
  - :67 `text-sm sm:text-base` → (`text-base`)
  - :71 `hidden sm:flex …` → (`flex …`)
  - :80/:111 `col-span-12 md:col-span-6` → (`col-span-6`)
  - :112 `p-5 sm:p-6` → (`p-6`)
  - :197 `gap-2 sm:gap-3` → (`gap-3`)
  - :208 `p-2.5 sm:p-3 … h-20 sm:h-24` → (`p-3 … h-24`)
  - :265 `hidden sm:flex …` → (`flex …`)
  - :274 `hidden md:flex …` → (`flex …`)
  - :304 `gap-2 sm:gap-3 md:gap-4 my-1 sm:my-2` → (`gap-4 my-2`)
  - :309 `w-2 sm:w-4` → (`w-4`)
  - :353 slot box (non-compact branch) `w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 text-3xl sm:text-4xl md:text-5xl` → (`w-24 h-28 text-5xl`) — compact branch untouched
  - :413 `p-2 sm:p-3 rounded-2xl sm:rounded-3xl` → (`p-3 rounded-3xl`)
  - :418/:420 `gap-1.5 sm:gap-2.5` → (`gap-2.5`)
  - :428/:468 `h-12 sm:h-14 md:h-16` → (`h-16`); keyboard `rounded-xl sm:rounded-2xl` → (`rounded-2xl`)
  - :471 compact `text-xl sm:text-2xl` and non-compact `text-xl sm:text-2xl md:text-3xl` → non-compact becomes `text-3xl`; compact stays responsive
  - :512 `<style>` phone floor: leave the `@media (max-height: 450px)` block in place (student app uses it) — the board's `fixedStage` classes don't reference those class names' responsive behavior; verify the floor's selectors (`.spelling-slot-box`, `.spelling-key-btn`) still describe the compact/student surface only, and note that in a code comment if not already obvious.
- In `apps/board/templates/BoardSpellingBee.tsx`, pass `fixedStage` at the `<SpellingBeeStage …>` render site(s) (grep them; also collapse that file's own `pl-28 lg:pl-44` → `pl-44` — it belongs to Task 8e's file list, done here since the file is open).

- [ ] **Step 3: Pass + gates + commit**

Run: `npx vitest run test/spellingBeeStage.test.tsx && npm run lint && npm run test`

```bash
git add components/games/spellingBee/SpellingBeeStage.tsx apps/board/templates/BoardSpellingBee.tsx test/spellingBeeStage.test.tsx
git commit -m "feat(board): SpellingBeeStage fixedStage mode — fixed 1280x720 classes for the board, student app stays responsive"
```

---

### Task 10: Stage gate script + package.json + docs

**Files:**
- Create: `scripts/board-stage-check.mjs`
- Modify: `package.json` (scripts), `.github/workflows/ci.yml` (one step), `LIVE_GAME_LIFECYCLE.md` (new section), `/Users/ET/Documents/DEV/teacher app/AGENTS.md` (§9 row — workspace root, not in git)

- [ ] **Step 1: Create the gate script**

`scripts/board-stage-check.mjs`:

```js
#!/usr/bin/env node
// Stage gate: nothing under apps/board may key layout off the browser
// viewport. The board renders inside a fixed 1280×720 BoardStage (spec
// 2026-09-15), so viewport media queries / units / breakpoints always
// misfire there. Container queries (@container, cqw/cqh) ARE allowed —
// they evaluate against the fixed stage and are deterministic.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN = join(ROOT, 'apps', 'board');
// Shared with the responsive student app — takes fixedStage instead.
const ALLOW_FILES = [/SpellingBeeStage/i];

const RULES = [
  { name: 'responsive Tailwind prefix (sm:/md:/lg:/xl:/2xl:)', re: /["'`\s]((?:sm|md|lg|xl|2xl):[a-z[-]+)/g },
  { name: 'viewport media query (@media)', re: /@media/g },
  { name: 'viewport unit (vh/vw/vmin/vmax)', re: /[\d.]v(h|w|min|max)\b|\bv(h|min|max)\b/g },
  { name: 'window.inner* sizing', re: /innerWidth|innerHeight/g },
];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });

const violations = [];
for (const file of walk(SCAN)) {
  if (ALLOW_FILES.some((re) => re.test(file))) continue;
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/BoardStage\.tsx$/.test(file)) return; // the stage itself is clean by construction
    for (const { name, re } of RULES) {
      re.lastIndex = 0;
      if (re.test(line)) violations.push(`${rel}:${i + 1}  ${name}  →  ${line.trim().slice(0, 120)}`);
    }
  });
}

if (violations.length) {
  console.error(`✗ board stage gate: ${violations.length} viewport-keyed line(s) under apps/board/:\n`);
  console.error(violations.join('\n'));
  console.error('\nThe board renders in a fixed 1280×720 BoardStage — size in stage px or cqw/cqh. See docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md');
  process.exit(1);
}
console.log('✓ board stage gate: no viewport-keyed layout under apps/board/');
```

- [ ] **Step 2: Wire it up**

`package.json` scripts (after `"test:e2e:ui"`): `"board:stage-check": "node scripts/board-stage-check.mjs",`

`.github/workflows/ci.yml` — insert after the `Run unit tests` step:

```yaml
      - name: Board stage gate
        run: npm run board:stage-check
```

- [ ] **Step 3: Run the gate — it must be green**

Run: `npm run board:stage-check`
If violations appear (comments containing e.g. "100vh" prose, missed prefixes), fix the code or reword the comment — do not weaken the gate.

- [ ] **Step 4: Document the rule for future games**

Append to `LIVE_GAME_LIFECYCLE.md` (end of file):

```markdown
## The 1280×720 stage — sizing rules for every game (2026-09-15)

The board renders inside a fixed **1280×720 logical stage** (`components/shared/BoardStage.tsx`) that is uniformly scaled to the viewing surface. Consequences for game templates:

1. **Never key layout off the browser viewport.** No `sm:/md:/lg:/xl:` Tailwind prefixes, no `@media`, no `vh/vw/vmin/vmax`, no `window.innerWidth/innerHeight` inside `apps/board/**`. CI enforces this (`npm run board:stage-check`).
2. **Size in stage px.** The stage is always 1280×720 CSS px — design for that, like a slide. Fluid layouts within the stage (flex/grid fractions, `min-h-0`) are encouraged.
3. **Container queries are the escape hatch.** The stage is a named size container (`container-name: stage`, and `--stage-scale` is set): `cqw`/`cqh` units and `@container stage (…)` evaluate deterministically at 1280×720 on every device. BoardWordSearch is the reference implementation.
4. Shared components used by the responsive student app take a `fixedStage` prop (see SpellingBeeStage) instead of dropping their responsive CSS.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/board-stage-check.mjs package.json .github/workflows/ci.yml LIVE_GAME_LIFECYCLE.md
git commit -m "chore(board): stage gate script + CI step + stage sizing rules in LIVE_GAME_LIFECYCLE"
```

(The workspace-root `AGENTS.md` §9 row is updated at deploy time in Task 11 — it is outside the repo.)

---

### Task 11: e2e viewport smoke + full verification + deploy

**Files:**
- Create: `e2e/board-stage.spec.ts`
- Verify + push `master` (owner confirms first)

- [ ] **Step 1: Write the viewport smoke spec**

`e2e/board-stage.spec.ts` (the board shows NO SIGNAL without a session, so game-level e2e isn't reachable — the smoke still guards against document-level overflow regressions such as a stray `100vh`; the spec's game-by-game visual matrix is covered instead by the k=1 parity property, the unit tests, and the owner's hardware pass). Also amend one sentence in the spec's Testing section (`docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md`) from "For representative games … assert the stage box fits the viewport (no document overflow) and screenshot." to "Game-level visual verification is the owner hardware pass; e2e asserts document-level overflow at each viewport on the connection-gate screen." — keep spec and reality in sync:

```ts
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'ipad-mini-landscape', width: 1133, height: 744 },
  { name: 'ipad-mini-portrait', width: 744, height: 1133 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'narrow-desktop', width: 900, height: 800 },
];

for (const vp of VIEWPORTS) {
  test(`board page causes no document overflow at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/board');
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  });
}
```

- [ ] **Step 2: Full local verification battery**

Run, in order — all must pass:

```bash
npm run lint
npm run test
npm run board:stage-check
npm run build
npm run test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add e2e/board-stage.spec.ts docs/superpowers/specs/2026-09-15-board-fixed-stage-design.md
git commit -m "test(e2e): board viewport-matrix overflow smoke (iPad mini / iPhone / narrow desktop)"
```

- [ ] **Step 4: Deploy (owner checkpoint)**

Summarize the change set to the owner and get explicit go-ahead, then:

```bash
git push origin master
```

Verify the deploy per AGENTS.md §7: `curl -sI https://professor-ruby.vercel.app/board` → `last-modified` matches the deploy time.

- [ ] **Step 5: Post-deploy bookkeeping**

- Update the workspace-root `AGENTS.md` (`/Users/ET/Documents/DEV/teacher app/AGENTS.md`) §9 table with a "BOARD FIXED 16:9 STAGE SHIPPED 2026-09-15" row: one-line what/why (fixed 1280×720 BoardStage scale-to-fit; commander preview true replica; viewport CSS swept + `npm run board:stage-check` CI gate; SpellingBeeStage `fixedStage`), spec + plan paths, and the PWA note that already-open tabs get the update banner.
- Remind the owner of the one-time service-worker recovery only if they see stale behavior (AGENTS.md §8.1) and ask them to do the real hardware pass: iPad mini → projector mirror at landscape + portrait, and a desktop half-window resize across several games (GameArena, SpeedQuiz, WordSearch, TeamBattle, Story AG + points popup + quiet gauge + leaderboard overlay).
