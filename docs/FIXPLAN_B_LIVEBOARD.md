# Workstream B — Live Board scoring + dead buttons

**Goal:** Fix the user's headline complaint that "many functions in the liveboard and live commander are not properly connected." Specifically: (1) wire scoring into games so correct answers actually move the leaderboard, (2) fix the dead board handlers, (3) stop the self-echo double-processing.
**Risk:** 🟡 Medium. Touches the live command bus and 7+ board templates. All changes are additive (new handlers, new scoring calls) or one surgical config flag; no schema migration required.
**Status:** Plan drafted — awaiting approval to implement.

---

## B1. Stop the self-echo (P0 — do first)

**Bug:** `store/SessionContext.tsx:189` creates the `classroom_live` channel without `broadcast: { self: false }`. Supabase echoes broadcasts back to the sender by default, so every `triggerAction`/`addPoints`/`selectNextStudent` runs the handler twice on the teacher's own tab — double points (masked only by the ledger reload), double confetti, duplicate `selectionHistory` entries that corrupt the FAIR/ELIMINATION selection modes.

**Fix:**
```ts
// store/SessionContext.tsx:189
const channel = supabase.channel('classroom_live', {
  config: { broadcast: { self: false } }
});
```

**Why this is safe:** every sender (`triggerAction`, `addPoints`, `selectNextStudent`, `assignTeams`, drawing helpers) already does an **optimistic** `setState` before broadcasting. With `self: false`, the local tab relies on the optimistic update; other tabs (board, remote) still receive the broadcast. No feature loses its local feedback.

**Files:**
- `store/SessionContext.tsx:189` — add config object.

