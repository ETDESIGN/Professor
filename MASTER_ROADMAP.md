# MASTER_ROADMAP.md — New-Gen Game & Exercise System

> **Strategic directive:** Build an entirely new game library from scratch. Legacy games remain routable during transition but are NOT modified. Each new game replaces one or more legacy templates.
>
> **Quality bar — "The Duolingo Standard":**
> - **Zero passive time** — every screen requires active recall, retrieval, or production
> - **Teacher-zero** — zero teacher-typing during live play; tap-driven, speech-recognized, or automated
> - **FSRS-connected** — every learning event writes to `srs_items` via `gradeObjective()` / `gradeStudent()`
> - **Tactile UI** — micro-interactions, haptic-feel animations, high-energy feedback loops

---

## Architecture Contract (ALL new games MUST follow)

### Integration Points
| Concern | How |
|---|---|
| **Content source** | `useEscalatingPool` (mastery-gated) or `useBoardPool` (flat pull) from `pool_items` |
| **Scoring** | `scoreForAttempt(mistakes, difficulty, partialCreditRatio)` from `scoringDefaults.ts` |
| **FSRS write** | Dual-write: `addPoints()` + `gradeStudent()` / `gradeObjective()` per attempt |
| **Lifecycle** | `currentTurnId` reset effect, `mistakesRef` + `awardedRef`, personalized success message |
| **Remote controls** | Listen via `state.lastAction` — handle `RESET_GAME` minimum |
| **Sound** | `BoardSoundLayer` cues (correct/wrong/streak) — zero CDN dependencies |
| **Animations** | Framer Motion (`motion` from `framer-motion`) for all transitions |

### File Convention
```
apps/board/templates/Board<Name>.tsx              — Board (projector) component
apps/board/templates/<name>/                       — Sub-components directory if needed
apps/teacher/live/panels/ContextualControls.tsx     — Remote buttons for this game
apps/board/ClassroomBoard.tsx                       — Router registration
apps/board/BoardRenderer.tsx                        — Commander preview registration
```

### Shared Infrastructure (reuse, don't reinvent)
| Hook / Helper | File | Purpose |
|---|---|---|
| `useSession()` | `store/SessionContext.tsx` | State, addPoints, gradeStudent, triggerAction |
| `usePickedStudent()` | `apps/board/templates/usePickedStudent.ts` | Resolve picked student name/avatar |
| `scoreForAttempt()` | `apps/board/templates/scoringDefaults.ts` | Unified scoring math |
| `useEscalatingPool()` | `apps/board/useEscalatingPool.ts` | Mastery-gated pool content |
| `useBoardPool()` | `apps/board/useBoardPool.ts` | Flat pool pull |
| `filterPresent()` | `services/attendanceLogic.ts` | Exclude absent students |
| `lcsLength()` / `computeLCSPartialCredit()` | `apps/board/templates/BoardUnscramble.tsx` | LCS partial credit (extract to shared) |
| `textMatches()` / `normalizeForCompare()` | `apps/student/exercises/shared.tsx` | Text normalization |

---

## Priority-Ranked Game Specifications

---

