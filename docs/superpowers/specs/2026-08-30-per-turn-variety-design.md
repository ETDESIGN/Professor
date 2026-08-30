# Per-Turn Variety for Live Board Games — Design Spec

**Date:** 2026-08-30 (follow-up to the word-rotation fix, same classroom session)
**Owner decision:** "Reorder + variant swap" — each student faces the same
round's words but a different question order, option order, and question form
where variants exist; Reset re-deals. Word selection per round and the
coverage ledger are UNTOUCHED (fairness + rotation stay).

## 1. Problem

After the word-rotation fix, coverage works, but every student who takes a
turn on the same game — and every Reset — replays the IDENTICAL question
sequence in the identical order (e.g. WordDetective `roundIndex: 1`
hardcoded, options rendered in stored order at `BoardWordDetective.tsx:437`,
deal seeded on `(sessionId, unitId, shellType, roundIndex)` with no turn
part). Kids memorize positions/answers instead of thinking.

## 2. Design

### 2.1 Turn-aware deal order (central)

- New pure module `apps/board/turnDeal.ts`:
  `dealForTurn(items, seedParts, keyOf)` — groups items by `keyOf`
  (objective_id), turn-seeded-shuffles the groups, turn-seeded-rotates each
  group's internal order (variant rotation), round-robin interleaves groups
  (spreads a word's variants across the run instead of back-to-back).
  Deterministic per seed (cross-tab agreement); different turn/reset ⇒
  different arrangement.
- `useEscalatingPool` applies `dealForTurn` to its filtered items, seed parts
  `makeRng(sessionId, unitId, shellType, roundIndex, turnToken, resetCount)`.
  `turnToken = state.currentTurnId ?? 'practice'` (currentTurnId IS the
  broadcast+live_state-hydrated turn token — canonical on every tab).
  **buildRound's SELECTION seed does NOT gain the turn** — same words per
  round for the whole class.
- `useQuizComposition` (quizEngine): the final question-order shuffle gains
  `turnToken` + `resetCount` seed parts; composition selection unchanged.

### 2.2 Reset nonce

- `SessionContext` state gains `resetCount: number` (init 0); the action
  reducer increments it on `RESET_GAME`. Persisted via the live_state row so
  late-mounting tabs agree (fallback if that plumbing resists: regenerate the
  turnToken on RESET_GAME — currentTurnId is already hydrated everywhere).
- `useSeedBase()` extends to `session|unit|step|turnToken|resetCount` — its
  consumers (GrammarLab/SentenceLab/PhonicsArena distractor+banks) become
  per-turn automatically.

### 2.3 Template layer

- Snapshot signatures (WhatsMissing `setupSigRef`, similar) gain
  `turnToken` + `resetCount` → re-snapshot (re-deal) per kid / per reset,
  not just progress reset.
- MCQ options rendered in stored order get a turn-seeded shuffle that carries
  correctness (shuffle option objects, recompute correctIndex) — starting
  with WordDetective; sweep other `options.map` offenders and convert.

## 3. Non-goals

- Per-kid word subsets (owner rejected — fairness).
- Changes to coverage ledger, round selection, SRS.
- Choral/practice board stays stable (turnToken `'practice'`).

## 4. Tests

- `test/turnDeal.test.ts`: deterministic per seed; varies by turn part and by
  reset part; variant rotation (multi-item group leads with a different
  variant per turn); interleave spreads groups; empty/single inputs.
- Existing `lessonDirector`/`quizEngine` selection tests stay green (proves
  selection untouched); full suite + tsc + build gate before deploy.

## 5. Rollout

Frontend-only (no migration, no edge functions). Branch → tests → merge →
push (Vercel auto-deploy) → `last-modified` check. Update
LIVE_GAME_LIFECYCLE.md (turn-aware dealing note) + AGENTS.md §9 row.