**Verification:**
- [ ] Open commander + board in two tabs. Click "+10" for a student once. Points increase by exactly 10 on BOTH tabs (not 20 on the teacher's).
- [ ] Spin the wheel. Confetti fires once on the teacher's tab.
- [ ] Over a 10-question SpeedQuiz, `selectionHistory` has no duplicate ids.

---

## B2. Wire scoring into game templates (P0)

**Bug:** Games call `gradeStudent()` (cognitive capture, claimed-only) but never `addPoints()`. The live leaderboard only moves when the teacher manually taps +10/+50. No game outcome ever scores. This is the literal reason "scoring isn't connected."

**Design decision (per user):** configurable per-template defaults, with the value overridable by the teacher.

### B2.1 Add a shared scoring constants module

New file **`apps/board/templates/scoringDefaults.ts`**:
```ts
// Per-template default point awards for a correct answer.
// A teacher can override at runtime via the commander/remote (existing +10/+50 controls).
export const CORRECT_ANSWER_POINTS: Record<string, number> = {
  SPEED_QUIZ:        10,
  TEAM_BATTLE:       15,   // team-based, slightly higher
  LISTEN_TAP:         5,   // quick-fire, lower
  FLASH_MATCH:        8,
  UNSCRAMBLE:        10,
  STORY_SEQUENCING:  10,
  GRAMMAR_PRACTICE:  10,
};
export const WRONG_ANSWER_PENALTY: Record<string, number> = {
  SPEED_QUIZ: 0, // no penalty by default — teacher can deduct manually
  // ... same keys, all 0 by default
};
```

### B2.2 Call `addPoints` on correct/wrong in each template

The pattern (already used by `TeacherRemote.tsx:394` Baton Correct): on `isCorrect`, call `addPoints(studentId, CORRECT_ANSWER_POINTS[step])`. Add to:

| Template | File:Line (grade call) | What to add |
|---|---|---|
| BoardTeamBattle | `apps/board/templates/BoardTeamBattle.tsx:138` | After `gradeStudent(...)`, if `isCorrect` call `addPoints(picked, CORRECT_ANSWER_POINTS.TEAM_BATTLE)` |
| BoardSpeedQuiz | `apps/board/templates/BoardSpeedQuiz.tsx:114` | Same pattern, `SPEED_QUIZ` |
| BoardListenTap | `apps/board/templates/BoardListenTap.tsx:147` | Same, `LISTEN_TAP` |
| BoardFlashMatch | `apps/board/templates/BoardFlashMatch.tsx` (no grade call today) | Add `gradeStudent` + `addPoints` on match |
| BoardUnscramble | `apps/board/templates/BoardUnscramble.tsx:61` (CHECK_ANSWER) | On correct, `addPoints(selected, UNSCRAMBLE)` |
| BoardStorySequencing | `apps/board/templates/BoardStorySequencing.tsx:41` (CHECK_ANSWER) | On correct, `addPoints(STORY_SEQUENCING)` |
| BoardGrammarPractice | `apps/board/templates/BoardGrammarPractice.tsx:83` | After `gradeObjective`, if `correct` call `addPoints(selectedStudentId, GRAMMAR_PRACTICE)` |

**Why not auto-deduct on wrong:** the teacher should keep manual control of penalties (different pedagogical styles). Wrong answers grade cognition (FSRS) but don't move the leaderboard unless the teacher taps. This matches the current mental model.

**Files:**
- New: `apps/board/templates/scoringDefaults.ts`
- Modified: 7 template files above.
- No service-layer change — `addPoints` already exists at `store/SessionContext.tsx:573`.

**Verification:**
- [ ] Run a SpeedQuiz round, answer correctly → student's points increase by 10 on both board and leaderboard within ~1s.
- [ ] Run a TeamBattle round, correct answer → both student points AND team rail total increase.
- [ ] Leaderboard (`ClassLeaderboard.tsx`) reorders after a correct answer.

---

## B3. Fix dead board handlers (P0)

### B3.1 Soundboard → board (currently fully dead)

**Bug:** `SidebarPanel.tsx:72-80` and `SoundBoardModal.tsx:30-33` emit `SOUND_CORRECT/WRONG/DING/DRUMROLL/WIN/ZAP`, but no board template handles them. There is no `<audio>` element anywhere on the board. The "Sounds play on Classroom Board" footer in `SoundBoardModal.tsx:62` is false.

**Fix — two options, recommend Option 1:**

**Option 1 (board-side audio layer):** new **`apps/board/templates/BoardSoundLayer.tsx`** mounted inside `BoardShell`. Holds a `Record<string, HTMLAudioElement>` ref to public sound files. Subscribes to `state.lastAction`; on `SOUND_*`, plays the matching clip.

**Option 2 (remote-side audio):** play the sound directly on the remote/commander tab. Simpler but doesn't match the product copy ("play on Classroom Board"). Pick this only if the projector isn't meant to be the audio source.

**Decision needed:** which device emits the audio — the projector (board) or the teacher's remote/commander? Defaulting to **Option 1 (board)** per the existing UI copy.

**Files:**
- New: `apps/board/templates/BoardSoundLayer.tsx`
- Modified: `apps/board/BoardShell.tsx` (mount the layer).
- Modified: `apps/remote/SoundBoardModal.tsx:30` (currently only vibrates — change to `triggerAction('SOUND_CORRECT')` so the board hears it).
- New assets: 6 sound files in `public/sounds/` (or stream from a CDN — TBD).

### B3.2 Live camera Snap → board (dead)

**Bug:** `TeacherRemote.tsx:439` calls `setLiveSnap(image)` which is local-only (`store/SessionContext.tsx:631-633`). Board never sees it.

**Fix:** broadcast the snapshot.
- Option A: broadcast the dataURL directly via a `LIVE_SNAP` action (simple, but dataURLs are large — ~500KB per snap could spam the channel).
- Option B (recommend): upload to Supabase Storage, broadcast only the path; board fetches. Cleaner, scales.

**Files:**
- `store/SessionContext.tsx:631` (`setLiveSnap`) — broadcast.
- `apps/board/ClassroomBoard.tsx:108` — already reads `state.liveSnapImage`; will just work once broadcast.

### B3.3 TeamBattle + GrammarPractice remote controls (dead)

**Bug:**
- `TeacherRemote.tsx:183,186` emit `SWITCH_TURN` and `RESET_TIMER` for TEAM_BATTLE; `BoardTeamBattle.tsx:95-101` only handles `RESET_GAME` + `REVEAL_ANSWER`.
- `TeacherRemote.tsx:264,267` emit `REVEAL_ANSWER`/`RESET_GAME` for GRAMMAR_PRACTICE; `BoardGrammarPractice.tsx` has NO `lastAction` effect at all.

**Fix — choose alignment direction:**

**Option A (change the board to match the remote — recommend):** add handlers to the board templates. This keeps the richer remote vocabulary.
- `BoardTeamBattle.tsx:95` — add `SWITCH_TURN` (advance active team) and `RESET_TIMER` (restart countdown) branches.
- `BoardGrammarPractice.tsx` — add a `useEffect` on `state.lastAction` that handles `REVEAL_ANSWER` and `RESET_GAME`.

**Option B (change the remote to match the board):** rewrite the remote emits to the strings the board already knows. Loses the SWITCH_TURN/RESET_TIMER granularity.

**Files (Option A):**
- `apps/board/templates/BoardTeamBattle.tsx:95-101`
- `apps/board/templates/BoardGrammarPractice.tsx`

### B3.4 ContextualControls action-string mismatches (dead)

**Bug:**
- `ContextualControls.tsx:55` emits `REVEAL` for SPEED_QUIZ; `BoardSpeedQuiz.tsx:95` wants `REVEAL_ANSWER`.
- `ContextualControls.tsx:56` emits `RESTART` for WHATS_MISSING; `BoardWhatsMissing.tsx:53` wants `START_MEMORIZE`.

Result: the desktop commander's Reveal/Restart buttons do nothing for these two slide types, while the remote (which uses the correct strings) works.

**Fix:** align `ContextualControls` to emit the strings the board already handles.
- `ContextualControls.tsx:55` — `REVEAL` → `REVEAL_ANSWER` for SPEED_QUIZ.
- `ContextualControls.tsx:56` — `RESTART` → `START_MEMORIZE` for WHATS_MISSING.

**Files:**
- `apps/teacher/live/panels/ContextualControls.tsx:55-56`

### B3.5 CELEBRATE → board (partial)

**Bug:** `SidebarPanel.tsx:87` "Trigger Celebration" emits `CELEBRATE`; only `StudentApp.tsx:116` consumes it. Board confetti is keyed off `confettiTrigger` which is bumped by `POINTS_AWARDED`/`GAME_WIN`, not `CELEBRATE`. So the celebration button does nothing on the projector.

**Fix:** handle `CELEBRATE` in the board's `lastAction` reducer by calling `triggerConfetti()`.
- `store/SessionContext.tsx:192-253` (the action reducer) — add a `CELEBRATE` branch that bumps `confettiTrigger`.

**Files:**
- `store/SessionContext.tsx:~230` (add CELEBRATE branch near the existing POINTS_AWARDED one).

---

## B4. Wheel hardening (P1)

These aren't "dead" but are fragile and the user specifically called out the wheel.

### B4.1 Guard `selectNextStudent` against empty roster

**Bug:** `store/SessionContext.tsx:707-746` — if `state.students` is empty or all filtered out by team, `pool[randomIndex].id` throws `TypeError: Cannot read properties of undefined`. Most easily hit by spinning before any class loads, or with a team filter that matches no one.

**Fix:** early-return (and ideally broadcast a toast) if `pool.length === 0`.
```ts
if (pool.length === 0) {
  // optional: surface a notice to the teacher
  return;
}
```

**Files:** `store/SessionContext.tsx:707` (also `magicSelectStudent` at `:685`).

### B4.2 Apply `filterPresent` consistently

**Bug:** the in-slide wheel filters present students correctly, but the overlay wheel and GameArena don't — absent kids can be picked.

**Fix:**
- `apps/board/templates/BoardOverlayLayer.tsx:17` — `const students = filterPresent(state.students)`.
- `apps/board/templates/BoardGameArena.tsx:12` — same.
- `apps/teacher/live/sidebar/SidebarPanel.tsx:88` ("+5 XP to Everyone"), `:106` (group shuffle), `:139` (struggling students) — route through `filterPresent`. (Already done correctly at `LiveCommander.tsx:240`.)

**Files:** as listed.

### B4.3 Couple wheel winner reveal to animation (optional, P2)

**Bug:** `BoardWheelOfDestiny.tsx:75-81` runs a 4s framer-motion transition; the winner reveal depends on a separate `setTimeout(4000)` in `SessionContext.tsx:763-765`. If they diverge, the wheel finishes spinning with no winner, or `GAME_WIN` fires mid-spin.

**Fix (optional):** drive the `GAME_WIN` broadcast from the template's `onAnimationComplete` instead of the timeout. This is a refactor; defer unless the desync is observed in practice.

---

## B5. Cross-tab state that doesn't broadcast (P1)

These are "partial" — works on the teacher's tab but the board (separate tab) doesn't see the change.

| State | Bug | Fix |
|---|---|---|
| `selectionMode` (FAIR/RANDOM) | `setSelectionMode` at `SessionContext.tsx:650` is local-only | Broadcast a `SELECTION_MODE_CHANGED` action; reducer applies it |
| `quietModeActive`, `noiseLevel` | `setQuietMode`/`updateNoiseLevel` at `:828`/`:832` are local-only | Broadcast `QUIET_MODE_CHANGED` / `NOISE_LEVEL_CHANGED`; reducer applies; only `MASS_PENALTY` broadcasts today |

**Files:** `store/SessionContext.tsx:650, 828, 832` + reducer at `:192`.

---

## B6. Recommended cleanup of decorative / fake UI (P2 — defer to workstream D)

Documented here so they're tracked, but **not in B's scope** (per user decision to defer architecture cleanup):
- `BoardPoll.tsx` — fake QR, no vote increment path.
- `useAISuggestion.ts:18` — logs `live_feedback_not_yet_implemented`, returns null.
- `TeacherRemote.tsx:419` decorative "Action" button — no `onClick`.
- `RemoteConnect.tsx:34,99` — room code ignored, QR has no handler.
- `VoiceCommandModal.tsx:67,62` — fake SpeechRecognition, ignores student name in "points …" parser.
- `SidebarPanel.tsx:163` — hardcoded 85% analytics.
- Four parallel wheel UIs — consolidate into one shared `<Wheel>` component (workstream D).

**Decision for B:** leave these in place but visually mark them "coming soon" or hide them, rather than shipping non-functional controls that erode trust. (Either implement or grey-out — pick one per control.)

---

## Sequencing within B

1. **B1 (self-echo)** first — one-line config change, unblocks clean testing of B2/B3.
2. **B2 (scoring)** — biggest user-visible win.
3. **B3.1-B3.5 (dead handlers)** — each is independent; can be parallelized.
4. **B4 (wheel hardening)** — small, surgical.
5. **B5 (cross-tab broadcast)** — protocol extension; do after B1 confirms the broadcast path is clean.

---

## Overall verification (do all before marking B complete)

- [ ] Two-tab test (commander + board): every action applies exactly once on each tab.
- [ ] Each of the 7 scoring templates: a correct answer increases the leaderboard within ~1s.
- [ ] Each previously-dead button (soundboard, snap, team-battle switch/reset, grammar reveal, commander reveal/restart for SPEED_QUIZ/WHATS_MISSING, celebrate) now visibly affects the board.
- [ ] Wheel: empty roster no longer crashes; absent students never picked (in-slide, overlay, or GameArena).
- [ ] Selection mode and quiet mode set on the commander are reflected on the board tab.
