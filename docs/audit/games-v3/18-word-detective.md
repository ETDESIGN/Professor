# Word Detective — v3 Quality Audit (`WORD_DETECTIVE`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/18-word-detective-idle.png` — shows the §2 symptom: prompt renders "rock (岩石)" — Chinese inside the challenge.

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

- **Flow type:** `WORD_DETECTIVE`
- **Component:** `apps/board/templates/BoardWordDetective.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Skip (`SKIP_ITEM`) / Hint (`REVEAL_HINT`) / Correct (`MARK_CORRECT`) / Redo (`RESET_GAME`) / End (`SLIDE_COMPLETE`) — custom set, `ContextualControls.tsx:173-182`; the remote baton mirrors it (`TeacherRemote.tsx:534-546`)
- **Data sources:** `useEscalatingPool` (shell `WORD_DETECTIVE`, single round of up to 8 items) over `pool_items` of type `SPELL_CLOZE` / `MEANING_MATCH` / `IMAGE_SELECT` / `AUDIO_L1_SELECT` — all normalized into one prompt+options+correct-index MCQ shape; audio is reference-based (`useSpeech` resolves TTS at play time, whole round pre-warmed)
- **Mode:** picked student, per-item scored attempts

## §1 How the game works today

**A queue of up to 8 MCQ items; each item is its own scored attempt for the picked student.** The pool comes from `useEscalatingPool` (`:68-76`, mastery-gated objectives via `lessonDirector.buildRound`). Four exercise types are normalized into a common `VocabItem` (`:80-154`):

- **SPELL_CLOZE** — an example sentence with the target word blanked (`____`); four word options, pick the fit.
- **MEANING_MATCH** — prompt `"word" — which meaning fits?`; the options are Chinese meanings (sibling words' meanings as distractors).
- **IMAGE_SELECT** — the screen the owner described: prompt = `img.prompt`, and when `prompt_translation` exists it renders as `English (Chinese)` (`:113`); below it a **Listen** button, then a **2×2 grid of four square images** — the correct word's image plus 3 sibling-word images. Text-only IMAGE_SELECT rows are skipped (`:109-110`).
- **AUDIO_L1_SELECT** — "Listen — which meaning did you hear?" over Chinese meaning options.

Option order is **re-shuffled per turn** — seeded on `(unitId, turnId, resetCount)` so every tab deals the identical order while each new pick/reset re-deals (`:140-154`) — the anti position-patterning fix from 2026-08-30. The round's speech is pre-warmed in the background (`:167-169`).

**Attempt flow.** The prompt phase shows the sentence/blank + Listen + options. A correct tap: streak++ (confetti + streak cue at 3/5), `scoreForAttempt` triple-write on the picked student, a 700 ms "Complete sentence" reveal (blank filled with the answer + speech plays), then a 700 ms feedback card ("… nailed it!" + points) and auto-advance (`:222-267`). A wrong tap: −1 live penalty, streak reset, red flash 800 ms, try again; the **2nd consecutive miss reveals** — the correct option gets the amber ring + the item's `explanation` shows, ~2.2 s teaching hold, then advance (`:291-299`). MARK_CORRECT forces a clean success with `mistakesRef` preserved (`:305-339`). Running out of items → complete card + `SLIDE_COMPLETE` broadcast (`:341-356`).

**Remote controls:** Skip (next item, no penalty) / Hint (**50/50-style elimination** of one wrong option — dim/strike, seeded, never eliminates down to only the answer, `:200-211`) / Correct / Redo (full reset) / End. The board resets fully on every `currentTurnId` change (`:172-183`).

**Mirroring:** the commander embeds a live miniature of this same component via `BoardRenderer` (`apps/teacher/live/panels/BoardRenderer.tsx:18` renders `BOARD_MAP[type]` with the step's data) — so whatever the board shows (including the Chinese prompt) also appears on the teacher's commander screen. There is no per-item content panel beyond that.

**Empty state:** "No vocabulary items ready for this unit yet. Run the exercise generator for this unit, or skip to the next slide." — English-only (`:371-382`).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> We have a screen where the 4 images are set up in a square. This UI seems more adequate for a vertical screen, not horizontal. So we need to rethink the UI a bit to have better use of the space.

**Clarified with the owner (2026-09-09):**
- Horizontal-arrangement redesign (4-across row vs 2×2 + side prompt) = design decides via Co-Work/Stitch; constraint = images big, horizontal space used well.

> Basically we have four images, and we have a word written in English and in Chinese, as well as the sound (audio). First, the Chinese word shouldn't be there. The English word can be there, and the sound icon can be there, but definitely not the Chinese — otherwise it's too easy for the kids.

**Clarified with the owner (2026-09-09):**
- Remove the Chinese from the challenge — NOT just from the board: remove it EVERYWHERE during challenges, including the teacher's commander screen (owner decision 2026-09-09). English word + audio icon stay. (Note: the global rule was later softened to "avoid when possible" — this per-game decision stands for the answer-giving Chinese word; instructions elsewhere may still use Chinese when needed.)

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardWordDetective.tsx` unless noted.

