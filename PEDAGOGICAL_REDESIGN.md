# Professor — Pedagogical Redesign (audit + per-mechanism blueprint)

> Companion to `EXERCISE_ENGINE_CORE_V1.md`. This document is the **pedagogy layer**:
> it audits how every learner-facing mechanism works today, why several feel
> shallow, and defines a coherent **learning loop** each mechanism plugs into —
> grounded in established L2-acquisition research — with a concrete redesign for
> each (starting with the vocabulary card the user flagged).

---

## 1. The core problem (in one paragraph)
The app has *parts* (vocab cards, 12 exercise types, board games, FSRS mastery)
but they don't form a **deliberate learning sequence**. A learner meets a word
once on a single flip-card, then is thrown into exercises with no ensured
"teaching moment"; audio is frequently silent; the board and the student app
teach the same word in unrelated ways. Result: shallow exposure, weak retention,
no sense of progression. The fix is not more games — it is a **staged loop**
(Present → Recognize → Recall → Produce → Assess) that every mechanism serves,
with audio + multi-modal binding at every step.

---

## 2. Current-state audit

> **Two tracks — two designs (read this first).** The product has two learner
> surfaces with opposite design priorities, and they must NOT be built the same way:
>
> - **Track A — Live Board:** a **teacher-led, live, in-person class** (5–15
>   students) on **ONE screen (projector)**. Students have **NO devices** in
>   class. The teacher is the only operator (board + remote): they teach the
>   material, tell stories, and run games where students participate **one-by-one
>   or by team — aloud / at the board**. The teacher grades a picked student via
>   the remote (Correct/Wrong → LearnerState); choral rounds write nothing. The
>   board must **never assume student devices**. The only link to Track B is the
>   shared LearnerState (a class grade reshapes that student's *home* practice) —
>   the two contexts are **not** live-coupled.
> - **Track B — Student app:** the **reinforcement loop** (Word Lab → FSRS practice
>   → mastery). Self-paced, adaptive, where the teach→recognize→recall→produce
>   rigor (§4) lives.
>
> The redesign keeps these deliberately separate: **no auto-advancing loops on the
> board** (the teacher advances), and **no teacher-baton manual grading on the
> student app** (it's adaptive). The audit columns below note which track each
> mechanism belongs to.

| Mechanism | Track | What it does now | Weakness |
|---|---|---|
| **FOCUS_CARDS (vocab)** | One card at a time, flip to see word/IPA/example, "listen" button | One-at-a-time = no comparison/contrast; "listen" often silent (audio_url empty); no structured study phase; immediately jumps to exercises |
| **Exercise battery (12)** | Self-completing, immediate feedback, pool-driven, FSRS-graded | Type selection is mastery-aware but the *sequence* isn't staged (receptive before productive can be skipped); no "teach then test" framing |
| **Lesson flow** | orchestrate-lesson → WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS/WRAP phases | Phases are tagged but the learner doesn't feel the pedagogy; INPUT (cards) is too brief before PRACTICE |
| **Live board** | Phase badge, class-weak banner, per-student capture, pool-driven games | Strong on data, but games are discrete activities, not a connected teaching arc |
| **Mastery loop** | FSRS, crowns, cracked nodes, hearts | Solid model, but "familiar/mastered" can advance without the learner ever *producing* the word in context |
| **Audio** | ElevenLabs TTS stored as `audio_url`; client `speechSynthesis` fallback | **ElevenLabs is failing (0/10 words have audio)**; fallback exists but isn't guaranteed to fire → silent cards |

---

## 3. Research-grounded principles (what "best practice" means here)
These are the frameworks every redesign decision maps to:

1. **PPP — Presentation, Practice, Production** (Willis; standard CLT). New
   language is *presented* (meaning+form+sound), practised in *controlled* drills,
   then used in *free* production. Our phases already mirror this; the gap is that
   Presentation is too thin.
2. **Dual-coding theory (Mayer / Paivio).** Learners retain far more when the
   word, an image, **and** the sound are bound together at the moment of learning.
   → Every vocab card must show **image + written word + IPA + audio** simultaneously.
3. **Retrieval practice / the testing effect (Roediger & Karpicke).** Recalling a
   word strengthens memory far more than re-reading it. → The study phase must be
   *followed* by recall tasks, not more presentation.
4. **Spaced repetition (FSRS) + desirable difficulty.** We already have FSRS. The
   missing piece is **graduated retrieval** (recognize → recall → produce), so the
   same word is retrieved at increasing depth across a session and across days.
5. **Nation's vocabulary framework — form, meaning, use.** A word is "known" only
   when a learner grasps its form (spelling/pronunciation), meaning (L1+definition),
   and use (in a sentence). → Mastery should require all three, not just recognition.
6. **Child-appropriate chunking.** Young learners (6–12) work best with **5±2 items**
   per set, short loops, immediate feedback, and a clear "round" structure (study →
   play → reward). → Cards come in sets of 5; each round is 2–4 minutes.
7. **Comprehensible input + affect (Krashen).** Low-anxiety, image-supported,
   i+1-level exposure. → Hearts should never block a *first* teaching round; they
   belong in *production* rounds.

---

## 4. The unifying learning loop (the thing every mechanism serves)

```
   ┌──────────────────────────────────────────────────────────────┐
   │  ROUND (≈5 words, 2–4 min)                                    │
   │                                                                │
   │  1. STUDY   (multi-modal bind)   image + word + IPA + AUDIO   │  ← FOCUS_CARDS grid
   │  2. RECOGNIZE (receptive drill)  "tap the picture/meaning"    │  ← IMAGE_SELECT / MEANING_MATCH
   │  3. RECALL   (productive-cued)   "spell / build the sentence" │  ← SPELL_CLOZE / WORD_BANK_BUILD
   │  4. PRODUCE  (free)              "type / say it"               │  ← TYPE_TRANSLATE / SPEAK_SENTENCE
   │  5. ASSESS   (mastery check)     timed mini-quiz              │  ← SPEED_QUIZ / board
   └──────────────────────────────────────────────────────────────┘
        ↳ results → FSRS recordAttempt → mastery ladder → next round selects weaker words
```

A **lesson** = several rounds + a story (context) + grammar; a **practice
session** = due/weak rounds across units. The same loop runs on the **board**
(choral study → teacher-led drill → per-student assess) and the **student app**
(solo study → self-paced drill → solo assess).

---

## 5. FOCUS_CARDS redesign (the flagged mechanism — detailed)

**New model: "Word Lab" — a 5-card study grid, then memorization rounds.**

### 5.1 Study phase (the grid) — replaces one-card-at-a-time
- Show **5 cards** in a responsive grid (2×3 / 3×2). Each card is independently flippable.
- **Card front:** image + the English word (large) + a speaker button.
- **Card back (flip):** IPA phonetic + Chinese (L1) translation + definition + the example sentence + a second speaker button (sentence audio).
- Tapping the **speaker** plays the word/sentence audio (generated TTS; guaranteed `speechSynthesis` fallback so it is never silent).
- A **progress ring** on each card tracks "studied" once the learner has flipped it + played its audio at least once.
- The study phase **does not advance automatically** — it ends when the learner taps "I'm ready →" (or all 5 are marked studied). This is the deliberate, *longer* teaching moment the user asked for.
- Pedagogy: dual-coding (image+word+sound bound at once) + learner control (affect) + the 5±2 chunk.

### 5.2 Memorization rounds (right after the grid) — 1–2 quick games using the SAME 5 words
- **Round A — recognize (warm recall):** `IMAGE_SELECT` (tap the picture for the word) + `MEANING_MATCH` (tap the Chinese meaning). Low stakes, immediate feedback, no hearts.
- **Round B — recall (deeper):** `SPELL_CLOZE` (fill the word in the example sentence) and/or `WORD_BANK_BUILD` (rebuild the example sentence). Hearts apply only here.
- Each correct answer advances that word's FSRS state (`new → learning`). A word missed in recall is **re-queued** into the next round (desirable difficulty + retrieval practice).
- End-of-round summary: "You learned 4/5 words! 🦒 cracked — review next time."

### 5.3 Why this is better
- **Longer, focused study** (the grid) instead of a 2-second flip.
- **Comparison + contrast** (5 cards visible) aids discrimination (key for confusables like ship/sheep).
- **Teach-then-test** ordering (study → recognize → recall) is the proven sequence; today the app often tests before teaching.
- **Audio guaranteed** (the silent-card bug is fixed structurally).

---

## 6. Exercise battery — purpose per type (mapped to the loop)

Each Core-v1 type has a *defined pedagogical job*. The lesson/round sequencer must
emit them in loop order, not randomly:

| Stage | Types | Job |
|---|---|---|
| **Recognize (receptive)** | `IMAGE_SELECT`, `MEANING_MATCH`, `AUDIO_L1_SELECT`, `LISTEN_SELECT`, `SPELL_CLOZE` | Bind form↔meaning↔sound; low-stakes recognition |
| **Recall (productive-cued)** | `WORD_BANK_BUILD`, `ERROR_SPOT`, `TRANSFORM`, `MINIMAL_PAIR_SWIPE` | Retrieve with scaffolding; grammar + discrimination |
| **Produce (free)** | `DICTATION`, `TYPE_TRANSLATE`, `SPEAK_SENTENCE` | Un-cued retrieval; pronunciation + spelling under load |

**Selection rule (upgrade to current escalation ladder):** within a round the type
must match the *word's* loop stage, AND the round as a whole must progress
recognize→recall→produce (never produce before recognize for a brand-new word).
This closes the "mastery advanced without production" gap.

---

## 7. Lesson structure redesign (the arc a learner feels)
A unit lesson becomes a **visible arc**, not a flat list:

1. **Warm-up (1 min):** a song/animation or a "guess the topic" image ( MEDIA_PLAYER / LIVE_WARMUP ). Switch to English.
2. **Word Lab (3–6 min):** the new FOCUS_CARDS grid (§5) for the unit's ~8–10 words, split into 2 sets of 5.
3. **Story (2 min):** STORY_STAGE — the words in narrative context (comprehensible input). Tappable words speak + define.
4. **Controlled practice (3–5 min):** the memorization rounds (recognize→recall) via the ExerciseRunner, weakest-first.
5. **Free production (2–3 min):** SPEAK_SENTENCE + TYPE_TRANSLATE + DICTATION (hearts apply).
6. **Assess (1–2 min):** a timed SPEED_QUIZ / board round; updates mastery.
7. **Wrap:** XP + crowns earned, cracked words flagged for next session.

The phase bar already exists; we surface **"Step 2 of 7: Word Lab"** so the learner
feels the structure.

---

## 8. Live board redesign (Track A — the teacher's baton)
The board is **NOT a loop** — it is a live, teacher-controlled presentation +
elicitation + grading console for a group of 10+ kids. The teacher, not the
software, drives pacing and sequence. The board must make the teacher fast and
powerful, never auto-advance or lock them out.

### 8.1 Teacher control (the core requirement)
- **Free pacing & sequence:** the phase timeline is a *guide*, never a constraint.
  The teacher can jump to any step, **repeat/redo** the current exercise, go back,
  or skip. No step ever auto-advances.
- **Pick the responder:** a prominent, always-available control to choose *who*
  answers this item — **one named student** (manual pick or the Wheel), a **group**
  (e.g. "table 3"), or **whole class (choral)**. This is the heart of "with each
  kid or by group."
- **Do / redo / skip per item:** after any item the teacher sees three actions —
  *Ask again* (same item, same or new responder — re-elicitation for
  reinforcement/reticent kids), *Next item*, *Skip*. "Redo" is first-class.
- **Two write modes, explicit:**
  - *Individual* (a named student is up) → a Correct/Wrong grade → `recordAttempt`
    (feeds Track B).
  - *Group / choral* (everyone answers) → **no per-student write** (engagement
    only). The UI must make this distinction obvious so the teacher knows whether
    a round is "graded" or "practice."

### 8.2 The board's pedagogical arc (teacher-led, not auto-run)
A typical live lesson the teacher *conducts*:
1. **Present** the word (board FocusCards grid, big + loud) → choral echo.
2. **Elicit, group-first** → choral recognition round (WhatsMissing/FlashMatch) so
   every kid answers with zero shame.
3. **Elicit, individual** → pick a student (Wheel/pick) → recognition or recall →
   Correct/Wrong → recorded. **Redo** for kids who hesitated.
4. **Assess** → a timed individual round (SpeedQuiz/Wheel) for a measurable check.
5. The teacher moves on when *they* judge the class is ready — repeat any step at will.

### 8.3 What this means for the build
- Add a persistent **Teacher Control Bar** (Track A flagship): *Redo · Next · Skip*
  + *Responder: [Class] [Pick student] [Wheel] [Group…]* + a clear "graded /
  practice" indicator. This is the single highest-value board feature.
- Keep per-student capture (`gradeStudent`/`gradeObjective`) wired only to the
  *Individual* path; choral/group rounds call nothing.
- The class-weak banner stays (informs the teacher *what* to elicit next), but it
  never auto-drives.

---

## 9. Audio — guaranteed sound (fixes "sound wasn't generated")
- **Problem:** ElevenLabs is failing (0/10 audio_url). Free server TTS fallbacks are currently down (StreamElements 401, Pollinations audio 502).
- **Fix (two layers):**
  1. **Guaranteed client audio:** every speaker button calls `SpeechService.playAudioUrl(url, fallbackText)`. When `audio_url` is empty it **always** speaks via `window.speechSynthesis` (browser-native, region-safe, no key). Make the card's speaker **always pass the word/sentence as fallbackText** so it is never silent.
  2. **Server TTS:** keep ElevenLabs as primary (best quality); add a try/then-fallback chain in `_shared/tts.ts` (ElevenLabs → a working free endpoint when one is available). If the ElevenLabs key is expired/quota, the owner refreshes it in the dashboard — meanwhile the client TTS keeps the app fully functional.
- **Autoplay policy:** the first speaker tap is a user gesture, so `speechSynthesis` is allowed; ensure no audio auto-plays before a gesture.

---

## 10. Mastery alignment (so progression is real)
- A word reaches **`familiar`** only after a *productive* success (already true).
- Add: a word is **`mastered`** only after it has succeeded at **one receptive + one productive + one in-context (sentence) task** (Nation's form/meaning/use) — not just 3 raw productive wins. Tune the threshold after pilot.
- Cracked nodes (R<0.85) route the word back into the next round's STUDY phase (re-teach), not just practice.

---

## 11. Implementation roadmap (phased, smallest-pedagogy-first)
- **P-A (now, unblocks everything):** Audio guarantee — wire `fallbackText` on every speaker; verify `speechSynthesis` fires when audio_url empty. Investigate/refresh ElevenLabs key.
- **P-B (the flagship):** Build the **Word Lab grid** (5 cards, independent flip, front/back, progress rings, "I'm ready" gate) replacing the single-card FOCUS_CARDS for both student app + board.
- **P-C:** Wire the **round sequencer** (study → recognize → recall → produce) into `selectLessonItems` so a round emits types in loop order per word.
- **P-D:** End-of-round summary + re-queue missed words.
- **P-E:** Visible lesson arc ("Step x of 7") + story tappable words.
- **P-F:** Mastery threshold upgrade (form/meaning/use) + cracked-word re-teach.

Each phase is independently shippable and tested; P-A + P-B alone transform the
"feels shallow" problem the user described.

---

## 12. What I need to proceed
1. **Confirm the ElevenLabs key** is valid (dashboard → Edge Functions → Secrets). If expired, refresh it — that single fix restores premium audio. Meanwhile P-A guarantees browser TTS works regardless.
2. **Greenlight P-A → P-B** (audio + Word Lab grid) as the first build slice — that's the highest-impact, most-visible change.
3. After P-B, decide whether to iterate the round sequencer (P-C) or the lesson arc (P-E) next.

---

# Part 2 — Per-mechanism audit & redesign (every learner surface)

The same method applied to FOCUS_CARDS (§5), now for each remaining surface:
**current behavior → research principle → redesign**, all feeding the §4 loop.

## 13. Story / Reading (STORY_STAGE, ReadingReader)
- **Today:** pages render with an image + speaker; ReadingReader adds tappable vocab + comprehension questions. Decent, but reading is a passive "page through"; no re-reading, no echo/choral, comprehension is a single end-quiz.
- **Principles:** Krashen's extensive reading + comprehensible input; the **pre/during/post** reading frame; **repeated reading** for fluency; **echo + choral reading** (hear → repeat) for prosody; **story maps** for narrative structure.
- **Redesign:** add the three phases:
  - *Pre:* one-tap "picture walk" (preview images, predict the topic) + teach the 3 hardest words as mini-cards (warm the loop).
  - *During:* line-by-line **read-along** — tap a sentence → hear it (highlight karaoke-style) → optional "repeat after me" (echo) → tap any word for instant image+audio pop-up (input binding).
  - *Post:* 2–3 comprehension questions (already built) **plus one "use" task** — reorder the story (StorySequencing) or retell with a word bank (production, not just recognition).
- **Result:** reading becomes a guided, multi-pass, speak-along experience that re-binds the vocab in context — the OUTPUT stage of the loop.

## 14. Grammar (BoardGrammarSandbox + GRAMMAR_SANDBOX + ERROR_SPOT/TRANSFORM)
- **Today:** BoardGrammarSandbox presents a rule + examples (deductive, one-way); BoardGrammarPractice drills ERROR_SPOT/TRANSFORM. Good bones, but the student-app GRAMMAR_SANDBOX is thin and grammar often feels disconnected from the vocab/story.
- **Principles:** **guided discovery / inductive** noticing (Schmidt) beats pure rule-telling for retention; grammar must be taught on **form-meaning-use** (Nation) and practised in the *same* sentences the learner already met (transfer-appropriate processing); **sentence frames** scaffold production.
- **Redesign:**
  - Make GRAMMAR_SANDBOX **interactive**: show 2 example sentences from the unit's *story* with the target pattern highlighted; learner taps to "discover" the rule (guided induction) before the rule card reveals.
  - Drill with the **learner's own vocabulary** in the pattern (e.g. transform *"The elephant is big"* → *"Is the elephant big?"*) — ERROR_SPOT/TRANSFORM already support this; wire the generator to use unit vocab, not generic sentences.
  - Add a **sentence-frame builder** (WORD_BANK_BUILD variant): assemble the target structure from a frame + word tiles (controlled production).
- **Result:** grammar is taught through the lesson's content, discovered not just told, and produced in familiar sentences.

## 15. Pronunciation / Phonics (PhonicsPhlyer, SPEAK_SENTENCE, MINIMAL_PAIR_SWIPE, evaluate-pronunciation)
- **Today:** SPEAK_SENTENCE scores via Levenshtein similarity (0.8 threshold); MINIMAL_PAIR_SWIPE distinguishes confusables; PhonicsPhlyer is pool-driven minimal-pairs. Solid mechanics, but discrimination (hear-the-difference) often isn't practised *before* production, and the 0.8 cut is adult-harsh for kids.
- **Principles:** **auditory discrimination precedes production** (you can't say what you can't hear); **minimal pairs** are the gold-standard technique; production scoring for children must be **lenient + encouraging** (celebrate effort, scaffold retries); suprasegmentals (stress/intonation) matter as much as segmentals.
- **Redesign:**
  - Sequence **discrimination → production**: a MINIMAL_PAIR_SWIPE "which did you hear?" (recognition) must come *before* SPEAK_SENTENCE "say it" (production) for a given pair — enforce in the round sequencer.
  - **Tiered scoring**: ≥0.6 "Great!" / 0.4–0.6 "Almost — try once more" / <0.4 "Listen again then try" with the model audio replay (not a hard fail). This lowers affect (Krashen) for young learners.
  - **Playback before mic**: always let the learner hear the target audio first, then record (echo technique).
  - Add **stress/clapping** cue for multi-syllable words (visual dots over the stressed syllable) — suprasegmental support.
- **Result:** pronunciation is taught hear-first, scored kindly, and scaffolded — kids keep trying instead of failing.

## 16. Board competitive games (Wheel, TeamBattle, SpeedQuiz, WhatsMissing, MagicEyes, FlashMatch)
- **Today:** each is pool-driven + class-weak-aware + per-student capture. Individually fine, but they're an unstructured bag; anxiety can spike (public wrong answers); some are recognition-only forever.
- **Principles:** games serve **retrieval practice + engagement**, not novelty for its own sake; mix **choral low-stakes** (everyone answers, no individual shame) with **individual high-stakes** (selected student) to balance motivation + measurement; **novelty + variety** sustain dopamine but each game should map to a loop stage.
- **Redesign — give each game a defined job in the loop:**
  | Game | Loop stage | Pedagogical job | Stakes |
  |---|---|---|---|
  | WhatsMissing / FlashMatch | Recognize | Form↔meaning binding, memory span | choral/low |
  | MagicEyes | Recognize | Observation + describe (free recall prompt) | choral/low |
  | SpeedQuiz | Assess | Timed retrieval (the test) | individual/high |
  | TeamBattle | Assess | Cooperative retrieval + strategy | team/medium |
  | WheelOfDestiny | Assess (per-student) | Equitable random selection → 1:1 check | individual/high |
  | ISayYouSay | Recall (choral drill) | Echo/choral pronunciation practice | choral/low |
  | Unscramble / StorySequencing | Recall/Produce | Sentence + narrative assembly | individual/medium |
- **Operationalize:** the board's phase already tags PRACTICE/ASSESS — surface "these are *recognition* warm-ups" vs "this is the *assessment*" so the teacher sequences choral→individual (low→high stakes) instead of jumping to the wheel first. Add a **choral "all-answer" mode** to SpeedQuiz/WhatsMissing (everyone holds up / taps their own device) before the individual wheel, to de-risk public errors.

## 17. Practice loop (SpacedRepetition → ExerciseRunner)
- **Today:** pulls due+weak across units, mixed types, FSRS-driven, hearts. Correct, but a practice session can mix brand-new-forgotten words with long-mastered ones, and the type is mastery-aware but not loop-staged.
- **Redesign:**
  - **Bucket the session:** group words by loop stage (all "need re-teach" first as mini Word Lab cards, then recognize, then produce) so a practice session has the same coherent arc as a lesson — not a random shuffle.
  - **Re-teach before re-test** for *cracked* words: a mastered-but-decayed word shows a 1-card mini-study (image+audio) before its exercise (the loop's STUDY step), rather than throwing the learner straight at a TYPE_TRANSLATE they've forgotten.
  - Cap **session length ~15–20 items** (kid attention) with a visible "X words reviewed" progress.

## 18. Dubbing / story production (DubbingStudio)
- **Today:** learner dubs a story line with an emotion; standalone route.
- **Principles:** **task-based language teaching** + affective engagement; dubbing = free production with a model (lowers the blank-page anxiety).
- **Redesign:** integrate DubbingStudio as the lesson's **free-production** option (loop stage 4) for story units — "now YOU say the elephant's line" — scored leniently, feeding the speaking objective's mastery. It currently sits outside the loop; bring it inside.

---

## 19. Cross-cutting: the "studied word" contract
To make the loop real across all mechanisms, define one shared contract: a word is
**"studied"** when the learner has seen image+word+audio together (Word Lab). Only
**studied** words enter the exercise battery in a given session; **un-studied**
words are always taught first. This single rule enforces teach-before-test
everywhere and is the backbone the round sequencer (P-C) implements.

---

## 20. Updated implementation roadmap
> Track tags: **[B]** = student-app reinforcement loop · **[A]** = live board (teacher control).

- **P-A ✅** Audio guarantee (done — fallbackText on every speaker). **[B+A]**
- **P-B ✅** Word Lab grid (done — student app FOCUS_CARDS). **[B]**
- **P-A1 (next, Track A flagship)** **Board Teacher Control Bar**: Redo / Next / Skip
  + Responder picker (Class / Pick student / Wheel / Group) + graded-vs-practice
  indicator + free pacing (never auto-advance). The highest-value board feature.
  **[A]**
- **P-C** **[B]** Round sequencer: study→recognize→recall→produce per word; enforce
  "studied before tested"; re-teach cracked words. (Track B rigor.)
- **P-D** **[B]** End-of-round summary + re-queue missed words.
- **P-E** **[B]** Story three-phase + Grammar guided-discovery w/ unit-vocab drills.
- **P-F** **[B]** Pronunciation tiered scoring (lenient) + discrimination-before-production.
- **P-G** **[A]** Board game roles (choral recognition ↔ individual assess) +
  explicit graded/practice modes per game.
- **P-H** **[B]** Mastery threshold (form+meaning+use) + DubbingStudio inside the loop.
- **P-I** **[B]** Practice session bucketing (re-teach → recognize → produce).

**Next step:** P-A1 (board Teacher Control Bar) — it directly delivers the
"teacher in control, do/redo/skip with each kid or group" requirement you flagged.
Then P-C for the student-app loop.
