# BoardWheelOfDestiny + The Live Loop + Teacher-Flow Polish — Implementation Spec

> Response to Prompt 10, the final prompt in the series. Builds on `professor-live-architecture-design.md` §4 (full), §4.1–§4.4. Audit references: `§E` (the loop), `§G`, `§H3`, `§I`.
>
> **⚠ Correction 2026-08-07 (verified against the live schema + SessionContext).** Three issues:
>
> 1. **§4's SQL uses `class_session_id` — that column does not exist on `point_transactions`.** Verified (migration `20260721000001`): the table has `class_id` (UUID → classes), not `class_session_id`. Replace `class_session_id = $1` with `class_id = $1` in both queries. The `$1` parameter is the active class id (`SessionContext.state.activeClassId`).
>
> 2. **§3's `endSession` references `session.askedComprehensionItems` — that state is NOT on SessionContext.** Agent D (Batch 2) implemented `askedComprehensionItems` as a **module-level Map singleton in `apps/board/templates/BoardStoryStage.tsx`**, exported for StorySequencing to import — not as SessionContext state (the spec §1 of storystage-dialoguestage-v2-spec.md proposed "SessionContext-level, alongside remediationQueue" but the implementer chose a module singleton to avoid editing SessionContext). So `endSession` cannot clear it via `session.askedComprehensionItems`. **Resolution:** either (a) move the Map to SessionContext (then the endSession cleanup is valid), or (b) expose a `clearAskedComprehensionItems()` export from `BoardStoryStage.tsx` and call it from `endSession`. Option (a) is cleaner and matches the original spec intent; option (b) is less work. Pick one.
>
> 3. **§5's `SUPPORTED_FLOW_TYPES` array + `BOARD_MAP` collapse is sound but requires registering the not-yet-built `BOARD_GRAMMAR_FORGE`.** Grammar Forge doesn't exist yet (next session's work — see `GRAMMAR_FRONTEND_HANDOFF.md`). The collapse to a single canonical map is Phase 8 work; it should land AFTER Forge exists, or the array will reference a component that isn't built. Sequence: build Forge first, then do this collapse.
>
> 4. **§4's `student_id` in the Struggling Students query** — `point_transactions` has `roster_id` and `profile_id`, not `student_id`. The per-student grouping should use `roster_id` (the board identity) and join to `roster_students` for the display name, OR use `profile_id` (the claimed home-account identity) if you want to filter to claimed students only. The current `GROUP BY student_id` column doesn't exist.

## The pedagogy note this prompt earns

Every escalation model, scoring formula, and feedback loop spec'd across the previous nine prompts only reaches a classroom through this loop. A teacher who can't trust the picker, doesn't know which selection mode is active, or watches the projector auto-advance mid-sentence experiences the whole redesign as unreliable, regardless of how sound any individual game's pedagogy is underneath. This prompt is infrastructure in the same sense `useEscalatingPool` was — not glamorous, but everything else's actual delivery depends on it.

---

## 1. `BoardWheelOfDestiny` — enforce, don't just display

**Decision: enforce, not display-only.** A "Cold-Call Fairness" mode that promises fairness but is driven by logic the visible fairness panel doesn't actually reflect is a trust problem waiting to surface — a teacher glances at the panel, sees one story, and the pick tells another. Fixing this by unifying the two onto one data source rather than trying to keep two separate computations in sync:

```ts
interface PickHistoryEntry { studentId: string; lastPickedAt: number | null; pickCountThisSession: number; }

function selectNextStudent(mode: SelectionMode, roster: Student[], pickHistory: PickHistoryEntry[]): Student {
  switch (mode) {
    case 'ROUND_ROBIN': return roster.find(s => !hasGoneThisRotation(s, pickHistory)) ?? resetRotationAndPickFirst(roster, pickHistory);
    case 'RANDOM':       return randomChoice(roster);
    case 'FAIR':         return [...roster].sort((a, b) =>
                            (entryFor(a, pickHistory)?.lastPickedAt ?? 0) - (entryFor(b, pickHistory)?.lastPickedAt ?? 0)
                          )[0];
  }
}
```

The fairness panel renders this exact `pickHistory` array, sorted the same way `selectNextStudent` reads it — same source, same computation. What the teacher sees *is* what determines the next pick, not an approximation of it. One shell, kept — no evolution needed beyond wiring it to its own displayed data.

---

## 2. Selection modes — the honest UI

```ts
type SelectionMode = 'ROUND_ROBIN' | 'RANDOM' | 'FAIR';   // ELIMINATION removed from the type entirely, not hidden from the UI

const SELECTION_MODE_LABELS: Record<SelectionMode, { label: string; description: string }> = {
  ROUND_ROBIN: { label: 'Everyone Gets a Turn (default)', description: 'Cycles through the whole class before repeating anyone' },
  RANDOM:      { label: 'Random', description: 'Fully random pick each time' },
  FAIR:        { label: 'Cold-Call Fairness', description: "Picks whoever's waited longest since their last turn" },
};
```

`ELIMINATION`'s removal from the *type* (not just the sidebar) means a caller audit is needed before it's safe — same discipline as retiring `pointsForCorrect` in Prompt 0: check every reference compiles away cleanly, don't just stop rendering the option. The default's visibility fix (§H3: *"default is hidden ROUND_ROBIN"*) is the `"(default)"` label plus the selector pre-selecting it, rather than a mode existing with no visible indication it's active.

---

## 3. Loop invariants — including a cleanup audit this series owes itself

**One-scored-attempt-per-pick.** Not new here — every shell in Prompts 1–9 implements the `awardedRef`/`awardedByCharacterRef`/`awardedPairsRef` pattern, surfaced via the "🔁 already scored this turn" chip (Prompt 0). Restating it here as the loop-level invariant every shell's implementation is required to satisfy, not a per-shell suggestion.

**`SLIDE_COMPLETE` → glow Next, never auto-advance.** Also established throughout (`§4.3`, applied consistently since Prompt 1). The loop-level rule: `SLIDE_COMPLETE` is a signal, not a command — it highlights the advance control and logs a completed-vs-abandoned flag for analytics (§4), and that's the entire scope of what it's allowed to do.

**`endSession` — the named bug, plus everything else this series has since added to session state.** The audit names one gap (`activeClassId` not cleared), but across Prompts 0, 1, 7, and this one, the series has *added* several more pieces of session-scoped state that would have the same problem if `endSession` isn't updated to match. Auditing the full list rather than just fixing the one named bug:

```ts
function endSession(session: SessionContext) {
  broadcast('SESSION_ENDED', { sessionId: session.activeClassId });
  unsubscribeFromRealtimeChannel(session.activeClassId);

  session.activeClassId = null;              // the originally-named bug
  session.currentTurnId = null;
  session.remediationQueue = [];             // Prompt 0
  session.askedComprehensionItems = new Map();  // Prompt 7 — StoryStage/StorySequencing coordination
  session.pickHistory = [];                  // this prompt, §1
}
```

Worth flagging as its own small lesson: incremental feature work across many separate specs is exactly how a cleanup function quietly falls behind what it's supposed to clean up. This list should be treated as a living checklist, re-audited any time new `SessionContext`-level state gets added later, not a one-time fix.

---

## 4. Real analytics — the SQL

```sql
-- Class Accuracy (current class session). Partial credit weighted at 0.5.
-- CORRECTED 2026-08-07: column is `class_id` (not `class_session_id` — that doesn't exist).
-- Optionally scope to current session by created_at >= session start if a per-session cutoff is tracked.
SELECT
  ROUND(
    SUM(CASE metadata->>'correctness'
          WHEN 'correct' THEN 1.0
          WHEN 'partial' THEN 0.5
          ELSE 0.0
        END) / NULLIF(COUNT(*), 0) * 100,
    1
  ) AS accuracy_pct,
  COUNT(*) AS total_attempts
FROM point_transactions
WHERE class_id = $1                           -- $1 = activeClassId
  AND source = 'attempt'                       -- only the analytics-write rows (not the points flush)
  AND metadata->>'correctness' IS NOT NULL;

-- Struggling Students (current class session) — attempts >= 2 AND accuracy < 60%.
-- CORRECTED 2026-08-07: group by roster_id (board identity), not student_id (doesn't exist).
-- Join roster_students for display name if needed.
SELECT
  pt.roster_id,
  rs.display_name,
  COUNT(*) AS attempts,
  ROUND(
    SUM(CASE pt.metadata->>'correctness' WHEN 'correct' THEN 1.0 WHEN 'partial' THEN 0.5 ELSE 0.0 END)
    / COUNT(*) * 100,
    1
  ) AS accuracy_pct
FROM point_transactions pt
LEFT JOIN roster_students rs ON rs.id = pt.roster_id
WHERE pt.class_id = $1
  AND pt.source = 'attempt'
  AND pt.metadata->>'correctness' IS NOT NULL
GROUP BY pt.roster_id, rs.display_name
HAVING COUNT(*) >= 2
   AND SUM(CASE pt.metadata->>'correctness' WHEN 'correct' THEN 1.0 WHEN 'partial' THEN 0.5 ELSE 0.0 END) / COUNT(*) < 0.60
ORDER BY accuracy_pct ASC;
```

*(Note: for a true per-session scope, add `AND pt.created_at >= $2` where `$2` is the session-start timestamp. The current `services/attemptsLog.ts` `classAccuracySince`/`studentAccuracySince` helpers already implement the time-windowed variant in JS — these SQL queries are the DB-side equivalent if you prefer to push the computation down.)*

**This entire analytics layer is only as honest as its inputs.** It depends on every `addPoints` call across all nine prior specs actually populating `metadata.correctness` — which they do, as written, but a future shell built without following that convention would silently produce rows the `WHERE metadata->>'correctness' IS NOT NULL` filter simply excludes rather than corrupting the average. That's a deliberate protective filter, not an oversight: better to undercount than to silently mix untyped legacy rows into a "real" accuracy number. Tier 2/3 FSRS writes from Prompt 9 (`recordExposure`/`recordChoralReview`) never touch `point_transactions` at all, so they're correctly invisible to these queries without any special-casing.

---

## 5. `ContextualControls` exhaustiveness + the single canonical `BOARD_MAP`

The mechanism needs a real closed union type to have teeth — deriving it from the runtime array rather than maintaining two separate things that can drift:

```ts
const SUPPORTED_FLOW_TYPES = [
  'FLASH_MATCH', 'LISTEN_TAP', 'WHATS_MISSING', 'UNSCRAMBLE', 'STORY_SEQUENCING',
  'BOARD_GRAMMAR_FORGE', 'SPEED_QUIZ', 'TEAM_BATTLE', 'STORY_STAGE', 'DIALOGUE_STAGE',
  'I_SAY_YOU_SAY', 'FOCUS_CARDS', 'MEDIA_PLAYER', 'LIVE_WARMUP', 'WHEEL_OF_DESTINY',
  'UNIT_SELECTION', 'INTRO_SPLASH', 'GRAMMAR_SANDBOX',
  // GAME_ARENA, POLL — deliberately absent, retired in Prompt 0
] as const;
type FlowType = typeof SUPPORTED_FLOW_TYPES[number];   // single source of truth — the array and the type can't drift apart

function assertNever(x: never): never { throw new Error(`Unhandled FlowType: ${JSON.stringify(x)}`); }

const BOARD_MAP: Record<FlowType, React.ComponentType<BoardProps>> = {
  FLASH_MATCH: BoardFlashMatch, LISTEN_TAP: BoardListenTap, WHATS_MISSING: BoardWhatsMissing,
  UNSCRAMBLE: BoardUnscramble, STORY_SEQUENCING: BoardStorySequencing, BOARD_GRAMMAR_FORGE: BoardGrammarForge,
  SPEED_QUIZ: BoardSpeedQuiz, TEAM_BATTLE: BoardTeamBattle, STORY_STAGE: BoardStoryStage,
  DIALOGUE_STAGE: BoardDialogueStage, I_SAY_YOU_SAY: BoardISayYouSay, FOCUS_CARDS: BoardFocusCards,
  MEDIA_PLAYER: BoardMediaPlayer, LIVE_WARMUP: BoardLiveClassWarmup, WHEEL_OF_DESTINY: BoardWheelOfDestiny,
  UNIT_SELECTION: BoardUnitSelection, INTRO_SPLASH: BoardIntroSplash, GRAMMAR_SANDBOX: BoardGrammarSandbox,
};
// Adding a FlowType without a matching BOARD_MAP entry now fails to compile — TS enforces exhaustiveness
// on a Record<FlowType, ...> automatically, no runtime assertNever call even needed for this specific map,
// though the pattern is used below for the controls registry where the check is more useful.
```

**This map replaces both `ClassroomBoard.tsx`'s switch and `BoardRenderer.tsx`'s `BOARD_MAP`** — both import this one. Prompts 5 and 7 both registered their shells (`BOARD_GRAMMAR_FORGE`, `DIALOGUE_STAGE`) in both of the old parallel switches as a stated temporary measure specifically because this collapse hadn't happened yet at their point in the sequence. Once this ships, those duplicate registrations become dead code — delete them, don't leave them as harmless-looking leftovers.

---

## 6. The `ContextualControlsSpec` contract

Used throughout Prompts 1–9 without ever being formally defined as a top-level interface — doing that now:

```ts
interface ControlAction {
  label: string;
  enabled: boolean | ((context: unknown) => boolean);   // both patterns are used across the series — static for always-available controls, dynamic for context-gated ones (e.g. WhatsMissing's mode-dependent hint, Unscramble's hasSubmitted checks)
  onTrigger: (...args: unknown[]) => void;
}

interface BaseControls {
  skip: ControlAction;
  forceCorrect: ControlAction;
  endSlide: ControlAction;
}

interface ContextualControlsSpec {
  shellType: FlowType;
  controls: BaseControls & Record<string, ControlAction>;   // every shell satisfies the base three, plus whatever shell-specific extras it needs
}

const SHELL_CONTROLS: Record<FlowType, ContextualControlsSpec> = { /* one entry per shell, same exhaustiveness guarantee as BOARD_MAP */ };
```

Every shell registered in `BOARD_MAP` must have a corresponding `SHELL_CONTROLS` entry satisfying `BaseControls` at minimum — this is what makes the dead-control-bar bug (`§H3`) structurally impossible to reintroduce, not just fixed once: a new shell without a compliant controls spec fails to compile rather than silently falling through to a "Presenter Mode Active" placeholder.

**Checking this against all nine prior specs, not just asserting it:** every shell built across Prompts 1–9 already has `skip`, `forceCorrect`, and `endSlide` (or the equivalent `endSlide` framing) in its controls spec, even though the contract wasn't formalized until now — the pattern held consistently throughout without needing retrofitting. `BoardISayYouSay`'s choral portion is the one interesting case: it deliberately omits `forceCorrect` from what's *visible* during the unscored stage, but the shell as a whole still satisfies the base contract via its `MINIMAL_PAIR_SWIPE` portion, gated through the same dynamic `enabled` pattern every other context-sensitive control in this series uses.

---

## Acceptance criteria — checked

- **Picker decision, justified:** `WheelOfDestiny` kept, evolved to enforce rather than merely display fairness data (§1).
- **Selection modes honest, `ELIMINATION` removed from the type:** with the caller-audit discipline stated explicitly, not left implicit (§2).
- **Loop invariants defined, including a cleanup audit the series owed itself:** `endSession`'s scope extended to cover everything Prompts 0/1/7/10 added to `SessionContext`, not just the one originally-named field (§3).
- **Real analytics, precise SQL:** both queries, with the partial-credit weighting decision stated rather than silently binary-bucketed, and the "why undercount, not corrupt" reasoning for the null-filter made explicit (§4).
- **Control-bar contract satisfied:** formal interface, checked retroactively against all nine prior shells rather than just declared going forward (§6).
- **Coherent teacher flow:** the single canonical `BOARD_MAP`, replacing both legacy switches, with the temporary dual-registrations from Prompts 5/7 flagged for deletion now that the collapse they were waiting on has happened (§5).
- **Sound pedagogy — the loop as delivery vehicle:** stated up front, not as an afterthought.
