# Phonics Arena — v3 Quality Audit (`PHONICS_ARENA`)

> **Status:** **cowork-done** — §4 audited (Anti-Gravity). Ready for Stitch prompt §5.
> **Screenshots:** `screenshots/22-phonics-arena-idle.png` — empty state (no phonics items) — code-anchored.

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

- **Flow type:** `PHONICS_ARENA`
- **Component:** `apps/board/templates/BoardPhonicsArena.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** Next (`NEXT_ITEM`) / Correct (`MARK_CORRECT`) / Redo (`RESET_GAME`) / End (`SLIDE_COMPLETE`) — custom set, `ContextualControls.tsx:213-221` (no Hint, no audio control)
- **Data sources:** `useEscalatingPool` (shell `PHONICS_ARENA`, single round of up to 10 items) → `MINIMAL_PAIR_SWIPE` (rounds 1–2: 5 pairs, then the next 4 — or a replay of round 1's pairs when the pool is small) + `SPEAK_SENTENCE` (round 3, ×3); audio is reference-based (`useSpeech` + round pre-warm), round 3 uses browser speech recognition on the board tab
- **Mode:** picked student, per-item scored attempts (discriminate → identify → produce)

## §1 How the game works today

**A 3-round phonics ladder for the picked student: Discriminate → Identify → Produce.** Pool via `useEscalatingPool` (`:94-102`), bucketed from `MINIMAL_PAIR_SWIPE` + `SPEAK_SENTENCE` items (`:105-140`):

- **Round 1 "Discriminate" (×5):** a big red **Listen** button, then **two** large word buttons — the minimal pair `[word, confusable]` in stored order (`:176`). The kid taps which word they heard.
- **Round 2 "Identify" (×4):** the next 4 pairs (or round 1's pairs again when the pool has fewer than 9, so the round still happens, `:119-122`), now at **four** options — the pair plus 2 real distractor words drawn from the other pairs, shuffled with a per-item seed (`:174-184`).
- **Round 3 "Produce" (×3):** the target word is displayed large (`text-4xl`) with a "Listen first" button, then a **mic button on the board** — the picked kid speaks; `useSpeechRecognition` scores Levenshtein similarity against the target, ≥60% passes (`SPEECH_PASS_THRESHOLD`, `scoringUtils.ts:67`); pass → success with partial credit = similarity (clamped 0.6–1) and a ~2 s transcript/score card; fail → item failure (`:283-296`, `:547-613`).

**Audio flow today — strictly manual, unmetered.** `playAudio` just calls `playCurrentSpeech()` (`:351-355`): nothing auto-plays on item appear, and replays are **free and unlimited** — Sound Lab's replay-count/−1 machinery was never ported here. The spoken text is `prompt_text || correctWord` (`:60`), and `correctWord` is resolved through one audited chain (MCQ option at `correct_index`, else the pair member, else `pair[0]`) so the audio and the validated answer can't diverge (`:48-64`). The round's speech is pre-warmed (`:155-157`).

**Attempt flow.** Correct tap: `itemSuccess` — streak++ (confetti at 3/5), `scoreForAttempt` triple-write (difficulty: productive fallback 2), 900 ms hold, advance (`:187-215`, `:357-373`). Wrong tap: −1 live, streak reset, red flash 800 ms; 2nd consecutive miss → reveal-on-wrong (amber ring on the correct word + `explanation` when present, ~2.2 s teaching hold) then advance (`:237-248`, `:370-371`). MARK_CORRECT scores a clean success and doubles in round 3 as "accept that pronunciation" (`:264-273`). Rounds chain 1→2→3; empty rounds are skipped by an effect that can't fake a completion (`:163-169`); all done → target card + final streak + `SLIDE_COMPLETE` broadcast (`:253-259`).

**Remote controls:** Next (advance the current item) / Correct / Redo (full reset) / End. No Hint, no Listen — see F4.

**Empty state:** "No phonics items ready yet — run the exercise generator for this unit, or skip to the next slide." — English-only (`:423-434`).

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> Same as for the previous listening game: every time we need to press the button. We can keep the button (we can press it), but when the screen appears, we should automatically hear the word we should click.

**Clarified with the owner (2026-09-09):**
- Target audio AUTO-PLAYS once when the question appears; the manual replay button stays.
- Replays follow Sound Lab's rule: −1 point each to the current picked student after the free first play.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardPhonicsArena.tsx` unless noted.

