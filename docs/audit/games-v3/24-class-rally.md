# Class Rally (co-op) — v3 Quality Audit (`CLASS_RALLY`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/24-class-rally-idle.png`.

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

- **Flow type:** `CLASS_RALLY`
- **Component:** `apps/board/templates/BoardClassRally.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** custom — CHORAL_ROUND ("ALL ANSWER") / SKIP_ITEM ("Next") / MARK_CORRECT ("Correct") / RESET_GAME ("Reset Rally") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:241-250`)
- **Data sources:** `useBoardPool` mixed MCQ types — MEANING_MATCH / IMAGE_SELECT / SPELL_CLOZE / LISTEN_SELECT / ERROR_SPOT / STORY_COMPREHENSION — class-weak first, roster-scoped, limit 24 (`:79-85`)
- **Mode:** cooperative class (shared rally bar) with the picked student answering; choral sub-mode via ALL ANSWER

## §1 How the game works today

**The whole class works together toward one goal: fill the rally bar with 12 correct answers.** The bar never drops — wrong answers cost the individual responder a point but never undo class progress. A picked student answers one mixed question at a time; every correct (or teacher-override, or strong choral) answer fills the bar +1.

**Rally bar + milestones.** A horizontal bar (`TARGET_CORRECT = 12`, `:45`) with milestone nodes at 25/50/75/100% that flip from ☆ to ★ as progress passes them (`:384-394`). Crossing a milestone fires a ≤900ms full-screen celebration overlay ("25% milestone!" / "RALLY COMPLETE!") + confetti (`:173-184`) — deliberately compressed dead-time.

**Question phase.** One white card: the prompt (sentence/prompt/sentence_with_blank/prompt_text fallback chain, `:103`) + optional "Listen" audio button + a 2-column options grid. IMAGE_SELECT items render image cards; every other type renders text rows. A tap on the correct option → `resolveCorrect`: `scoreForAttempt(mistakes, difficulty)` points to the picked student (`addPoints` + `logAttempt`), the responder's personal streak tally bumps (cue + confetti at 3 and 5 — no scoring multiplier, "the bar is collective"), the bar fills, a ≤900ms feedback beat plays, then the next question — or victory at 12. A wrong tap → wrong cue, streak reset, live −1 `MISTAKE_PENALTY` + `logAttempt(incorrect)`, bar unchanged; a second miss triggers reveal-on-wrong: the correct option takes an amber ring + explanation card, then advance after a 2.2s teaching hold. **Correct** (MARK_CORRECT) scores the open question as a clean correct through the same path (mistakes preserved).

