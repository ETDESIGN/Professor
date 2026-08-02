# LIVE_GAME_LIFECYCLE.md — How to wire a board game into the pick → play → score → next loop

> **Canonical reference for adding a new game/exercise to the Live Board.**
> Read this before writing a new `Board*.tsx` template. It documents the
> contract every game must follow so the teacher's pick → play → score → next
> loop works end-to-end across the three separate browser tabs
> (commander / remote / board projector).
>
> **Status:** implemented & verified (2026-07-28). Reference games:
> `BoardFlashMatch`, `BoardSpeedQuiz`, `BoardListenTap`, `BoardUnscramble`,
> `BoardStorySequencing`, `BoardGrammarPractice`. (`BoardTeamBattle` is a
> team-vs-team exception — see §9.)

---

## 1. The mental model (read first)

The teacher runs a **live loop**, one student at a time:

```
[enter slide]   no responder picked  →  PRACTICE / choral mode (no scoring)
      ↓ teacher taps Spin (commander "Now answering" bar, remote Baton, sidebar wheel)
[WHEEL]         wheel spins ~2s, reveals the picked student
      ↓ at 2.5s the SessionContext broadcasts: GAME_WIN, NEW_TURN, DISMISS_WHEEL
[PLAY]          overlay auto-dismisses on ALL tabs; the picked student is "live"
                (whose-turn footer + commander bar persist); the GAME RESETS fresh
                for this student (NEW_TURN → currentTurnId changes)
      ↓ student attempts the exercise
[SCORE]         wrong attempt  → addPoints(picked, −5) + mistake++
                success        → addPoints(picked, scoreForAttempt(mistakes))
                                + personalized "[Name] nailed it! +N pts"
      ↓ teacher taps "Next Student →"
[NEXT]          CLEAR_RESPONDER + auto-spin → back to [WHEEL] for the next kid
```

**The single rule that makes this work:** "hide the wheel overlay" and "end the
turn" are **decoupled**. Dismissing the overlay (`DISMISS_WHEEL`) keeps the
responder live. Only `cancelTurn` / `CLEAR_RESPONDER` ends the turn. Never
conflate them — that bug caused weeks of "nothing happens after a pick."

---

## 2. The three tabs and how they share state

The commander (`/teacher/live`), remote (`/remote`), and board (`/board`) are
**separate browser tabs**, each mounting its own `<SessionProvider>`. They do
NOT share React state directly. They converge via two Supabase Realtime channels:

| Channel | Carries | Direction |
|---|---|---|
| `classroom_live` (broadcast, event `classroom_action`) | The command bus — every `{type, payload, timestamp}` action | teacher → all tabs |
| `classroom_session_sync` (postgres_changes on `classroom_sessions`) | unit / slide index / status | DB → all tabs |

**Critical implication for game authors:** because tabs don't share React state,
any state change that must reach the board projector has to go through a
**broadcast** (an action on `classroom_live`). A local `setState` only affects
the tab that called it.

The broadcast channel is configured with `broadcast: { self: false }`
(`store/SessionContext.tsx`). This means **the sender does not receive its own
broadcast** — so every sender MUST also do an optimistic local `setState` for
the same change (see §5). Other tabs still receive it normally.

---

## 3. The SessionContext API a game consumes

Games get everything from `useSession()` (`store/SessionContext.tsx`). The
relevant surface for the lifecycle:

```ts
const {
  state,               // { quickWheelWinner, currentTurnId, students, activeUnit, ... }
  addPoints,           // (studentId, amount) — optimistic + broadcast + ledger write. Negatives OK (clamps at 0).
  gradeStudent,        // (studentId, word, correct) — writes FSRS/cognition for CLAIMED students (no-op for unclaimed)
  triggerAction,       // (type, payload?) — generic broadcast + optimistic lastAction
  triggerConfetti,     // () — fire the board confetti burst
} = useSession();
```