- **F1 · P1 — The Chinese translation of the answer word is rendered inside the challenge.** For IMAGE_SELECT items the prompt line is built as `` `${img.prompt} (${img.prompt_translation})` `` (`:113`) — `prompt_translation` is the Chinese meaning of the very word the four images test (stamped at generation, `supabase/functions/generate-exercises/index.ts:134`). The kid sees 地面 next to "ground" and points at the matching picture: the task collapses to L1 reading. This is the exact §2 fix point, and because the commander mirrors the board component (`BoardRenderer.tsx:18`), fixing the component removes it from both surfaces at once — there is no separate commander-side render of the item content (verified: no `prompt_translation` read anywhere under `apps/teacher/`). Note the same field also feeds Sentence Lab's prompt (`21-sentence-lab.md` F1) — fix at generation or per-consumer.
- **F2 · P2 — The 2×2 square grid wastes the 16:9 stage.** Options render in `grid grid-cols-2 gap-4` with `aspect-square` image buttons inside a `max-w-3xl` centered card (`:418`, `:455`, `:463`). Four square images in two rows inside a ¾-width card leave ~40% of the projected width unused and roughly halve each image's possible area versus a 4-across row (or 4 landscape images) — the owner's "vertical-style layout wasting space on a horizontal screen". The sentence/Listen block also stacks above the grid, pushing images below the kids' eye line.
- **F3 · P2 — One generic MCQ frame wears four different tasks, with a wrong instruction label.** The header hardcodes "Fill in the blank" (`:421`) even for IMAGE_SELECT ("point at the picture") and AUDIO_L1_SELECT ("listen and pick the meaning") items, whose "sentence" is a bare word, not a cloze. The detective framing (context clue work) only genuinely applies to SPELL_CLOZE; the shell is really four mini-games behind one skin. A redesign should either split the loops visually or make the frame honest per type.
- **F4 · P2 — No auto-play and no remote path to audio.** Audio exists only as the board's Listen button (`:440-452`, `playAudio :358-362`); nothing plays when the item appears, and the commander/remote sets have no audio control (`ContextualControls.tsx:173-182`) — the same parity gap Focus Cards had before v3 (its fix added `PLAY_AUDIO`). Speech plays automatically only on the success reveal (`:263`).
- **F5 · P3 — MEANING_MATCH and AUDIO_L1_SELECT keep Chinese as the answer set.** Their options ARE Chinese meanings (`generate-exercises:103-116`; rendered as text options `:479-482`). That is the EN→L1 direction and arguably legitimate, but under §2's "remove the Chinese everywhere during challenges" this needs an explicit owner decision: drop these types from this shell, or keep them as a deliberate meaning-check rung (they are the only Chinese left once F1 is fixed).
- **F6 · P3 — Dead `translation` render path.** The prompt area renders `currentItem.translation` under the sentence (`:434-436`), but no branch of the normalizer ever sets `translation` (`:80-133`) — unreachable code that would re-introduce Chinese on the challenge if ever wired.
- **F7 · P3 — Empty state is English-only and teacher-facing** (`:371-382`: "Run the exercise generator for this unit…") — same bilingual/legibility gap as Grammar Lab F5; a shared bilingual empty-state component would fix all five games.
- **F8 · P3 — Streak/turn bookkeeping edges.** SKIP_ITEM advances without touching `streakRef` (streak survives skips — defensible but undocumented); the turn reset doesn't clear `lastAward` (a stale "+N" could flash on a feedback card in the next turn's first success before overwrite — cosmetic). Timer-based advances use bare `setTimeout` (no cancellable ref), so a Reset racing a reveal hold can double-advance — the same class of bug Grammar Lab fixed with `advanceTimerRef`.
- **F9 · P3 — Fixed `max-w-3xl` card, no responsive reflow** (`:418`) — no phone-landscape floor; `text-3xl` sentence + `text-2xl` options are at the low end for 5–8 m projection (compounds F2).

**What already works well (context — don't re-litigate):** per-turn seeded option shuffle (anti position-patterning, identical across tabs), 50/50 hint that never eliminates to a single option, reveal-on-wrong teaching beat with `explanation`, full lifecycle latches + per-item attempt resets, triple-write scoring with streak bonuses, reference-based audio with round pre-warm (nothing blocks on TTS), image/label separation for IMAGE_SELECT options, and the empty state never fake-completes.

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
