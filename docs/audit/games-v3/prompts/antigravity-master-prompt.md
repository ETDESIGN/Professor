# Google Anti-Gravity — Master Prompt (v3 game audit, replaces ChatGPT Co-Work)

> **How the owner uses this:** open **Google Anti-Gravity**, open/grant access to the games-v3 folder, then paste everything between the ═══════ markers as the task. Use the RUN MODE line at the bottom to control scope (first game vs batch).

---

════════ PROMPT START — paste everything below this line ════════

You are working as a **senior game designer + UX auditor + ESL/EFL pedagogue** on "Professor", a teacher-facing English-teaching product for live classrooms with children aged 6–12 (primary market China, L1 Simplified Chinese). This is a QUALITY-AUDIT task over markdown files — do NOT modify any application source code.

## Where the work lives

Workspace folder (you have access):

`/Users/ET/Documents/DEV/teacher app/professor-0.1 (1)/docs/audit/games-v3/`

- `_INDEX.md` — the inventory of every game file + its status. **Read it first, keep it updated as you work.**
- One numbered file per game (`NN-<game>.md`). Each file embeds a **SHARED PRELUDE** (the classroom model — read it carefully, it is a hard constraint), then §0 identity, §1 how the game works today, §2 the owner's verbatim comments + clarifications, §3 code-level findings from our engineer (ZCode), and empty §4–§6.
- `screenshots/` — PNG captures of the game's current board UI, referenced from each file (a file's screenshots carry its number prefix, e.g. `05-*.png`).
- `_CROSS-CUTTING.md` — themes spanning multiple games.
- The pilot for reference (already completed): `26-word-search.md` — its §4 shows the expected depth and format.

## Your job

For each game file whose status is `file-ready`, produce a **quality audit** and write it **directly into §4 of that same file**, replacing the placeholder content under the §4 heading. Follow the sub-section structure already there (4.a–4.f).

Audit dimensions:
- **4.a UI & visual design** — layout, hierarchy, readability at 5–8 m projection distance, the visual states (idle / question / correct / wrong / partial / celebration), consistency, what a 7-year-old vs a 12-year-old will feel. The board must also survive the phone-landscape floor (~700×320) by reflowing, never scrolling during play.
- **4.b Workflow & user flow** — the teacher's path: start → turns → end. Friction, dead ends, unclear states, anything that could stall a live lesson in front of 30 kids. Every interaction needs a commander/remote path (and remember the wheel's 1/3/full questions-per-student rotation with auto-advance — no forced teacher clicks between answers).
- **4.c Pedagogical practice** — ESL for ages 6–12: scaffolding, retrieval practice, receptive→productive push, feedback quality, engagement and motivation design.
- **4.d Game interaction** — the mechanic itself: clarity, fairness, pacing, difficulty curve, how scoring *feels*, team/co-op dynamics where relevant.

Rules for every finding:
1. **Ground it.** Cite the evidence: a §1 behavior, a §3 finding, or a named screenshot. No evidence → put it under "Information needed" instead.
2. **Severity:** P1 = blocks learning or would stall a live lesson; P2 = degrades the experience; P3 = polish.
3. **Recommend something concrete.** "Improve feedback" is not a recommendation; "after a wrong tap, keep the wrong choice visible but dimmed and show the word's first letter as a hint" is.
4. **Respect the classroom model** (SHARED PRELUDE): teacher performs all input, students have no devices, board is the only kid-facing screen. Never propose student-device interaction.
5. **Language rule (owner, refined 2026-09-09):** English-first on the board — avoid Chinese on challenge surfaces WHEN POSSIBLE, but it is NOT a strict ban: instructions, tips, rules, and exercise descriptions may use Chinese when the kids otherwise wouldn't understand the task. What is hard: never make the ANSWER trivially visible, and prefer hints over answers.
6. **Write ONLY in §4** of each game file. Do not touch §0–§3, §5, §6, or the prelude. Exception: you may append cross-game themes to `_CROSS-CUTTING.md` §3.
7. End each game with **4.e Top-5 prioritized recommendations** and **4.f Design direction for Stitch** — a concise style/mood brief (colors, shapes, motion feel) plus the 3–5 key screens/states a designer should mock up, and what to KEEP from the current design. (Design execution is handled downstream by ZCode driving Google Stitch — you specify direction, not code.)

When you finish a game file, update its status line from `file-ready` to `cowork-done` and update the corresponding row in `_INDEX.md`. (Keep the literal status word `cowork-done` — the pipeline tooling keys on it.)

## Quality bar

You are the second pair of eyes between an engineer's audit (§3) and a visual redesign (Stitch). Be skeptical, specific, and practical. If §3 says a behavior is a bug, take it as fact. If §2 (owner comments) conflicts with §1, flag the conflict explicitly rather than silently picking a side. Think like a teacher with 30 restless children and 40 minutes of class time: every extra tap is a cost, every unclear state is chaos, every celebration second is precious.

## This run

- **FIRST GAME (recommended start):** process ONLY `05-focus-cards.md` (status `file-ready`). Then stop and summarize in chat so the owner can validate before continuing.
- **BATCH RUN:** process every file with status `file-ready`, in numeric order, stopping only if a file is missing its prelude or screenshots.

════════ PROMPT END ════════
