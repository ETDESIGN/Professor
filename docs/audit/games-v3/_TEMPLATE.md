# <Game Name> — v3 Quality Audit (`<FLOW_TYPE>`)

> **Status:** `pending` → `file-ready` → `cowork-done` → `stitch-prompt-ready` → `stitch-returned` → `implemented`
> **Current status:** pending
> **Pilot:** no
> **Screenshots:** `screenshots/<NN>-*.png` (captured by ZCode from the live board)

---

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — a teacher-facing ESL/EFL tool for **live, in-classroom** English instruction to children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options).

**Classroom model (hard constraint — never propose student-device interaction).** A live class runs on three browser tabs converging via Supabase Realtime; students have **no devices**:

| Tab | Route | Who | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` | Teacher, desktop | Control room: lesson roadmap, roster chips, the per-game buttons, sidebar (wheel/teams/analytics) |
| **Remote Baton** | `/remote` | Teacher, phone | Handheld remote: spin/pick, correct–wrong, next student |
| **Board** | `/board` | **Projected 16:9** — the only screen kids see | Renders the current game/slide |

The teacher performs **all input**. Kids answer orally, point, or come to the front.

**Live loop.** Pick a student (wheel) → play a turn → score → next. `quickWheelWinner = null` means choral/practice mode (no individual scoring).

**Unified scoring model.** `scoreForAttempt(mistakes, difficulty)`: difficulty 1/2/3 (receptive / constrained / free-production) → 1–3 base points; −1 live per mistake; streak bonus (+1 at streak 3, +2 at streak 5); cap 5, floor 1 on success. Every scored event triple-writes: `addPoints` (leaderboard) + `recordAttempt` (analytics) + `gradeObjective` (FSRS memory model).

**Lifecycle contract — the 4 must-dos every scored game obeys:**
1. Full reset on `currentTurnId` change (new picked student ⇒ fresh board).
2. `mistakesRef` + `awardedRef` latches (no double-payment, no cross-turn leakage).
3. Score via `addPoints` + `scoreForAttempt` on the picked student.
4. Personalized message with the picked student's name.

**Turn dealing.** Deterministic per `(session, unit, shell, round, turnToken, resetCount)` — a new pick or reset re-deals; class-wide coverage tracked by a ledger so every objective gets its turn.

**Phases.** WARMUP / INPUT / OUTPUT / PRACTICE / ASSESS / WRAPUP — each game belongs to one phase envelope (allowed difficulty rungs + scoring posture).

**Design constraints for any redesign (applies to the Stitch prompt):**
- Board surface only, **16:9 projector**, viewed from 5–8 meters — large type, high contrast, punchy states.
- Kid-friendly but not infantile (ages 6–12 band).
- Must always be legible: the current challenge, the feedback state (correct/wrong/partial), the picked student's identity, and the score moment.
- Teacher-driven: every interaction must have a remote-control path; nothing can require a student device.

---

## §0 Identity

- **Flow type:** `<FLOW_TYPE>` (aliases: `<…>`)
- **Component:** `apps/board/templates/<Board*.tsx>`
- **Phase:** `<PHASE>`
- **Remote-control group:** `<ScoredShellControls | custom set>` (emitted from `apps/teacher/live/panels/ContextualControls.tsx`)
- **Data sources:** `<useBoardPool / useEscalatingPool / manifest / frozen fallback …>`
- **Mode:** `<picked student | team | choral | cooperative | passive>`

## §1 How the game works today

<ZCode fills: mechanics, turn flow, round structure, scoring wiring, data sources — self-contained, written for a reader with no codebase access. Reference screenshots by filename.>

## §2 Owner comments (verbatim)

> <Owner's recorded comments about THIS game, pasted verbatim by ZCode, with recording date. Nothing paraphrased.>

<ZCode note: any interpretation/clarification of a comment goes here, clearly marked as interpretation.>

## §3 ZCode code-level findings

<ZCode fills: numbered findings, each with severity (P1 blocks learning/showstopper, P2 degrades experience, P3 polish), file:line reference, and what the code actually does vs. what was intended. Includes dead buttons, state bugs, scoring drift, a11y-at-distance problems.>

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)

*(For each finding: severity P1/P2/P3, the evidence you're grounding it in — §1, §3, or a named screenshot — and a concrete recommendation. If you need information that isn't in this file, list it under "Information needed" instead of guessing.)*

### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

## §5 ⬜ Google Stitch prompt

<ZCode writes this AFTER §4 is filled: a self-contained natural-language prompt for Google Stitch to redesign this game's board UI (16:9), baking in §2 + §3 + §4 conclusions.>

## §6 ⬜ Stitch output & implementation notes

<Owner drops the Stitch export into `stitch/<NN>-<game>/` and notes the filename here; ZCode records what was implemented, what was adapted and why, commit hash, deploy verification.>