- **F1 · P1 — Round 1's answer is always the left button and the audio always speaks it: "tap left" wins without listening.** Generation stamps every `MINIMAL_PAIR_SWIPE` with `prompt_text: word`, `options: [{text: word}, {text: confusable}]`, `correct_index: 0` (`supabase/functions/generate-exercises/index.ts:159-164`). The board resolves `speechText = prompt_text || correctWord` → always the vocab word (`:60`), and `currentWords` for round 1 is `[word1, word2]` in stored order with **no shuffle** (`:176`; only round 2 shuffles, `:183`). So the spoken word is always the pair's first member, which always renders left: the discrimination task the round is named for (telling *ship* from *sheep*) never happens — only one member is ever played, and its position is constant. A kid can score 100% of round 1 with eyes shut tapping left. Fix needs both halves: vary the played member at generation/deal time (sometimes the confusable, `correct_index` following) AND shuffle the 2-option order per item (the seeded `makeRng` pattern round 2 already uses).
- **F2 · P2 — No auto-play on item appear (§2's headline ask).** Nothing triggers `playCurrentSpeech()` when a question enters the board — every item starts in silence until the board's Listen is tapped (`:351-355` is the only play path). Hook point: an effect keyed on `currentItem` (the same key `useSpeech` resolves on, `:148-152`) that plays once on round 1/2 appear — ideally after a ~300 ms settle so the slide-in animation isn't fighting the audio — mirroring the fix Sound Lab needs (`19-sound-lab.md` F1). Browser autoplay policy is satisfied by the teacher's earlier gestures on the board tab (same reliance as `playCue`).
- **F3 · P2 — No replay accounting at all: replays are free and unlimited.** §2's clarified rule (replays follow Sound Lab: −1 each after the free first play) is wholly unimplemented — there is no `replayCount` state in this component. The port is mechanical: copy Sound Lab's meter (`BoardSoundLab.tsx:256-265`) into `playAudio`, reset the counter in `advanceCurrentRound`/`advanceRound3` (both currently skip it, `:375-411`), and surface the −1 cost on the button.
- **F4 · P2 — The teacher cannot play the audio from the commander or the phone.** The contextual set is Next / Correct / Redo / End (`ContextualControls.tsx:213-221`) — for a listening-first game the replay action exists only as a board tap. A `PLAY_AUDIO` action routed into `playAudio()` (which F3 meters) gives the remote path the classroom model requires; same gap as Sound Lab F3.
- **F5 · P2 — Round 3 has no failure exit on the board.** A failed speech attempt calls `itemFailure` (−1) but neither reveals nor advances (`:292-294`); the recognition hook keeps listening, so a kid who can't produce the sound bleeds −1 per attempt until the teacher uses Correct/Next. Rounds 1–2 reveal on the 2nd miss (`:370-371`) — no mercy rule for production. Browser-unsupported mics render a static "not supported" note whose only exit is also the remote (`:571-575`).
- **F6 · P3 — Round 2 replays round 1's pairs when the pool is small** (`:119-122`) — a deliberate anti-skip fallback, but it means short units hear the SAME audio and pairs twice within one slide, back to back; with F1 unshuffled the replay inherits the tap-left exploit for kids who saw round 1.
- **F7 · P3 — Round chrome is teacher-jargon and sub-projection.** The round pips are `w-3 h-3` (12 px — invisible at 5–8 m, `:454-462`); the captions read "Round 1: Discriminate / Round 2: Identify / Round 3: Produce" (`:464-466`) — metalinguistic labels meaningful to teachers, not to 6–12-year-olds; empty state is the shared English-only card (`:423-434`).
- **F8 · P3 — Fixed `max-w-3xl` card, no responsive reflow** (`:488`) — no phone-landscape floor; the 2-option round renders two narrow buttons in a ¾-width card, wasting the stage (a wide side-by-side pair layout would also serve the discrimination task better).

**What already works well (context — don't re-litigate):** the single-source-of-truth `correctWord` resolution (audio can no longer speak pair[0] while the answer is elsewhere — a past bug class), round 2's real distractors + seeded shuffle, the discriminate→identify→produce ladder with correct difficulty tagging, per-item resolve latches stopping stale speech results and double taps, reveal-on-wrong teaching beats in rounds 1–2, round speech pre-warm, empty-round skipping that can't fake a victory, and MARK_CORRECT doubling as pronunciation acceptance.

## §4 ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design

- **P1 — Narrow vertical card wastes the 16:9 widescreen stage.** **Evidence:** `screenshots/22-phonics-arena-idle.png` and §3 F8 (`BoardPhonicsArena.tsx:488`). Round 1 renders two narrow, stacked or small buttons inside a constrained `max-w-3xl` card. For a minimal pair discrimination task (e.g. *ship* vs *sheep*, *bat* vs *bet*), the board should feature two massive, high-contrast, landscape arcade choice plates placed side-by-side across the entire 16:9 projection surface.
  *Recommendation:* Redesign Round 1 as a dramatic "Sound Duel": two massive, tactile choice tablets placed side-by-side across the horizontal canvas, flanked by an animated acoustic soundwave emitter.

- **P1 — Metalinguistic teacher jargon and microscopic progress dots.** **Evidence:** §3 F7 (`BoardPhonicsArena.tsx:454-466`). The header displays academic labels (*"Round 1: Discriminate / Round 2: Identify / Round 3: Produce"*) accompanied by tiny 12px dots (`w-3 h-3`). These SLA terms mean nothing to 6–12-year-old students.
  *Recommendation:* Replace with kid-friendly, gamified arena tiers:
  - Tier 1: `⚔️ Sound Duel (2 Choices)`
  - Tier 2: `🥊 Sound Arena (4 Choices)`
  - Tier 3: `🎤 Voice Champion (Say it!)`

- **P2 — Retract 240px leaderboard rail in Choral mode.** **Evidence:** `screenshots/22-phonics-arena-idle.png`. The screenshot shows 8 students at 0 points occupying a 240px rail on the right during a whole-class choral round. Retracting this rail gives the Duel and Arena choice cards full horizontal projection width.

- **P2 — Clear top-left chrome safe zone.** Provide generous padding to prevent collision with `BoardShell`'s absolute `• WARM-UP` badge at `top-5 left-6`.

### 4.b Workflow & user flow (teacher's path: start → turns → end)

- **P1 — Fatal "Tap-Left" Exploit Destroys Discrimination Learning (§3 F1).** **Evidence:** §3 F1 (`generate-exercises/index.ts:159-164, BoardPhonicsArena.tsx:60, 176`). In Round 1, exercise generation always stamps `correct_index: 0` and the options array `[word, confusable]` is rendered in stored order without shuffling. Simultaneously, `playAudio` always resolves to `pair[0]` (the first word). As a result, **the spoken word is ALWAYS the left button, and the left button is ALWAYS correct!** A child can close their eyes, tap the left card 5 times, and score 100% without listening to a single phoneme. The core pedagogical purpose of the game is completely bypassed.
  *Recommendation:* Fix both halves: (1) Randomly select whether the audio plays word A or word B, updating `correct_index` accordingly; (2) Apply a seeded turn-based shuffle to the two option cards so position is unpredictable.

- **P1 — Missing auto-play on question appearance (§2 Owner Requirement).** **Evidence:** §2 owner comments and §3 F2 (`BoardPhonicsArena.tsx:351-355`). Currently, every question mounts in complete silence. The class must wait for the teacher to physically walk to the screen and tap the "Listen" button.
  *Recommendation:* Auto-play the target sound once upon item deal (first play free). The room hears the sound immediately upon card transition.

- **P1 — Missing replay metering with −1 penalty (§2 Owner Rule).** **Evidence:** §2 owner comments and §3 F3. Replays in Phonics Arena are currently completely unmetered and free.
  *Recommendation:* Port Sound Lab's replay metering logic: auto-played initial play is free; each subsequent manual replay docks the picked student −1 point. Surface the `"-1 pt"` cost clearly on the replay button.

- **P1 — Missing remote audio control for teacher.** **Evidence:** §3 F4 (`ContextualControls.tsx:213-221`). Neither the phone Remote Baton nor Commander contextual controls provide an audio replay trigger.
  *Recommendation:* Wire a dedicated `PLAY_AUDIO` action to the Remote Baton and Commander so the teacher can trigger replays while moving around the classroom.

- **P2 — Round 3 (Speech Production) lacks a 2-miss mercy exit.** **Evidence:** §3 F5 (`BoardPhonicsArena.tsx:292-294`). In Round 3, if a student mispronounces a word or background noise prevents speech recognition from passing, the item loops indefinitely, docking −1 point on every attempt with no exit.
  *Recommendation:* Implement the 2-miss mercy scaffold: after 2 consecutive failed speech attempts, display the target word, play the native audio pronunciation, award 0 points, and auto-advance.

### 4.c Pedagogical practice (ESL ages 6–12)

- **P1 — Phonemic Contrast Perception (Minimal Pairs).** For Chinese primary students, phonological contrasts such as short vs. long vowels (/ɪ/ vs /iː/ in *ship/sheep*) and fricatives vs. stops (/θ/ vs /s/ in *think/sink*) do not exist in L1 Mandarin phonology. Minimal pair discrimination is foundational to developing English phonological representations.
  *Recommendation:* Visually emphasize the contrasting grapheme in each word (e.g. bolding or coloring `sh[i]p` vs `sh[ee]p`) to reinforce sound-to-spelling correspondence.

- **P2 — The Phonics Progression (Discriminate $\rightarrow$ Identify $\rightarrow$ Produce).** Preserving this 3-tier phonics ladder is sound pedagogy:
  1. *Tier 1 (Binary Duel):* Focuses working memory on pure acoustic discrimination between two confusable sounds.
  2. *Tier 2 (Arena):* Expands to 4 options with distractors, testing lexical identification.
  3. *Tier 3 (Voice Champion):* Demands active articulatory production.

- **P3 — Immediate Contrastive Audio Feedback on Errors.** When a child selects the incorrect word, play both sounds in contrast: *"You tapped: SHIP. The word was: SHEEP."* Hearing the immediate acoustic difference calibrates phonemic perception.

### 4.d Game interaction (mechanic, pacing, fairness, fun)

- **P2 — "Sound Arena / Sonic Duel" Gamification:**
  - Style Round 1 as an electric "Sound Duel ⚔️" with two massive cards facing off like arcade fighting game pads.
  - Tapping the correct card triggers a punchy impact sound, an emerald shockwave ring, and celebratory particle sparks.
  - Replays styled as a glowing "Sonic Radar" with transparent point metering badges.

### 4.e Top-5 prioritized recommendations

1. **P1 — Eliminate the Round 1 "Tap-Left" Exploit (F1):** Shuffle option card order and randomize whether the target audio plays the primary word or the confusable mate.
2. **P1 — Auto-Play Audio on Item Mount (F2, §2):** Play target pronunciation once for free upon item deal.
3. **P1 — Implement Replay Metering (−1 per replay after free first play) (F3, §2):** Port Sound Lab's replay penalty engine and badge the Listen button.
4. **P1 — Rebuild Round 1 as a Wide 2-Card Horizontal Duel (4.a, F8):** Replace narrow cards with two massive, side-by-side landscape choice plates.
5. **P2 — Add 2-Miss Mercy Scaffold to Round 3 Speech Recognition (F5):** Prevent infinite point bleeding on failed pronunciation attempts.

### 4.f Design direction for Stitch (style/mood guidance + the 3–5 key screens/states to design; what to KEEP from the current design)

**Mood and visual system.** Design this as an electric "Sonic Arena / Phonics Stadium". Deep stadium navy background (`#0B132B`), electric scarlet (`#EF4444`) for duel accents, radiant cyan (`#38BDF8`) for acoustic shockwaves, neon emerald (`#10B981`) for correct hits, and warm gold (`#F59E0B`) for streak celebrations. Cards should feel like substantial arcade fighting pads with bold typography and glowing neon rims.

**Mock up these four board screens/states (16:9 projector, no scrolling):**

1. **Screen 1 — Round 1: Sound Duel (Auto-Playing):**
   - Retracted leaderboard rail (full-bleed 16:9 stage).
   - Top Header: `[⚔️ Tier 1: Sound Duel (Active)] → [🥊 Tier 2: Sound Arena] → [🎤 Tier 3: Voice Champion]`, Alice's turn badge.
   - Center Stage: Pulsing cyan sonic speaker visualizer with acoustic shockwaves: *"Listen carefully... 👂"*.
   - Main Stage: Two massive landscape choice tablets side-by-side:
     - Left Tablet: `"SHIP"` (with `I` highlighted in cyan).
     - Right Tablet: `"SHEEP"` (with `EE` highlighted in cyan).

2. **Screen 2 — Replay State (Metered):**
   - Speaker idle.
   - Center Button: Sleek purple pill: `"Replay Audio 🔊"` with a glowing amber badge: `"-1 pt"`.
   - The two duel cards active and pulsing, awaiting student input.

3. **Screen 3 — Round 2: Sound Arena (4 Options):**
   - Header: Tier 2 active.
   - Stage: 4 landscape cards arranged in a sleek 1×4 horizontal row: `SHIP`, `SHEEP`, `CHIP`, `SHOP`.

4. **Screen 4 — Round 3: Voice Champion (Speech Production):**
   - Header: Tier 3 active.
   - Center: Target word `"SHEEP"` in massive 8xl display type.
   - Microphone interface: Glowing cyan recording ring with live waveform and prompt: *"Your turn! Say the word 🎤"*.
   - Bottom: Teacher override chip `"Tap to Accept / Mark Correct"`.

**What to KEEP from current design.** Retain the 3-round phonics ladder progression, the single-source-of-truth `correctWord` resolution, background speech pre-warming, and empty-round skipping logic.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
