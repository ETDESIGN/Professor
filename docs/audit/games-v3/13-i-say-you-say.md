# I Say You Say — v3 Quality Audit (`I_SAY_YOU_SAY (alias SPEAKING)`)

> **Status:** **file-ready** — §0–§3 audited (agent-parallel 2026-09-10) + §2 confirmed + screenshots captured. Ready for Anti-Gravity §4.
> **Screenshots:** `screenshots/13-i-say-you-say-idle.png`.

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

- **Flow type:** `I_SAY_YOU_SAY`, alias `SPEAKING` (orchestrate-lesson emits the block as `SPEAKING`, `orchestrate-lesson/index.ts:191-197`; both types map to this component in `boardMap.tsx:76-77`)
- **Component:** `apps/board/templates/BoardISayYouSay.tsx` (463 lines)
- **Phase:** PRACTICE (`PHASE_FOR_TYPE`, `orchestrate-lesson/index.ts:298,304`)
- **Remote-control group:** custom — commander: **Mark Correct / Replay / Skip / Next / End** (`ContextualControls.tsx:371-382`); remote: **Correct / Replay / Skip / Next** (no End — the global nav chevron covers it, `TeacherRemote.tsx:413-434, 830-847`)
- **Data sources:** phase 1 — `useEscalatingPool` (`MINIMAL_PAIR_SWIPE`, round size 5); phase 2 — `useEscalatingPool` (`SPEAK_SENTENCE`, round size 4) with a frozen `data.items` inline fallback that no current generator produces; audio URLs are stored TTS assets on the pool content (`audio_url` / `target_audio`)
- **Mode:** phase 1 discrimination scored on the picked student (full lifecycle, triple-write); phase 2 choral drill — deliberately unscored (pronunciation capture deferred)

## §1 How the game works today

The slide is a two-phase speaking drill, ordered receptive-before-productive. **Phase 1 "Sound Check"** is a scoreable sound-discrimination round: up to five minimal-pair items from the exercise pool. Each item shows a big blue circular play button — tapping it plays the item's stored word audio (or synthesizes the word as fallback) — and two huge option cards (256px) with the confusable pair, e.g. "penguin" vs a near word. The class listens and shouts which word they heard; the picked student's answer is relayed by the teacher tapping a card on the board.

**Discrimination scoring follows the full lifecycle contract.** A correct tap locks the board green, plays the success cue, increments a cross-item streak (confetti at 3 and 5), awards `scoreForAttempt(mistakes, difficulty, streak)` via `addPoints` on the picked student, and triple-writes `recordAttempt` (analytics) + `gradeObjective` (FSRS). A miss deducts the −1 mistake penalty live, double-writes the incorrect attempt, and enters a ~2.2s teaching beat — "You heard: 〈correct word〉" plus the item's explanation when present — then auto-advances (a timer latch prevents a teacher "Next" during the hold from double-advancing). A "Next Sound"/"Start Speaking Practice" button appears after each reveal; the remote's Mark Correct force-awards an oral answer, Skip jumps to the next sound. A new wheel pick or RESET rewinds to sound 1 with fresh refs — including mid-choral picks, a previously-fixed bug called out in the code.

**Phase 2 is the choral "listen & repeat" drill the owner's comment describes.** Up to four sentence items walk a whole→part→whole cycle per item: **"Everyone listen…"** (full sentence shown at 7xl, play button speaks it), **"Focus on the word"** (the target word alone at 9xl, still plays the full-sentence audio), **"One more time"** (sentence again, target word highlighted in yellow at scale). A persistent banner — "Speaking Practice — Listen & Repeat Together" — replaces the old fake waveform with an honest "this is not being scored" signal (deliberate: pronunciation capture is deferred). Advancing is teacher-paced via the board's "Next →" / "Finish" button or the remote's Next; nothing auto-completes the slide — the teacher's End (or the global nav chevron) closes it.