**Choral sub-mode (ALL ANSWER).** CHORAL_ROUND (remote button or the flow) swaps the question card for a big "📣 EVERYONE! — The whole class answers together!" stage: the prompt + a readable, non-interactive options preview, and two large board buttons — "✓ CLASS NAILED IT" / "✗ NEEDS PRACTICE" (the remote's Correct/Skip double as the same marks during choral, `:150-156`). A strong mark plays the correct option, fills the bar, and writes a roster-wide `recordChoralReview('strong')` (the FSRS signal for every student — same as LiveClassWarmup); a weak mark reveals the answer + explanation, changes nothing, and moves on. No individual points flow in choral mode.

**Victory.** At 12 corrects: a trophy "RALLY COMPLETE!" screen, win cue, confetti, and a natural `SLIDE_COMPLETE` broadcast (the commander ignores natural completions — the teacher decides when to move on). **End** (forced) jumps to the victory screen directly.

**Turn & controls lifecycle.** A new wheel pick resets only the per-question attempt refs (`mistakesRef`, `awardedRef`, selection, phase) — the bar, milestone state, and personal streak tallies persist across picks within the slide, because they are *class* progress (`:117-125`). **Next** (SKIP_ITEM) advances the question (or marks a weak choral during choral). **Reset Rally** (RESET_GAME) wipes everything: bar to 0, streaks cleared, question 0 (`:131-142`). Questions wrap via `questionIdx % questions.length` (`:113`) when the pool runs out before the goal.

**Empty/loading states:** "Loading rally questions…" while the pool fetches; "No rally questions ready for this unit yet. Run the exercise generator…" when the pool yields none.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> This game is quite all right, but a big issue is we see a word and we need to pick up the proper vocabulary card — but on each card they also have the word written. So it's too simple: it's writing "rock" and I know the card with "rock" written on it is the right one. So we need to remove those vocabulary names on the cards — otherwise it's too easy.

**Clarified with the owner (2026-09-09):**
- Option cards show the IMAGE ONLY — no word labels on the cards.
- Audio-on-tap is acceptable as a controlled (hint-level) interaction.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardClassRally.tsx` unless noted.

- **F1 · P1 — Image option cards carry the word label, making IMAGE_SELECT items a reading-match, not recall.** The image-card branch renders the picture *plus* the label text under it: `{option.label && <span className="text-sm text-gray-700">{option.label}</span>}` (`:550`; card scaffold `:543-551`). The generator stamps IMAGE_SELECT options as `{image_url, label: word}` with the correct option's label being the prompt's own word (`supabase/functions/generate-exercises/index.ts:131-132`) — so the prompt says "rock" and the card with "rock" written on it is the answer. §2 verbatim. The label also leaks into the choral options preview (`:486-493`). The fix seam is one render line (`:550`) — keep `alt={option.label}` for accessibility, drop the visible text; note §2's acceptable replacement interaction (audio-on-tap) is *not* currently wired — option buttons are silent; only the prompt has a Listen button.
- **F2 · P2 — Option images are `object-cover`-cropped inside square pods.** Image cards are `aspect-square` with `object-cover` (`:530`, `:548`), and the choral preview uses fixed `w-14 h-14 object-cover` (`:488`) — square-cropping the typically landscape vocab art. Same crop family the owner just flagged on Story Quest (20-story-quest F1) and at odds with the 2026-09-10 landscape-card design rule.
- **F3 · P2 — Mixed-type stream can render a question with no visible prompt.** The prompt is whatever the content-field fallback chain yields (`:103`); an audio-led type (e.g. LISTEN_SELECT) whose text fields are empty would show only a bare "Listen" button above the options — no question text on screen. Needs per-unit content verification, but the component has no empty-prompt guard.
- **F4 · P3 — Scoring drift from the unified model: no streak argument.** `resolveCorrect` calls `scoreForAttempt(mistakesRef.current, difficulty, 1.0)` without the streak (`:192`), so the streak bonus (+1/+2 at 3/5) never applies in rally — the code comment frames this as deliberate ("the bar is collective"), and personal streaks still fire cues/confetti, but the payout curve differs from every other scored game.
- **F5 · P3 — Award-count wheel rotation churns the responder.** Every correct answer is a positive `addPoints` to the current responder, so with the sidebar wheel's EVERY_1 mode (`store/SessionContext.tsx:1565-1581`) a new student is auto-picked after *every* correct — mid-feedback-hold the turn refs reset and the phase snaps back to 'question'. The bar persists (correct for a co-op game), but the responder carousel is fast; same seam as 25-fast-vocab F1.
- **F6 · P3 — No path to victory short of 12 corrects.** The goal is fixed (`:45`); a struggling class grinds repetitions (the pool wraps, `:113`) and the teacher's only exits are **End** (forced-complete, `:164-167`) or **Reset Rally** (wipes all progress). No time-box, no adjust-target control.
- **F7 · P3 — Turn context disappears outside the question phase.** The in-game picked-student footer renders only when `phase === 'question'` (`:625`); during choral/feedback the game surface drops the whose-turn cue (the BoardShell footer banner still shows it — also duplicating it during question phase).
- **F8 · P3 — Chrome/palette.** Light fuchsia-on-white palette vs the shell's dark PRACTICE wash; the 240px leaderboard rail stays up during the co-op game (`BoardShell.tsx:41,112` — CLASS_RALLY not in FULL_BLEED_TYPES), which for a class-goal game is arguably the right chrome but costs the question card ~240px of width on 16:9.

**What already works well (context — don't re-litigate):** the cooperative bar that never punishes (individual penalty only), milestone nodes with compressed ≤900ms celebrations, reveal-on-wrong with the explanation teaching beat, the choral tier with roster-wide `recordChoralReview` FSRS writes and remote Correct/Skip dual-marking, per-question attempt-ref hygiene with the bar correctly persisting across picks, string/object option normalization (no "[object Object]" rows), and dead-button avoidance throughout.

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)
### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
