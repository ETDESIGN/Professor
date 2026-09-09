# Word Detective — v3 Quality Audit (`WORD_DETECTIVE`)

> **Status:** **cowork-done** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
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

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Off-screen clipping of bottom images in 2×2 vertical stack.** **Evidence:** `screenshots/18-word-detective-idle.png`, §2 owner comments, and §3 F2 (`BoardWordDetective.tsx:418, 455, 463`). The template renders four square image choices in a 2×2 grid stacked below the title, prompt, and "Listen" button inside a narrow `max-w-3xl` card. Because the vertical height budget is consumed by this stacked layout and the bottom margin is clamped, **the bottom two images are cut off entirely** by the projector bezel. In `18-word-detective-idle.png`, only the top row (forest and coastal cliff) is visible; options 3 and 4 are completely invisible to the classroom.
  *Recommendation:* Redesign for 16:9 horizontal projection: arrange the 4 options in a single horizontal row (1×4 landscape card layout, ~4:3 aspect ratio per card) or split the canvas into a left Clue Panel (word + audio) and a right 2×2 Evidence Grid, ensuring all 4 options are 100% visible without scrolling.

- **P1 — Chinese translation displayed inside the active challenge (§2 Owner Bug).** **Evidence:** `screenshots/18-word-detective-idle.png` and §3 F1 (`BoardWordDetective.tsx:113`). In `IMAGE_SELECT`, the prompt renders as: `rock (岩石)`. Presenting the Simplified Chinese translation in parentheses directly beside the target English word short-circuits the learning task: children read the Chinese word `岩石`, bypass English auditory and lexical recall, and simply match Chinese text to the picture of a rock.
  *Recommendation:* Strip `(${img.prompt_translation})` completely from the challenge display across all surfaces (Board and Commander). The prompt must display only the English target word (`rock`) alongside an audio speaker icon.

- **P2 — Inaccurate "Fill in the blank" sub-label on image tasks.** **Evidence:** `screenshots/18-word-detective-idle.png` and §3 F3 (`BoardWordDetective.tsx:421`). The header displays the static sub-label "Fill in the blank" even when the challenge is an `IMAGE_SELECT` task featuring a solitary vocabulary word with no blank and no sentence. This creates confusion for teachers and students alike.
  *Recommendation:* Make the instruction header dynamic based on the active item type: *"Look at the clue and pick the matching picture"* for `IMAGE_SELECT`, *"Complete the sentence"* for `SPELL_CLOZE`, and *"Listen and pick the meaning"* for `AUDIO_L1_SELECT`.

- **P2 — Retract 240px leaderboard rail in Choral mode.** **Evidence:** `screenshots/18-word-detective-idle.png`. The screenshot shows 8 students at 0 points occupying a 240px rail on the right during a whole-class choral round. Retracting this rail gives the 4 image cards the horizontal width needed for high-resolution projection.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Missing auto-play and remote audio trigger.** **Evidence:** §3 F4 (`BoardWordDetective.tsx:440-452`). When a new vocabulary clue mounts, audio does not auto-play. The teacher must physically walk to the board and tap the blue "Listen" button. Furthermore, neither the phone Remote Baton nor Commander contextual controls provide an audio replay button.
  *Recommendation:* Auto-play the English word pronunciation once upon item mount, and add a dedicated `Replay Audio / 重新播放` button to both the Remote Baton and Commander.

- **P2 — Unmanaged advance timers risk turn-bleeding.** **Evidence:** §3 F8 (`BoardWordDetective.tsx:254-266`). The 700ms success feedback and 2.2s reveal timeouts use bare `setTimeout` calls without cancellable refs. If a teacher resets or picks a new student via the wheel while a timer is ticking, the previous turn's callback can fire mid-deal, causing a sudden unexpected auto-advance.
  *Recommendation:* Wrap all transition timers in a cancellable `advanceTimerRef` that aborts cleanly on `currentTurnId` change or manual reset.

- **P3 — Clean differentiation of the four underlying item types.** **Evidence:** §3 F3. The shell serves 4 distinct exercise types under one uniform card. Distinct visual cues (e.g. a magnifying glass icon for vocabulary image matching vs. a book icon for sentence cloze) will help the class instantly recognize the task format.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Direct Lexical-to-Visual Binding vs. Translation Crutches.** In ESL instruction, young learners must develop immediate lexical access (connecting the English acoustic form /rɒk/ and orthographic form `rock` directly to the mental concept of a rock). Showing `(岩石)` reinforces reliance on translation rather than developing native-like conceptual fluency. Removing Chinese from the challenge surface forces active lexical retrieval.