**Where the content comes from:** both phases pull live from the escalating pool (weak objectives first). Discrimination items carry a stored per-word `audio_url` (word audio — stable, since words are rarely rewritten). Choral items carry `target_sentence` (the vocab word's current example sentence) and `target_audio` — a stored MP3 that the exercise generator fills from the vocabulary row's example-sentence audio, falling back to the word's audio. The choral play button prefers that stored URL and only falls back to synthesizing the displayed text when the URL is missing or fails to play.

**Empty states:** while the pool loads the board shows "Loading speaking drills…"; if a unit has neither discrimination nor choral items it shows "No speaking drills available. Generate the exercise pool for this unit."; if only choral content is missing, the slide ends on a green "Speaking practice complete!" card after the discrimination round.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> First we have a penguin — the sound of the penguin is very good; it plays three times, but it's good. Then we have a sentence: "the animal living the jungle" — that's very good, the sound is also "the animal living the jungle". Then we have the "everyone" screen — everyone says the sentence — but when we play the sound, it is saying "the animal plays in the jungle" (the audio doesn't match the displayed sentence).

**Clarified with the owner (2026-09-09):**
- On the "everyone" choral screen the played audio ("the animal plays in the jungle") does not match the displayed sentence ("the animal living the jungle").
- Owner is NOT sure which one is authoritative — the code audit must trace where the display text vs the audio asset come from and which is the intended sentence.
- Penguin intro sound + triple play: fine per owner.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardISayYouSay.tsx` unless noted.

- **F1 · P2 — The choral desync (§2): the board displays the CURRENT sentence but prefers a possibly-STALE stored audio asset.** Display text = `target_sentence` = the vocabulary row's current `example_sentence`. Audio = `target_audio`, which `generate-exercises` stamps as `target_audio: example_audio_url || audio_url` (`generate-exercises/index.ts:173`) — i.e. the MP3 generated for whatever the example sentence was at FIRST publish. The speech backfill only ever fills audio when it is MISSING (`if (!c.target_audio)` `:835`; `if (!v.example_audio_url)` `:840`, write-back `:906-910, 924-932`) and **never re-validates a stored URL against the current sentence**; enrichment carries `example_audio_url` forward untouched (`enrich-unit/index.ts:522`). So any later rewrite of `example_sentence` (re-enrichment, teacher edit, rebuild) leaves the old MP3 permanently attached — every future publish re-copies it, and the choral screen shows the new sentence while playing the old one. That is exactly the owner's transcript: the discrimination phase (word audio — words don't get rewritten) and the earlier surfaces matched, while the choral "Everyone say:" screen played a sentence from a previous generation of the content. **Which is authoritative: the DISPLAYED text** — it is the live canonical `example_sentence`; the audio asset is stale. The board side is clean: `playAudioUrl(choralItem.audio, displayText)` (`:441`) falls back to synthesizing the displayed text (always in sync) when no URL is stored — the mismatch requires a stored stale asset. Fix direction: reconcile `example_audio_url ↔ example_sentence` at publish (compare the canonical speech hash, regenerate on drift), and/or prefer the play-time resolver for sentence audio. A second, quieter desync rung in the same line: the `|| audio_url` fallback silently substitutes the single-WORD audio into a sentence item.
- **F2 · P2 — The remote's "Replay" button is a literal no-op.** The choral-phase handler for `FLIP_CARD`/`TOGGLE_PHASE` does nothing ("no-op state change, just lets the teacher re-tap play", `:272-273`) — the commander (`ContextualControls.tsx:377`) and remote (`TeacherRemote.tsx:424-426`) both ship a Replay button that cannot replay anything; the teacher must physically tap the board's Play button. Replay is THE core action of a listen-and-repeat drill, so this is the same control-parity gap Focus Cards had (audit `05-focus-cards.md` F5) but on the drill's central verb.
- **F3 · P2 — The teacher-override scoring path breaks the triple-write contract.** A board-tap correct answer does `addPoints` + `recordAttempt` + `gradeObjective` (`:190-198`); the remote/commander MARK_CORRECT path (`:250-264`) does `addPoints` + `recordAttempt` only — the FSRS `gradeObjective` write is missing, so teacher-credited correct answers never advance the mastery model while board-tapped ones do. Analytics/leaderboard/FSRS drift apart depending on which surface the teacher used.
- **F4 · P3 — The choral "Finish" leaves a stale screen with no completion state.** After the last item's final stage, `advanceChoral` plays the win cue and then… stays on the same "One more time" sentence forever (`:226-243` — the final else does nothing; no end card, no `SLIDE_COMPLETE`, deliberate per the comment `:239-241`). The remote's I_SAY_YOU_SAY case has no End button either (`TeacherRemote.tsx:413-434`); the teacher falls back to the global nav chevron. The discrimination-to-choral transition, by contrast, ends on a proper "Speaking practice complete!" card when choral content is absent (`:383-393`) — the normal path deserves the same.
- **F5 · P3 — The "Focus on the word" stage displays the word but still plays the full sentence.** All three stages play `choralItem.audio` (`:441`), so the isolated-word screen says "jungle" at 9xl while the audio speaks the whole sentence. Arguably intended (hear sentence, repeat word), but it reads as a desync in the room and contributed to the owner's suspicion — either play the word audio (a per-word URL the item doesn't currently carry) or visually frame it as "sentence audio, repeat the highlighted word".
- **F6 · P3 — Remote "Next" is dead mid-question in the discrimination phase.** `NEXT`/`NEXT_PAIR` only advance when the item is already revealed (`:267-269`); before an answer the button appears broken (Skip works, and there is no visual state on the phone to explain the difference).
- **F7 · P3 — The frozen `data.items` branch is a dead shape that would reintroduce the desync if ever fed.** `choralItems` prefers `data.items` (`it.text ?? ''`, `it.emphasis`, `it.audio`, `:96-98`) — a contract no current generator produces (orchestrate-lesson's SPEAKING block carries `targetSentence`/`targetWord`, no items). If a future flow emitter does produce items with inline audio URLs, they'd bypass the pool and any reconciliation — the F1 failure mode with no guard. Dead-path candidates for removal or shape-validation.

**What already works well (context — don't re-litigate):** the receptive-before-productive phase ordering, the honest "no scoring" banner (replacing the old fake waveform), the full lifecycle resets including the documented mid-choral new-pick fix (`:127-141`), the miss teaching beat with explanation + the double-advance timer guard (`:124, 155-159, 216-221`), streak tiers with confetti at 3/5, per-item awarded/mistake latches, and the always-in-sync text-fallback speech seam (`playAudioUrl`) that keeps every surface honest when no stale asset is stored.

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
