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

| Mechanism | What it does now | Weakness |
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

## 8. Live board redesign (same loop, teacher-led)
- **Study:** BoardFocusCards shows the 5-card grid big-screen (choral repeat after the audio).
- **Drill:** teacher-led IMAGE_SELECT/MEANING_MATCH (board games) over the same 5 words, class-weak-first.
- **Assess (per-student):** Wheel/SpeedQuiz/TeamBattle pick a student → teacher grades → `recordAttempt` (already wired).
- The class-weak banner (already built) tells the teacher which words to drill.

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