- **P2 — Contextual Detective Scaffolding in Cloze Tasks.** For `SPELL_CLOZE` items, ensure the sentence provides meaningful context clues rather than abstract syntax. For example, *"The mountain climber rested on a large, hard [____]."* teaches children how to use surrounding context to deduce meaning—true "detective" work.

- **P2 — Retain Non-Revealing 50/50 Hint Mechanic.** **Evidence:** §3 "What already works well" (`BoardWordDetective.tsx:200-211`). The current hint implementation strikes through and dims one incorrect distractor without revealing the correct answer. This scaffolds student reasoning without giving away the solution.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — Gamified "Detective Agency" Theme:**
  - Frame the challenge as "Case File #N".
  - Options are "Evidence Photos".
  - Tapping the correct card stamps a glowing green "CASE SOLVED 🔍" seal on the card with particle confetti at streak milestones.
  - Incorrect selections trigger an amber "Cold Trail / Try Again" shake.

- **P3 — Smooth Turn Transitions and Celebration:** Keep the rapid 700ms celebratory feedback card on correct answers; it keeps energy high and maintains class momentum.

### 4.e Top-5 prioritized recommendations

1. **P1 — Remove Chinese Translation from Challenge Prompts (F1, §2):** Strip `(${img.prompt_translation})` so the task tests English lexical recall rather than L1 reading.
2. **P1 — Rebuild Board to a Horizontal 1×4 Row to Eliminate Image Clipping (F2, §2):** Ensure all 4 options are fully visible on 16:9 projector screens with zero vertical clipping.
3. **P1 — Auto-Play Clue Audio on Mount and Wire Remote Replay (F4):** Play native pronunciation upon card deal and provide remote-control audio triggers.
4. **P2 — Make Task Sub-Labels Dynamic (F3):** Replace the static "Fill in the blank" label with accurate instructions matching the active exercise type.
5. **P2 — Add Cancellable Transition Timers (F8):** Prevent timer-bleeding across student turns during wheel spins and manual resets.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as a playful "Junior Detective Agency / Mystery Casebook". Deep noir slate background (`#0F172A`), bright magnifying cyan (`#38BDF8`) for active clues, warm amber (`#F59E0B`) for investigation highlights, neon emerald (`#10B981`) for solved cases, and crisp white typography. The UI should evoke top-secret dossiers, magnifying glasses, and evidence cards.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Active Clue / Fresh Deal (IMAGE_SELECT):**
   - Header: "Word Detective · Case 1 of 6 · Find the matching evidence", Alice's turn badge, phase clearance top-left.
   - Clue Stage: Prominent evidence card displaying the English word `"ROCK"` in bold display font, with a pulsing blue speaker visualizer emitting acoustic ripples. (No Chinese text).
   - Evidence Stage: 4 large, landscape photo cards (~4:3 aspect ratio) arranged in a sleek horizontal row: Forest, Coast/Rock, Desert, Mountain.

2. **Screen 2 — Hint Activated (50/50 Elimination):**
   - Distractor card #1 ("Forest") is stamped with a subtle gray "RULED OUT ✖" badge and dimmed to 40% opacity.
   - Remaining 3 cards pulse gently, narrowing the field for the student.

3. **Screen 3 — Case Solved (Emerald Match Lock):**
   - Card #2 ("Coast/Rock") locks with an emerald border and a glowing gold "CASE SOLVED 🔍" stamp.
   - Floating celebration badge: `"+1 Point! 🔥 Streak 3!"` with particle sparkles.
   - Audio playing native pronunciation: *"Rock!"*.

4. **Screen 4 — Sentence Cloze Challenge (SPELL_CLOZE):**
   - Evidence Dossier displaying a sentence with a glowing blank clue: *"The climber sat on a large [____] to rest."*.
   - 4 horizontal word tablet options below: `A. rock`, `B. river`, `C. cloud`, `D. leaf`.

**What to KEEP from current design.** Retain the per-turn seeded option shuffling, the 50/50 non-revealing hint mechanic, the 2-miss teaching reveal ladder with explanations, and the triple-write scoring contract.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