### State fields the game reads
| Field | Type | Meaning |
|---|---|---|
| `state.quickWheelWinner` | `string \| null` | The id of the currently-picked responder. **Gate all scoring on this** — `null` = choral/practice mode (no scoring). |
| `state.currentTurnId` | `string \| null` | Changes every time a NEW responder comes up (via `NEW_TURN`). **Key your reset `useEffect` on this** so the game resets fresh per student. |
| `state.students` | `any[]` | The roster. Find the picked student's name/avatar via `usePickedStudent()` (§6). |
| `state.lastAction` | `{type, payload, timestamp} \| null` | The most-recent broadcast. Subscribe to remote controls (REVEAL, NEXT, RESET_GAME, etc.) by reading this. |

---

## 4. The action vocabulary (the command bus)

All actions are `{ type: string, payload?: any, timestamp: number }` broadcast on
`classroom_live` → event `classroom_action`. The reducer (`SessionContext.tsx`
~line 220) handles each. **Games mostly only LISTEN; the lifecycle actions are
emitted by SessionContext itself.**

### Lifecycle actions (emitted by the pick functions — don't emit these yourself)
| Action | Payload | Effect | Who emits |
|---|---|---|---|
| `SPIN_WHEEL` | `{ targetId, overlay }` | Opens the wheel overlay, sets `quickWheelWinner` | `selectNextStudent` / `magicSelectStudent` |
| `GAME_WIN` | `{ winnerId }` | Fires confetti | (4s/2.5s after SPIN) |
| `NEW_TURN` | `{ studentId }` | Sets `currentTurnId` → games reset | (after GAME_WIN) |
| `DISMISS_WHEEL` | — | Clears `activeOverlay` ONLY (keeps responder live) | (after NEW_TURN) |
| `POINTS_AWARDED` | `{ studentId, amount }` | Updates points + confetti if >0 | `addPoints` |
| `CLEAR_RESPONDER` | — | Clears `quickWheelWinner` + `currentTurnId` (full turn reset) | `cancelTurn` / Baton "Class" |
| `CLOSE_OVERLAY` | — | **Alias for DISMISS_WHEEL** (non-destructive now) | `closeOverlay` |

> ⚠️ **`CLOSE_OVERLAY` vs `DISMISS_WHEEL` vs `CLEAR_RESPONDER`:** the first two
> now both mean "hide the popup, keep the responder." `CLEAR_RESPONDER` is the
> only one that ends the turn. Do not use `CLOSE_OVERLAY` to "reset" anything.

### Game-control actions (games LISTEN via `state.lastAction`)
| Action | Typical use |
|---|---|
| `RESET_GAME` | Teacher tapped Redo / Reset → rebuild a fresh board |
| `REVEAL_ANSWER` / `REVEAL` | Teacher reveals the answer |
| `NEXT` / `NEXT_ROUND` / `NEXT_CARD` | Advance to the next question/item |
| `CHECK_ANSWER` | Teacher asks the board to grade the current attempt |
| `PLAY_PAUSE`, `FLIP_CARD`, etc. | Per-template controls (see existing templates) |