### GAME 1: `GRAMMAR_LAB` — "Grammar Lab"
**Replaces:** BoardGrammarSandbox (presentation) + BoardGrammarForge (practice) + BoardGrammarPractice (legacy)
**Priority:** 1 — CRITICAL (fills the #1 gap: zero grammar reinforcement, teacher-typing in Rung 4)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW pattern skeleton (visual rule) → STUDENT IDENTIFIES error (tap the wrong token)
→ STUDENT TRANSFORMS (tap tiles to apply rule) → STUDENT FILLS BLANK (MCQ: which
sentence uses the rule correctly?) → INSTANT visual feedback (changed tokens glow)
→ FSRS push → ESCALATE to next rule
```
3 rungs of increasing cognitive demand: Recognition → Transformation → Production (MCQ).

#### What's New vs. Legacy
| Legacy | New |
|---|---|
| Rung 4 = teacher 3-way rating (subjective, requires typing) | Rung 3 = scaffolded MCQ (objective, tap-driven) |
| Sandbox = passive presentation, zero student response | Pattern skeleton is followed IMMEDIATELY by an error-spot challenge |
| No timer, teacher controls all pacing | Optional 20s timer per item (configurable) |
| No visual feedback on transformation | Token-level highlight: changed tokens animate red→green |
| Reads manifest directly | Reads relational `grammar_rules` table only |

#### UI/UX Architecture
```
BoardGrammarLab
├── PatternHeader          — Rule name + visual skeleton (pulsing blank)
├── RungDisplay
│   ├── ErrorSpotRung      — Sentence with tokens; tap the wrong one (glows red)
│   ├── TransformRung      — Source sentence + tile bank; tap to build transformed form
│   └── FillBlankRung      — 3 sentence options; tap the grammatically correct one
├── FeedbackOverlay        — Token-level animation (red→green for changed tokens)
├── ProgressBar            — Round X of Y
├── ScoreFlyout            — Points animate to team score
└── TurnFooter             — Whose-turn indicator + student name
```

**State Management:**
- `currentRung: 1 | 2 | 3` — which rung within the current item
- `currentItemIdx: number` — which pool item
- `mistakesRef` — per-turn mistake counter
- `awardedRef` — prevents double-scoring
- `phase: 'prompt' | 'feedback' | 'complete'` — animation gating

**User Flow (Picked Mode):**
1. Pattern skeleton appears (2s) — class reads the rule
2. **Rung 1 (Error Spot):** Sentence appears with 5-6 tokens. One token is grammatically wrong. Student taps it → token shakes red → correct token highlighted → auto-advance
3. **Rung 2 (Transform):** Source sentence displayed. Tile bank below. Student taps tiles in order to build the transformed form. LCS partial credit. On complete → changed tokens animate red→green
4. **Rung 3 (Fill Blank):** "Which sentence uses this rule correctly?" — 3 options. Student taps → instant feedback
5. Score popup → personalized "[Name] cracked the grammar!" → next student

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type IN ('ERROR_SPOT', 'TRANSFORM')` via `useEscalatingPool`
- **New exercise type needed:** `GRAMMAR_FILL` — MCQ: pick the grammatically correct sentence. Generator must produce these from `grammar_rules` transformation_pairs
- **FSRS:** `gradeObjective(objective_id, success, difficulty)` per rung completion
- **Step type:** `GRAMMAR_LAB` — registered in ClassroomBoard.tsx + BoardRenderer.tsx + ContextualControls.tsx

#### Remote Controls
| Button | Action | Effect |
|---|---|---|
| ✅ Correct | `MARK_CORRECT` | Award + advance |
| ❌ Wrong | `MARK_WRONG` | −5 penalty + hint |
| 💡 Hint | `REVEAL_HINT` | Highlight the token that should change |
| ⏭ Skip | `SKIP_ITEM` | Skip current item |
| 🔁 Redo | `RESET_GAME` | Reset all rounds |

#### Self-Audit
- [x] Zero teacher typing? ✅ — all tap-driven, MCQ replaces Rung 4 subjective rating
- [x] Zero passive time? ✅ — pattern skeleton shown for 2s then IMMEDIATELY challenged
- [x] FSRS connected? ✅ — gradeObjective per rung
- [x] Tactile UI? ✅ — token bounce, red→green glow, score flyout
- [x] Personalized? ✅ — "[Name] cracked the grammar!"

---

### GAME 2: `WORD_DETECTIVE` — "Word Detective"
**Replaces:** BoardFlashMatch (isolated matching) + BoardFocusCards (passive vocab presentation)
**Priority:** 2 — CRITICAL (vocab games currently only test isolated word recognition)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW sentence with blank → STUDENT picks the word that fits context →
FEEDBACK shows complete sentence + audio + illustration → ESCALATE
(harder context / closer distractors)
```
Tests vocabulary IN CONTEXT, not isolation. Every answer is a sentence-level comprehension event.

#### What's New vs. Legacy
| Legacy | New |
|---|---|
| Isolated word↔image matching (BoardFlashMatch) | Word-in-sentence completion |
| Passive 4-stage reveal (BoardFocusCards) | Active prediction: "which word fits?" |
| No audio reinforcement on match | Full sentence audio on correct answer |
| No FSRS on FocusCards exposure | Every tap records to FSRS |
| Visual matching only | Semantic + syntactic reasoning required |

#### UI/UX Architecture
```
BoardWordDetective
├── SentenceDisplay        — Sentence with glowing blank slot
│   ├── ContextImage       — Small illustration for context
│   └── TranslationBadge   — L1 translation (toggleable)
├── WordCards              — 4 floating word cards with hover/tap animations
├── FeedbackReveal         — Complete sentence lights up + audio plays
│   ├── AudioButton        — Replay sentence audio
│   └── IllustrationReveal — Full illustration appears
├── ProgressBar            — Round X of Y
├── ScoreFlyout            — Points animate to team score
└── TurnFooter
```

**State Management:**
- `currentItemIdx` — which pool item
- `selectedWord: string | null` — student's tap
- `phase: 'prompt' | 'revealing' | 'feedback' | 'complete'`
- `mistakesRef` / `awardedRef` — standard lifecycle

**User Flow:**
1. Sentence appears with blank: "She ___ to school every day." + small context image
2. 4 word cards float up from bottom (with stagger animation)
3. Student taps a card → card flies into the blank slot
4. **Correct:** Blank glows green, complete sentence highlights, audio plays, illustration appears, points fly
5. **Wrong:** Card bounces back with shake. Correct word pulses gently. −5 pts. Student tries again (different card)
6. After reveal: "Listen!" button replays the full sentence audio

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type IN ('SPELL_CLOZE', 'MEANING_MATCH')` via `useEscalatingPool`
- **SPELL_CLOZE** is a perfect fit (sentence_with_blank + options + correct_index)
- **MEANING_MATCH** repurposed: show the word in a sentence context instead of isolated
- **FSRS:** `gradeObjective()` per correct answer
- **Step type:** `WORD_DETECTIVE`

#### Remote Controls
| Button | Action |
|---|---|
| 💡 Hint | Show first letter of correct word on each card |
| 🔊 Replay | Replay sentence audio |
| ⏭ Skip | Skip to next sentence |
| 🔁 Redo | Reset |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — student must select before advancing
- [x] FSRS connected? ✅ — every tap records
- [x] Tactile UI? ✅ — card-fly-into-blank, glow, bounce
- [x] Tests vocab in context? ✅ — sentence-level, not isolated

---

### GAME 3: `SOUND_LAB` — "Sound Lab"
**Replaces:** BoardListenTap (flat MCQ + teacher-typing dictation)
**Priority:** 3 — HIGH (listening needs scaffolded progression; dictation requires teacher typing)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
Phase 1: PLAY audio (word) → STUDENT taps matching image (recognition)
Phase 2: PLAY audio (sentence) → STUDENT taps matching sentence text (discrimination)
Phase 3: SHOW word+image → STUDENT speaks → speech recognition scores (production)
→ Each phase escalates → FSRS push per phase
```
Progressive: recognition → discrimination → production. ALL automated. Zero teacher typing.

#### What's New vs. Legacy
| Legacy (BoardListenTap) | New (BoardSoundLab) |
|---|---|
| Flat MCQ for all types | 3-phase progression: hear→tap→speak |
| DICTATION requires teacher typing | Replaced with speech recognition |
| No replay button | 2-3 replays allowed (−5 pts per replay) |
| No visual feedback beyond correct/wrong | Waveform visualization + pronunciation score ring |
| Single interaction mode | Scaffolds from easy (image tap) to hard (speak) |

#### UI/UX Architecture
```
BoardSoundLab
├── PhaseIndicator         — 3 dots showing current phase (1/2/3)
├── Phase1Recognition
│   ├── AudioPlayer        — Big play button + waveform animation
│   ├── ImageGrid          — 4 image cards (tap to select)
│   └── ReplayButton       — "Listen again" (−5 pts)
├── Phase2Discrimination
│   ├── AudioPlayer        — Sentence audio + waveform
│   ├── SentenceCards      — 3 text cards (tap to select)
│   └── ReplayButton
├── Phase3Production
│   ├── TargetDisplay      — Word + image shown
│   ├── MicButton          — Big mic button with recording animation
│   ├── ScoreRing          — Circular progress (0-100%) for pronunciation
│   └── TranscriptDisplay  — "You said: ___" vs target
├── ProgressBar            — Phase progress within game
├── ScoreFlyout
└── TurnFooter
```

**State Management:**
- `currentPhase: 1 | 2 | 3`
- `currentItemIdx` — within each phase
- `replayCount: number` — tracks replays for point deduction
- `pronunciationScore: number | null` — Phase 3 result
- `mistakesRef` / `awardedRef`

**User Flow:**
1. **Phase 1:** "Listen!" → Audio plays → 4 images displayed → Student taps matching image → ✅/❌ feedback
2. **Phase 2:** "Which sentence?" → Audio plays full sentence → 3 sentence cards → Student taps match
3. **Phase 3:** "Say it!" → Word + image shown → Student taps mic → Speaks → Score ring fills → ≥60% = pass
4. All 3 phases complete → score summary → personalized "[Name] has great ears!"

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type IN ('LISTEN_SELECT', 'DICTATION', 'SPEAK_SENTENCE')` via `useEscalatingPool`
- Phase 1 consumes LISTEN_SELECT items
- Phase 2 consumes DICTATION items (repurposed: show sentence options instead of requiring typing)
- Phase 3 consumes SPEAK_SENTENCE items
- **FSRS:** `gradeObjective()` per phase. Phase 3: `record: false` when speech recognition unavailable
- **Step type:** `SOUND_LAB`

#### Remote Controls
| Button | Action |
|---|---|
| 🔊 Replay | Replay current audio (−5 pts) |
| 🎤 Retry | Re-trigger speech recognition |
| ⏭ Skip Phase | Skip to next phase |
| 🔁 Redo | Reset all phases |

#### Self-Audit
- [x] Zero teacher typing? ✅ — speech recognition replaces dictation
- [x] Zero passive time? ✅ — 3 active phases, no dead moments
- [x] FSRS connected? ✅ — phases 1&2 write; phase 3 conditional
- [x] Tactile UI? ✅ — waveform, score ring, card animations
- [x] Scaffolded? ✅ — recognition → discrimination → production

---

### GAME 4: `STORY_QUEST` — "Story Quest"
**Replaces:** BoardStoryStage (passive read-along) + BoardStorySequencing (isolated MCQs)
**Priority:** 4 — HIGH (story comprehension is currently passive with post-hoc MCQs)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW story panel → PREDICTION PROMPT ("What happens next?" — 3 image options)
→ REVEAL next panel (celebrate correct predictions) → COMPREHENSION CHECK
(every 2 panels — MCQ) → INFERENCE CHALLENGE at climax ("Why did X happen?")
→ VOCAB TAPS record FSRS exposure throughout
```
Transforms passive read-along into active prediction + comprehension + inference.

#### What's New vs. Legacy
| Legacy | New |
|---|---|
| Passive read-through, teacher drives | Active prediction gate before every advance |
| MCQs only AFTER the last page | Comprehension woven THROUGH the reading |
| Vocab taps play audio but don't record | Vocab taps record FSRS exposure |
| No progression visualization | Story map fills in as panels complete |
| Module-level singleton for asked items | Clean state management, survives refresh |

#### UI/UX Architecture
```
BoardStoryQuest
├── StoryMapBar            — Horizontal node chain (completed nodes glow)
├── PanelDisplay
│   ├── StoryImage         — Full panel illustration
│   ├── StoryText          — Text with highlighted vocab words
│   └── VocabPopover       — Tap word → IPA + L1 + audio + FSRS RecordExposure
├── PredictionGate         — "What happens next?" + 3 image options
├── ComprehensionCheck     — MCQ (every 2 panels)
├── InferenceChallenge     — "Why?" question with cause-effect options
├── CompletionCard         — Story summary + final score
├── ScoreFlyout
└── TurnFooter
```

**State Management:**
- `currentPanelIdx` — which story page
- `phase: 'reading' | 'prediction' | 'comprehension' | 'inference' | 'complete'`
- `predictions: {panelIdx: chosenOption}[]` — track prediction accuracy
- `vocabTaps: Set<string>` — track which words were tapped (for FSRS)
- `mistakesRef` / `awardedRef`

**User Flow:**
1. Story panel appears with text + image. Vocab words highlighted.
2. Student can tap vocab words → popover with definition + audio (records FSRS exposure)
3. Teacher taps "Next" on remote → **Prediction Gate** appears: "What happens next?" with 3 image options
4. Student taps prediction → if correct: celebration + points. If wrong: "Let's find out!" → reveal next panel
5. Every 2 panels → **Comprehension Check** MCQ (4 options)
6. At story climax → **Inference Challenge** "Why did [character] do [action]?"
7. Story complete → summary card with key events + total score

#### Pipeline Connections
- **Content:** Story manifest (pages, images, audio) + `pool_items` WHERE `exercise_type = 'STORY_COMPREHENSION'`
- **New generator output:** Prediction options (image-based) — needs `generate-exercises` update
- **FSRS:** `gradeObjective()` on comprehension/inference answers. `RecordExposure` on vocab taps
- **Step type:** `STORY_QUEST`

#### Remote Controls
| Button | Action |
|---|---|
| ▶️ Next Panel | Advance to prediction gate |
| 💡 Hint | Eliminate one wrong prediction option |
| ⏭ Skip | Skip comprehension check |
| 🔁 Redo | Reset story |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — prediction gate before every advance
- [x] FSRS connected? ✅ — comprehension + vocab exposure
- [x] Tactile UI? ✅ — story map filling, prediction celebrations
- [x] Builds inference? ✅ — "why?" challenges at climax

---

### GAME 5: `SENTENCE_LAB` — "Sentence Lab"
**Replaces:** BoardUnscramble (flat assembly, no scaffolding)
**Priority:** 5 — MEDIUM (sentence production needs scaffolding + audio context)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW prompt (L1 translation + image + audio of target) → STUDENT builds sentence
from word bank → AUTO-HINTS after inactivity → LCS PARTIAL CREDIT feedback →
SHOW correct with audio → STUDENT can self-correct → Next (harder)
```
Scaffolded sentence production with partial credit, audio context, and auto-hints.

#### What's New vs. Legacy
| Legacy (BoardUnscramble) | New (BoardSentenceLab) |
|---|---|
| Pure tile assembly, no context | Assembly + translation + image + audio prompt |
| No audio of target sentence | Target audio plays BEFORE (context) and AFTER (reinforcement) |
| No inactivity hints | Auto-highlights correct tile after 5s / 10s |
| 4 rounds per slide (exhausting) | 3 rounds with progressive difficulty |
| No self-correction window | 5s self-correct before answer reveal |

#### UI/UX Architecture
```
BoardSentenceLab
├── PromptArea
│   ├── TranslationText    — L1 translation
│   ├── ContextImage       — Small illustration
│   └── AudioButton        — Play target sentence audio
├── BuildArea              — Slot-based sentence construction
│   ├── SlotRow            — Empty slots (word count hint: "5 words needed")
│   └── PlacedTile         — Snapped tile with tap-to-remove
├── WordBank               — Shuffled tiles at bottom
├── AutoHint               — Faded highlight on correct next tile (timed)
├── FeedbackBar            — LCS partial credit meter + correct/wrong tile colors
├── SelfCorrectWindow      — 5s countdown before answer reveal
├── ProgressBar            — Round X of 3
├── ScoreFlyout
└── TurnFooter
```

**State Management:**
- `buildSlots: (string | null)[]` — current tile arrangement
- `currentItemIdx` — which pool item
- `round: number` — 1-3
- `hintLevel: 0 | 1 | 2` — auto-hint escalation (0=none, 1=first tile, 2=first two)
- `phase: 'building' | 'checking' | 'self-correct' | 'revealed'`
- `mistakesRef` / `awardedRef`

**User Flow:**
1. Prompt shown: L1 translation + image + "Listen" button
2. Student taps "Listen" → target sentence audio plays
3. Student taps word bank tiles → tiles snap into build area slots
4. **Auto-hints:** 5s inactivity → first correct tile highlights faintly. 10s → first two tiles
5. All slots filled (or student taps "Check") → LCS partial credit calculated
6. **Feedback:** Correct tiles glow green. Wrong-position tiles glow amber. Missing tiles shown faded
7. **Self-correct:** 5s window for student to adjust → then answer revealed with full audio
8. Next round with harder sentence

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type IN ('WORD_BANK_BUILD', 'TRANSFORM')` via `useEscalatingPool`
- **LCS partial credit:** `computeLCSPartialCredit()` → `scoreForAttempt(mistakes, difficulty, ratio)`
- **FSRS:** `gradeObjective()` per sentence
- **Step type:** `SENTENCE_LAB`

#### Remote Controls
| Button | Action |
|---|---|
| 💡 Hint | Force-highlight next correct tile |
| 🔊 Play Audio | Replay target sentence |
| ✅ Check | Grade current arrangement |
| ⏭ Skip | Skip to next sentence |
| 🔁 Redo | Reset |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — building + self-correcting
- [x] FSRS connected? ✅ — partial credit scoring
- [x] Tactile UI? ✅ — tile snap, glow, shake
- [x] Scaffolded? ✅ — auto-hints, translation, audio

---

### GAME 6: `PHONICS_ARENA` — "Phonics Arena"
**Replaces:** BoardISayYouSay (unscored choral phase) + BoardListenTap's minimal pair slice
**Priority:** 6 — MEDIUM (phonics needs a dedicated engaging game with speech production)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
Round 1 "Discriminate": PLAY pair audio → STUDENT taps which word (2 options, fast)
Round 2 "Identify": PLAY pair audio → STUDENT taps from 4 options (harder)
Round 3 "Produce": SHOW word+image → STUDENT speaks → speech recognition validates
→ Streak counter across rounds → Final celebration
```
Dedicated phonics game: discriminate → identify → produce.

#### What's New vs. Legacy
| Legacy | New |
|---|---|
| Phase 2 unscored choral drill ("no scoring" banner) | Every round scored |
| Pronunciation capture "deferred" (unimplemented) | Speech recognition implemented in Round 3 |
| Only MINIMAL_PAIR_SWIPE type | MINIMAL_PAIR + SPEAK_SENTENCE + LISTEN_SELECT |
| No progressive difficulty | 3 rounds: 2 options → 4 options → speak |
| No streak mechanic | Streak counter with multiplier bonus |

#### UI/UX Architecture
```
BoardPhonicsArena
├── RoundIndicator          — 3 circles (1/2/3), current pulses
├── Round1Discriminate
│   ├── AudioPlayer         — Waveform + play button
│   ├── PairCards           — 2 word cards side by side
│   └── StreakCounter       — "🔥 x4" with flame animation
├── Round2Identify
│   ├── AudioPlayer
│   ├── QuadCards           — 4 word cards in grid
│   └── StreakCounter
├── Round3Produce
│   ├── TargetDisplay       — Word + image
│   ├── MicButton           — Big mic with recording pulse
│   ├── ScoreRing           — Circular 0-100% pronunciation score
│   └── TranscriptCompare   — "You said: ___" vs "Target: ___"
├── FinalScorecard          — All 3 rounds summary + total
├── ScoreFlyout
└── TurnFooter
```

**State Management:**
- `currentRound: 1 | 2 | 3`
- `currentItemIdx` — within each round
- `streak: number` — consecutive correct across rounds
- `pronunciationScore: number | null`
- `mistakesRef` / `awardedRef`

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type IN ('MINIMAL_PAIR_SWIPE', 'SPEAK_SENTENCE', 'LISTEN_SELECT')` via `useEscalatingPool`
- Round 1: MINIMAL_PAIR_SWIPE (2 options)
- Round 2: MINIMAL_PAIR_SWIPE + LISTEN_SELECT (4 options)
- Round 3: SPEAK_SENTENCE (single words/short phrases)
- **FSRS:** `gradeObjective()` per round. Round 3: `record: false` if speech recognition unavailable
- **Step type:** `PHONICS_ARENA`

#### Remote Controls
| Button | Action |
|---|---|
| 🔊 Replay | Replay audio |
| 🎤 Retry | Re-trigger speech recognition |
| ⏭ Next | Skip to next pair/word |
| 🔁 Redo | Reset all rounds |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — 3 active rounds
- [x] FSRS connected? ✅
- [x] Tactile UI? ✅ — waveform, score ring, streak flames
- [x] Speech recognition? ✅ — Round 3

---

### GAME 7: `VOCAB_BLITZ` — "Vocab Blitz"
**Replaces:** BoardSpeedQuiz (anxiety-inducing 15s one-shot)
**Priority:** 7 — MEDIUM (speed quiz concept is good but execution needs reform)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW question (adaptive timer by type) → STUDENT answers → INSTANT feedback with
correct answer highlighted → STREAK BONUS if consecutive → "Bet" mechanic for
metacognition → Final Jeopardy round as closer
```
Reformed speed quiz: adaptive timers, retry allowed, bet mechanic, final jeopardy.

#### What's New vs. Legacy
| Legacy (BoardSpeedQuiz) | New (BoardVocabBlitz) |
|---|---|
| 15s for ALL types (unfair for production) | Adaptive: 15s recognition, 25s production |
| One-shot (no retry) | One retry allowed (50% points on retry) |
| No "bet" mechanic | Confidence bet: 1x or 2x before question |
| No final round | "Final Blitz" high-stakes closer |
| Shows correct/incorrect but not the answer | Shows correct answer + audio after reveal |

#### UI/UX Architecture
```
BoardVocabBlitz
├── QuestionCard            — Animated card flip reveal
│   ├── PromptArea          — Question content (varies by type)
│   ├── OptionsGrid         — 2-4 options (type-dependent)
│   └── TimerBar            — Adaptive timer (color shifts green→yellow→red)
├── BetOverlay              — "Bet 1x or 2x?" before question (tap to select)
├── FeedbackDisplay         — Correct answer highlighted + audio
├── StreakBanner            — "🔥 x5 Streak!" with flame animation
├── ScoreFlyout             — Points × bet multiplier
├── FinalBlitz              — Last round: " wager your points!" + dramatic reveal
├── ProgressBar             — Q X of Y
└── TurnFooter
```

**State Management:**
- `currentQIdx` — question index
- `bet: 1 | 2` — confidence multiplier
- `streak: number` — consecutive correct
- `timeRemaining: number` — adaptive per type
- `retryUsed: boolean` — one retry allowed
- `mistakesRef` / `awardedRef`

#### Pipeline Connections
- **Content:** `pool_items` via `useQuizComposition` (existing quiz engine — reuse)
- Consumes: MEANING_MATCH, IMAGE_SELECT, SPELL_CLOZE, ERROR_SPOT, LISTEN_SELECT, WORD_BANK_BUILD
- **Timer config by type:**
  - IMAGE_SELECT, MEANING_MATCH, LISTEN_SELECT, SPELL_CLOZE, ERROR_SPOT → 15s
  - WORD_BANK_BUILD, TRANSFORM → 25s
- **FSRS:** `gradeObjective()` per question
- **Step type:** `VOCAB_BLITZ`

#### Remote Controls
| Button | Action |
|---|---|
| ✅ Correct / ❌ Wrong | Manual override (if auto-grading fails) |
| 💡 Hint | Eliminate one wrong option |
| ⏭ Skip | Skip question |
| 🔁 Redo | Reset |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — timer creates urgency, bet creates investment
- [x] FSRS connected? ✅
- [x] Tactile UI? ✅ — card flip, timer color shift, streak flames
- [x] Reduced anxiety? ✅ — retry allowed, adaptive timer

---

### GAME 8: `MEMORY_LAB` — "Memory Lab"
**Replaces:** BoardWhatsMissing / MagicEyes (764 lines, teacher-typing produce mode)
**Priority:** 8 — LOW (memory game is fun but pedagogically shallow)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHOW grid of images (timed memorize) → REMOVE one → STUDENT taps which is missing
→ ESCALATE: larger grid, shorter memorize, produce mode via SPEECH RECOGNITION
→ "What's missing?" → student speaks the word → speech recognition validates
```
Memory game with speech recognition production (replaces teacher typing).

#### What's New vs. Legacy
| Legacy (BoardWhatsMissing) | New (BoardMemoryLab) |
|---|---|
| Produce mode requires teacher typing | Speech recognition replaces teacher typing |
| Fixed grid size | Progressive: 4→6→8 images, memorize time decreases |
| 764 lines, complex state machine | Clean rewrite, ~400 lines |
| Legacy MagicEyes fallback code | No legacy fallbacks |
| No audio on memorize phase | Ticking clock sound during memorize |

#### UI/UX Architecture
```
BoardMemoryLab
├── MemorizePhase
│   ├── ImageGrid            — 4/6/8 images with flip-in animation
│   ├── CountdownRing         — Circular timer (10s/8s/6s)
│   └── ClockTick             — Subtle ticking audio
├── RecallPhase
│   ├── ImageGridWithGap      — One slot empty (or blurred for magic_eyes)
│   ├── CandidateCards         — 4 options (tap which is missing)
│   └── MicButton              — "Say it!" for produce mode (round 3+)
├── FeedbackOverlay            — Correct image bounces + audio plays
├── RoundIndicator             — Round 1/2/3 (recognize → recognize → produce)
├── ScoreFlyout
└── TurnFooter
```

**State Management:**
- `round: 1 | 2 | 3` — escalation
- `gridSize: 4 | 6 | 8` — progressive
- `memorizeTime: number` — 10/8/6 seconds
- `removedIndex: number` — which item was removed
- `phase: 'memorize' | 'recall' | 'feedback'`
- `mistakesRef` / `awardedRef`

#### Pipeline Connections
- **Content:** `pool_items` WHERE `exercise_type = 'IMAGE_SELECT'` via `useEscalatingPool`
- Round 3 produce mode: `SPEAK_SENTENCE` items (single words)
- **FSRS:** `gradeObjective()` per round
- **Step type:** `MEMORY_LAB`

#### Remote Controls
| Button | Action |
|---|---|
| 🎤 Retry | Re-trigger speech recognition |
| ⏭ Skip | Skip to next round |
| 🔁 Redo | Reset |

#### Self-Audit
- [x] Zero teacher typing? ✅ — speech recognition
- [x] Zero passive time? ✅ — memorize + recall + produce
- [x] FSRS connected? ✅
- [x] Tactile UI? ✅ — flip-in, countdown ring, bounce
- [x] Cleaner code? ✅ — ~400 lines vs 764

---

### GAME 9: `CLASS_RALLY` — "Class Rally"
**Replaces:** Nothing (entirely new concept — collaborative classroom game)
**Priority:** 9 — LOW (nice-to-have energy builder, not core pedagogy)
**Status:** 🔴 NOT STARTED

#### Pedagogical Loop
```
SHARED PROGRESS BAR (class goal) → Each correct answer from ANY student fills bar
→ MILESTONE = class celebration → All students see collective progress
→ TARGET filled = bonus XP for entire class
```
Collaborative (not competitive). Entire class works toward a shared goal.

#### What's New
- First cooperative game in the system (vs. all current games being competitive)
- Builds class community and collective investment
- Low-stakes: wrong answers don't penalize the class, they just don't fill the bar
- Good warm-up or cool-down activity

#### UI/UX Architecture
```
BoardClassRally
├── RallyBar               — Giant progress bar with milestone nodes
│   ├── MilestoneNode       — Celebration trigger at 25/50/75/100%
│   └── FillAnimation       — Liquid-fill effect as progress grows
├── QuestionArea            — Current question (varies by type)
├── TeamScoreCards          — Red vs Blue — BOTH contribute to the Rally Bar
├── CelebrationOverlay      — Confetti + class message at milestones
├── TurnFooter
```

**State Management:**
- `classProgress: number` — 0-100% fill
- `totalCorrect: number` — class-wide correct count
- `targetCorrect: number` — goal (e.g., 15 correct answers)
- `milestone: number` — last reached milestone (0/25/50/75/100)
- `currentQuestion` — active question

#### Pipeline Connections
- **Content:** Mixed `pool_items` via `useBoardPool` — all exercise types
- **FSRS:** `gradeObjective()` per correct answer (same as any game)
- **Step type:** `CLASS_RALLY`

#### Remote Controls
| Button | Action |
|---|---|
| ⏭ Next | Next question |
| 🔁 Redo | Reset rally |

#### Self-Audit
- [x] Zero teacher typing? ✅
- [x] Zero passive time? ✅ — each student must answer when picked
- [x] FSRS connected? ✅
- [x] Tactile UI? ✅ — liquid-fill bar, confetti, milestone celebrations
- [x] Collaborative? ✅ — class works together

---

## Implementation Sequence

| Order | Game | Replaces | Priority | Est. Complexity |
|---|---|---|---|---|
| 1 | GRAMMAR_LAB | GrammarSandbox + GrammarForge + GrammarPractice | CRITICAL | High (3 rungs) |
| 2 | WORD_DETECTIVE | FlashMatch + FocusCards | CRITICAL | Medium |
| 3 | SOUND_LAB | ListenTap | HIGH | High (3 phases + speech) |
| 4 | STORY_QUEST | StoryStage + StorySequencing | HIGH | High (multi-phase) |
| 5 | SENTENCE_LAB | Unscramble | MEDIUM | Medium |
| 6 | PHONICS_ARENA | ISayYouSay + ListenTap phonics slice | MEDIUM | Medium |
| 7 | VOCAB_BLITZ | SpeedQuiz | MEDIUM | Medium |
| 8 | MEMORY_LAB | WhatsMissing / MagicEyes | LOW | Medium |
| 9 | CLASS_RALLY | (new) | LOW | Low |

### Shared Prerequisites (build first)
1. **Extract LCS helpers** from BoardUnscramble into `apps/board/templates/scoringUtils.ts` — `lcsLength()`, `computeLCSPartialCredit()`, `detectSwappedPair()`, `highlightFirstWrongPosition()`
2. **New exercise type `GRAMMAR_FILL`** — add to `types/exercise.ts`, teach `generate-exercises` to produce it from `grammar_rules` transformation_pairs
3. **Speech recognition hook** — extract from `apps/student/exercises/SpeakSentence.tsx` into a shared `apps/board/templates/useSpeechRecognition.ts` for board-side use
4. **Animation library** — confirm `framer-motion` is available (it is — used in existing templates)

---

## Build Log

| Game | Started | Completed | Notes |
|---|---|---|---|
| GRAMMAR_LAB | 2026-08-07 | 2026-08-07 | ✅ Audited+rewritten: per-item rung shapes, ERROR_SPOT contract fix, MARK_CORRECT override, empty state |
| WORD_DETECTIVE | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: IMAGE_SELECT/AUDIO_L1_SELECT support, triple-write, empty state |
| SOUND_LAB | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: real dictation distractors, replay-penalty fix, empty-phase skip |
| STORY_QUEST | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: manifest story source, real predictions, sequential comprehension |
| SENTENCE_LAB | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: memoized shuffle (tiles no longer re-shuffle per tap), triple-write |
| PHONICS_ARENA | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: real round-2 distractors, per-round resets, empty-state handling |
| VOCAB_BLITZ | 2026-08-07 | 2026-08-07 | ✅ Audited+fixed: retry-exhausted reveal (no infinite loop), per-question resets |
| MEMORY_LAB | 2026-08-07 | 2026-08-07 | ✅ Built: 3 rounds (4→6→8 grid, 10s→8s→6s), speech-recognition produce with tap fallback |
| CLASS_RALLY | 2026-08-07 | 2026-08-07 | ✅ Built: cooperative rally bar, milestones 25/50/75/100%, confetti, no-penalty design |

---

## Systemic Integration Fixes (audit round, 2026-08-07)

| Issue found | Fix |
|---|---|
| All 9 new shells missing from `SHELL_CAPABILITIES` → `buildRound` returned wrong/zero content | Registered all 9 in `apps/board/lessonDirector.ts` with consumes lists + rungRanges matching the ladders |
| All 9 step types missing from `SUPPORTED_FLOW_TYPES` → lesson flows would DROP the slides | Added to `supabase/functions/_shared/flowTypes.ts`; **orchestrate-lesson redeployed** |
| `GRAMMAR_FILL` missing from Deno mirror + generator never emitted it | Added to `_shared/exerciseTypes.ts` (+RECEPTIVE_TYPES) + `generate-exercises` now emits one GRAMMAR_FILL per grammar rule (correct = transformed/example sentence, distractors = error_examples wrong sentences); **generate-exercises redeployed** |
| No analytics dual-write in any new game | Created `apps/board/templates/scoreAttempt.ts` → `logAttempt()` = recordAttempt + gradeObjective + pushToRemediation; wired into all 9 games |
| `awardedRef` latch blocked scoring after the first item in all multi-item games | Per-item/round/question reset of `mistakesRef` + `awardedRef` in every advance function |
| Forever-loading when pool is empty (production has thin pools) | All 9 games render a dedicated empty state with guidance instead of an endless spinner |
| BoardGrammarLab rung state machine dead-ended after rung 1 | Rewritten: each pool item renders its own rung shape (error_spot MCQ / transform assembly / fill_blank MCQ) |
| ErrorSpotContent `correct_index` misused as a sentence token index | Rung 1 now renders the correction-options MCQ per the real contract |
| Fake placeholder content (PhonicsArena 'word3/word4', SoundLab 'She X' distractors, StoryQuest static predictions) | Replaced with real pool/manifest-derived content in all three |
| Audio via `new Audio()` bypassing the speech service | All games use `playAudioUrl` from SpeechService |

## Deployment Record (2026-08-07)

- Frontend: `vercel --prod` → https://professor-ruby.vercel.app (200 OK)
- Edge: `generate-exercises` + `orchestrate-lesson` redeployed (401 = live)
- Typecheck: 0 errors in all new/modified board/teacher/remote files
- Build: vite build OK (9.2s)

## Enrichment Pipeline Fix — COMPLETE & VERIFIED (2026-08-07)

Plan: `Enrichment_Pipeline_Fix_task-987.md`. All workstreams A–E landed and verified in production (F deferred by plan; G gated on the TTS session).

| Workstream | Fix | Production evidence |
|---|---|---|
| A — batched uncapped vocab | `enrichVocabularyBatched()` (batches of 5, idempotent skip, time-budget guard, per-batch incremental persistence, JSON salvage) + `FAST_MODELS` ordering (kimi truncated at 5000 tokens; qwen leads now) | "Animals in the Wild": 12/12 extracted words in `vocabulary_items`; re-run returns `already_complete` in 5s (idempotent) |
| B — grammar capture | Prompt scans whole extracted text for drilled structures; requires `pattern_template` + `transformation_pairs` + `error_examples`; FAST_MODELS for grammar too | 4 `grammar_rules` rows, each with 4 pairs + 4 errors. ("There is/are" absent because the unit's 650-char extraction genuinely contains no such text — faithful, not invented) |
| C — presence honesty | `presence` object in enrich-unit responses (`no_source` / `ok` / `partial` / `already_complete` / `failed`); `useEnrichment` surfaces notices instead of silent empty cards | Presence JSON observed live for vocab + grammar runs |
| D — pool gate | Gate relaxed: story/dialogue-only units no longer rejected | Unit `80c0e9f0` (0 vocab, 0 grammar): `success: true` in 8s |
| E — telemetry attribution | `unit_id` on `llm_telemetry` inserts in enrich-unit + extract-page (+ optional `unitId` param); frontend passes it from both extract-page call sites | Post-deploy telemetry rows attributed to `ff6cbfcb` |

Additional fixes required to make the end state true at runtime:
- **GRAMMAR_FILL registry row** — `activity_type_registry` was silently gating the emission out; migration `20260807000001_register_grammar_fill.sql` applied. Pool now: ERROR_SPOT 16 / TRANSFORM 12 / GRAMMAR_FILL 4 + full vocab battery = 167 items, 18 objectives.
- **`classWeakObjectives` vocab-only filter removed** (`services/boardLearner.ts`) — grammar/story/dialogue objectives now ranked too.
- **`buildRound` presentation-rung skip** (`apps/board/lessonDirector.ts`) — never-seen grammar objectives capped at rung 1 (presentation-only, empty) now land on their first practice rung; only fills rounds that were previously empty.
- **Live verification**: GRAMMAR_LAB slide renders real pool content in both `/board` and Live Commander ("Rung 2: Spot the Error" — "It live in the sea." + 4 fix options; 16 items cycling). Plan Composer library offers all 9 new-gen games; Grammar Lab block added + launched live end-to-end.

Known pre-existing (out of scope, separate workstream): 7 `BoardComponents.test.tsx` failures — copy-string mismatches from the earlier FocusCards/StoryStage v2 rebuilds; tests were never updated to the new copy.

## Remaining Risks & Follow-ups

1. **Pool content is thin in production** (`pool_items` historically 0 rows). Games render empty states gracefully, but gameplay requires running enrichment + `generate-exercises` per unit. Root cause tracked in AGENTS.md §3 (NULL-owner units + fire-and-forget trigger).
2. **STORY_QUEST vocab-tap FSRS exposure** — tap audio + visual state work, but `recordExposure` needs a word→objective_id join not available client-side (CanonicalVocab carries no objective id). Follow-up: resolve via a small RPC or objectives lookup.
3. **SOUND_LAB / PHONICS_ARENA speech recognition** depends on Web Speech API availability (Chrome/Edge best). Both degrade to tap-based fallbacks; when unsupported, productive attempts are engagement-only (no fake FSRS success) — consistent with the `record:false` convention.
4. **Grammar objectives need prior exposure** to reach rung 2+ (by design of the mastery ladder) — GRAMMAR_LAB activates after the Grammar presentation slide has recorded exposure. On a brand-new unit, run INPUT slides first.
5. **Legacy shells coexist** — old types (FLASH_MATCH, LISTEN_TAP, SPEED_QUIZ…) remain routable; existing published flows keep working. Retire per transition plan once lessons are re-orchestrated onto the new shells.
6. **CLASS_RALLY TARGET_CORRECT (12)** is a constant; a per-class-size adaptive target is a possible follow-up.