**Naming gotcha (historical):** some templates listen for `REVEAL` while the
remote emits `REVEAL_ANSWER` for the same intent. When adding a new game, pick
ONE string and use it in both the emitter (`ContextualControls` / `TeacherRemote`)
and the receiver (your template's `lastAction` effect). Mismatches = dead buttons.

---

## 5. The 4 things every game MUST do

### ① Reset on new turn — key a `useEffect` on `state.currentTurnId`
```tsx
const turnId = state.currentTurnId;
useEffect(() => {
  if (turnId === null) return;   // choral/practice mode — leave state as-is
  // reset ALL per-turn state: question index, phase, selections, mistakes
  resetForNewStudent();
}, [turnId]);
```
Without this, the game keeps the previous student's half-played state when the
wheel picks a new kid.

### ② Track mistakes with a `useRef` (not just state)
```tsx
const mistakesRef = useRef(0);
const awardedRef = useRef(false);   // prevents double-payment on re-renders
```
Reset both in the `NEW_TURN` effect AND in any manual reset function. Increment
`mistakesRef.current` on every wrong attempt.

### ③ Score via `addPoints` + `scoreForAttempt`
```tsx
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';

// On a WRONG attempt:
const picked = state.quickWheelWinner;
if (picked) {
  mistakesRef.current += 1;
  addPoints(picked, -MISTAKE_PENALTY);          // −5, live, clamps at 0
}

// On SUCCESS (guard with awardedRef so it only pays once):
if (picked && !awardedRef.current) {
  awardedRef.current = true;
  addPoints(picked, scoreForAttempt(mistakesRef.current));   // max(0, 30 − mistakes×5)
}
```
`addPoints` accepts negatives (clamps the displayed total at 0, no confetti on
deductions). **Always gate on `state.quickWheelWinner`** — null = practice mode.

### ④ Personalize the success message
```tsx
import { usePickedStudent } from './usePickedStudent';
const pickedStudent = usePickedStudent();   // {id, name, avatar} | null

<h2>{pickedStudent ? `${pickedStudent.name} nailed it!` : 'Success!'}</h2>
```

---

## 6. Shared helpers (reuse, don't reinvent)

| File | Exports | Use for |
|---|---|---|
| `apps/board/templates/scoringDefaults.ts` | `CLEAN_SCORE` (30), `MISTAKE_PENALTY` (5), `scoreForAttempt(mistakes)`, `pointsForCorrect(stepType)` | Scoring math |
| `apps/board/templates/usePickedStudent.ts` | `usePickedStudent()` → `{id, name, avatar} \| null` | Resolving the picked student's name for messages |
| `services/attendanceLogic.ts` | `filterPresent(students)` | Excluding absent kids from pickers/rosters |

---

## 7. Wiring checklist for a new game

1. **Create** `apps/board/templates/BoardMyGame.tsx`. Mirror the structure of
   `BoardFlashMatch.tsx` (the cleanest reference).
2. **Register** it in `apps/board/ClassroomBoard.tsx` (~line 131, the
   `currentStep.type === '...' && <BoardMyGame />` map) AND in
   `apps/teacher/live/panels/BoardRenderer.tsx` `BOARD_MAP` (so the commander
   preview renders it).
3. **Add a step type** to the lesson flow schema (the `type` string your game
   matches). Update `ContextualControls.tsx` and `TeacherRemote.tsx`'s
   `renderActivityControls` with the remote buttons for it.
4. **Implement the 4 must-dos** (§5): NEW_TURN reset effect, mistake refs,
   `addPoints` + `scoreForAttempt` scoring, personalized message.
5. **Subscribe to remote controls** via a `useEffect([state.lastAction])` —
   handle at minimum `RESET_GAME`. Use the SAME action strings your remote
   buttons emit (§4 naming gotcha).
6. **Filter absent students** if the game picks from the roster
   (`filterPresent`).
7. **Verify** in two tabs (commander + board): practice mode on entry → spin →
   overlay dismisses on both → fresh board → wrong −5 → success +N with name →
   Next Student → loop.

---

## 8. Common pitfalls (the bugs we already fixed — don't reintroduce)

- ❌ **Keying the reset effect on `state.lastAction` instead of `currentTurnId`.**
  `lastAction` changes on EVERY action (points, drawings, sounds), so the game
  would reset constantly. Use `currentTurnId` — it only changes on a new pick.
- ❌ **`useCallback` with missing deps.** If `handleAnswer` is memoized and
  reads `state.quickWheelWinner` but doesn't list it in deps, it closes over a
  STALE (null) winner → scoring silently no-ops. Either include `quickWheelWinner`
  in deps, or use a plain function (recreated each render, fresh closure).
  `BoardListenTap` does this correctly; `BoardFlashMatch` uses plain functions.
- ❌ **`awardedRef` not reset on manual `RESET_GAME`.** After the first success
  the latch sticks and blocks all later awards. Reset it in every reset path.
- ❌ **Using `CLOSE_OVERLAY` to "reset the turn".** It's non-destructive now —
  it won't clear the responder. Use `cancelTurn()` / `CLEAR_RESPONDER`.
- ❌ **Doing a local `setState` for something other tabs need to see.** Cross-tab
  state changes MUST be broadcasts. (E.g. the overlay-dismiss bug: local-only
  dismiss left the board projector's overlay stuck open.)
- ❌ **Early `return` before all hooks.** Rules of Hooks: declare every
  `useState`/`useEffect`/`useRef` BEFORE any `if (loading) return ...`. An early
  return above hooks crashes React ("rendered more hooks than previous render").

---

## 9. Exceptions

### TeamBattle (`BoardTeamBattle.tsx`)
Team-vs-team, not per-individual. It does NOT use the 30/−5 pick model — it has
its own team-score rails and round/steal state machine. Scoring there awards the
picked student on a correct answer but the team totals are tracked separately.
If you build another team-based game, follow TeamBattle's pattern instead of §5.

### Display-only templates (BoardFocusCards, BoardStoryStage, BoardMediaPlayer, etc.)
No per-student scoring. They only subscribe to navigation controls
(`NEXT_CARD`, `PLAY_PAUSE`, …). Skip §5 entirely — just handle `lastAction`.

### Removed: BoardPoll (2026-08-03)
`BoardPoll.tsx` was removed outright. It had no voting handler — `votes` was
initialized to all-zero and never incremented (no student device surface exists
to submit votes). The classroom model is projector + teacher-remote only;
students have no `classroom_live` subscription or vote UI. Wiring a functional
poll would require building a new 1:1 student-live surface (channel subscription,
route, auth, vote UI, aggregation) — a different product shape. Recreate only
if/when a 1:1 student-device model is introduced.

---

## 10. File map (where everything lives)

| Concern | File |
|---|---|
| The command bus + state + lifecycle | `store/SessionContext.tsx` |
| Scoring math | `apps/board/templates/scoringDefaults.ts` |
| Picked-student resolver | `apps/board/templates/usePickedStudent.ts` |
| Board router (renders the template) | `apps/board/ClassroomBoard.tsx` |
| Board frame + whose-turn footer | `apps/board/BoardShell.tsx` |
| Wheel overlay layer | `apps/board/templates/BoardOverlayLayer.tsx` |
| Commander (teacher desktop) | `apps/teacher/LiveCommander.tsx` ("Now answering" bar) |
| Commander wheel sidebar | `apps/teacher/live/sidebar/SidebarPanel.tsx` |
| Remote (teacher mobile) Baton | `apps/remote/TeacherRemote.tsx` |
| Remote contextual controls | `apps/teacher/live/panels/ContextualControls.tsx` |
| Reference games | `apps/board/templates/Board{FlashMatch,SpeedQuiz,ListenTap,Unscramble,StorySequencing,GrammarPractice}.tsx` |

---

## 11. Quick copy-paste skeleton

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useSession } from '../../../store/SessionContext';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';

const BoardMyGame = ({ data }: { data: any }) => {
  const { state, addPoints } = useSession();
  const pickedStudent = usePickedStudent();
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const [isComplete, setIsComplete] = useState(false);

  // ① Reset on new turn
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setIsComplete(false);
    // ...reset question/phase/selections
  }, [turnId]);

  // ② Listen for remote RESET_GAME
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
      mistakesRef.current = 0;
      awardedRef.current = false;
      setIsComplete(false);
    }
  }, [state.lastAction]);

  // ③ Score
  const handleWrong = () => {
    const picked = state.quickWheelWinner;
    if (picked) { mistakesRef.current += 1; addPoints(picked, -MISTAKE_PENALTY); }
  };
  const handleSuccess = () => {
    const picked = state.quickWheelWinner;
    if (picked && !awardedRef.current) {
      awardedRef.current = true;
      addPoints(picked, scoreForAttempt(mistakesRef.current));
    }
    setIsComplete(true);
  };

  if (isComplete) {
    return (
      <div>
        <h2>{pickedStudent ? `${pickedStudent.name} nailed it!` : 'Complete!'}</h2>
      </div>
    );
  }
  return <div>{/* game UI */}</div>;
};
export default BoardMyGame;
```
