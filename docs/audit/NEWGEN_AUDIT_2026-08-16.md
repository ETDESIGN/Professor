# New-Gen Games — Audit & Design Review
**Date:** 2026-08-16 · **Trigger:** owner live-test verdict — *"a few bugs, but mostly the games, the interaction, the playability seem somehow limited or lack of sense."*

Three parallel audits: (1) lifecycle/scoring correctness, (2) game-design/playability critique, (3) content-pipeline reality check. Every claim below carries file:line evidence from the source.

---

## Part 0 — Why it feels limited: three converging causes

The complaint is not one bug. It's three systemic conditions stacking:

1. **Monotonous interaction.** All 9 games use tap-1-of-N MCQ as the primary verb. The complete distinct-verb inventory across the whole library: SELECT, ORDER (2 games, both distractor-free), SPEAK (3 games, same mic widget), MEMORIZE (1 game). Every correct answer is a silent green flash; every wrong answer is a silent red flash that teaches nothing. **No game plays any sound** — the synth engine (`BoardSoundLayer.tsx:43-78`) exists but zero games call it.

2. **Content starvation.** The games are structurally starved of variety by four hidden gates (Part 3): round-pinning locks every escalating game to its floor rung (GrammarLab = ERROR_SPOT-only forever, WordDetective = IMAGE_SELECT-only forever); GRAMMAR_FILL sits in no ladder rung so it can never be selected; fresh classes get *empty* pools for SoundLab/SentenceLab; PhonicsArena is permanently empty (no phonics objectives exist anywhere) and shows a **fake victory screen** for zero items played. The pool also never shuffles — same first-N items in the same order every session.

3. **Dead time and no role for the audience.** Fixed auto-advance delays (2-2.5s full-screen emoji per item) accumulate to **25-30 seconds per slide** where the class watches a static image. Meanwhile 28 of 29 children have literally nothing to do — no choral hooks, no teams, no steal mechanics; only ClassRally gestures at collectivity, and even its "choral mode" is a code comment, not a feature (`BoardClassRally.tsx:153`).

Plus the orchestrator **never schedules any of the 9 games** — the AI prompt and deterministic fallback only know legacy types (`prompts/index.ts:86-96`, `orchestrate-lesson/index.ts:36-290`), so new-gen games appear only when hand-added in PlanComposer. A teacher who doesn't know that plays the same legacy flow forever and concludes "nothing changed."

---

## Part 1 — Correctness findings

### What's solid ✅
- Lifecycle points 1-4 hold in **all 9 games**: turnId reset with null guard, mistake refs feeding `scoreForAttempt`, per-item award latch resets (the SpeedQuiz bug pattern is fixed everywhere), correct AND wrong paths triple-write via `logAttempt` (`scoreAttempt.ts` API: caller does `addPoints` + `logAttempt`).
- Field names: canonical everywhere except one phantom read (`GrammarLab.tsx:298` `content.pattern_template` — not in any content variant; harmless fallthrough).
- 8/9 render proper branded empty-state cards when the pool is dry.

### P1 — functional breakage (fix immediately)

| # | Bug | Where |
|---|---|---|
| 1 | **No `SLIDE_COMPLETE` broadcast — all 9 games.** The director loop can't know a slide finished; reference shells fire it (`BoardUnscramble.tsx:279`). The new-gen remote sets also dropped the End button (`ContextualControls.tsx:153-220`) | all 9 templates |
| 2 | `handleTimeUp()` called **inside the `setTimeRemaining` updater** — React may double-invoke → double −5 penalty, two incorrect analytics rows, question skipped | `BoardVocabBlitz.tsx:100-109` |
| 3 | IMAGE_SELECT options rendered as text → shows **`[object Object]`** (options are `{image_url,label}` objects) | `BoardVocabBlitz.tsx:57, 370-386` |
| 4 | `<img src={option}>` where `option = o.label \|\| o.image_url` → **broken images** whenever a label exists (label is a text caption) | `BoardSoundLab.tsx:82, 455` |
| 5 | Story-less unit → **forever "Loading story…" spinner** (no terminal empty state) | `BoardStoryQuest.tsx:233-239` |
| 6 | Remote REVEAL_HINT sent but unhandled → **dead Hint button** | `BoardStoryQuest.tsx:96-113` |
| 7 | Zero items → rounds cascade to **celebration screen with nothing played** | `BoardPhonicsArena.tsx:360-364, 534` |
| 8 | Audio/answer mismatch: plays `prompt_text \|\| pair[0]` but accepts `options[correct_index].text \|\| pair[0]` — when both fall back differently, the right answer per the audio is marked wrong | `BoardPhonicsArena.tsx:81-82, 97-99` |
| 9 | Hint highlights shuffled-bank positions 0-1, **not the correct next tile** — the "hint" points at arbitrary words | `BoardSentenceLab.tsx:259-264, 347` |
| 10 | Duplicate-word sentences can't be built (`isUsed = buildTiles.includes(tile)` kills all copies of a repeated word) — GrammarLab handles this correctly with per-tile counts (`:374-377`) | `BoardSentenceLab.tsx:336` |

### P2 — real but bounded
- Stale advancement `setTimeout`s without cleanup in all 9 games (RESET_GAME/new-turn during the 1.5-2.2s window → item index jumps after reset). Only GrammarLab's pattern beat and SentenceLab's hint timers do it right.
- `BoardGrammarLab.tsx:225-239` — side effects inside a state updater (impure; fragile under StrictMode).
- `BoardVocabBlitz.tsx:65` — dead `isProduction` branch (pool is MCQ-only; the "adaptive timer" is fictional).
- `BoardSoundLab.tsx:247` vs `:216` — inconsistent difficulty fallback on speech misses (1 vs 3).

---

## Part 2 — Design critique (per game, one line each)

| Game | Core verdict |
|---|---|
| **GrammarLab** | Spec promised token-level tap-the-error + red→green diffs + 3-rung ladder; shipped a sentence-options quiz with a 2s title card and a hint that paints the answer yellow (`:335-336`). TRANSFORM bank has zero distractors — an anagram, not a choice. |
| **WordDetective** | Pure 1-of-4 quiz wearing a detective hat — no magnifier, no drag, theme is header text. 3.5s of chained timeouts per item (~28s/slide dead time). Hint = highlight the correct card. |
| **SoundLab** | Best phase structure (recognize→discriminate→produce) but 2 of 3 phases are the same MCQ; DICTATION/SPEAK_SENTENCE unreachable (rungs 4/5, pinned at 2); replay-cost tension only visible in phase 1. |
| **StoryQuest** | Good instinct (non-punitive prediction gate) but predictions are unscored text-MCQ with same-story distractors; promised inference phase absent; vocab-tap FSRS exposure not implemented; "story map" is 4px dots. |
| **SentenceLab** | **Best core mechanic** (tile construction) but: promised LCS green/amber diff not rendered, failure never reveals the answer, hint highlights arbitrary tiles (bug), zero distractors on TRANSFORM, and GrammarLab's transform rung duplicates the same verb. |
| **PhonicsArena** | "Arena" is a name, not a mechanic — no clock, no opposition, no visible score. Round 2 = round 1 with 4 options instead of 2, from the same pool slice. Streak badge is cosmetic. Permanently starved (Part 3). |
| **VocabBlitz** | Only game with real timer urgency and the only right-answer reveal (after double-miss) — but the bet is broken (2x strictly dominates; "same penalty if wrong" per its own UI), timeout = −5 with NO reveal (the anxiety the redesign existed to kill), and streak has no upside. |
| **MemoryLab** | **The best game in the library**: real 4→6→8 memorize ladder with shrinking timers, the only class-wide tension moment (29 kids can silently memorize together), best correct-feedback (missing card bounces in + word + Hear-it). Ends just as the class learns it; cards too small for the back of a classroom; no ticking clock. |
| **ClassRally** | Only collective goal (shared bar + milestones + the only confetti in the library) and the only copy addressed to the whole room — but underneath it's the plainest MCQ, and the promised choral/team fill doesn't exist. |

**Cross-game dead-time inventory:** GrammarLab ~25s/slide, WordDetective ~28s, SentenceLab ~22s — full-screen emoji holds on every item. VocabBlitz timeout penalty with no reveal for 6-12 year-olds. Speech rounds assume the projector's mic hears a child from their seat, with no teacher "accept that pronunciation" override on any remote (`ContextualControls.tsx:169-198`).

---

## Part 3 — Content pipeline: the four hidden gates

The generation side is healthy (10 vocab types, 4 grammar types, story + dialogue; registry now complete after today's GRAMMAR_FILL fix). Starvation happens downstream:

1. **Round pinning.** All 5 escalating games pass `roundIndex:1, totalRounds:1` → `roundBaselineRung` returns the shell floor (`lessonDirector.ts:267`) → `targetRung = min(floor, mastery)` forever. GrammarLab can never see TRANSFORM (rung 3); SoundLab can never see DICTATION/SPEAK_SENTENCE (rungs 4/5); SentenceLab sees neither of its types on a fresh class. **Item 6 of every slide is mechanically identical to item 1.**
2. **GRAMMAR_FILL unreachable.** In `SHELL_CAPABILITIES.GRAMMAR_LAB.consumes` but in no rung of `GRAMMAR_LADDER` (`lessonDirector.ts:149-154`) → `buildRound` can never name it. GrammarLab's rung-3 MCQ is dead code end-to-end even after today's registry fix.
3. **Mastery gating on fresh classes.** Unseen objectives → rung 1 → if the shell doesn't consume rung-1 types (SoundLab, SentenceLab don't), `buildRound` **drops the objective** (`lessonDirector.ts:313-314` — `continue` instead of adapting to a consumable rung) → "No items ready" cards on first-ever lessons despite a full pool.
4. **Phonics has no objectives.** `generate-exercises` only ensures vocabulary/grammar/story/dialogue objectives; PhonicsArena's consumes list also misses rung-1 vocab's IMAGE_SELECT → permanently empty → false victory.

Aggravators: no pool shuffling (`useBoardPool.ts:48-51`, insertion order, stable classWeak sort → same first-N every session); thin per-type volumes (1 WORD_BANK_BUILD per rule, ERROR_SPOT capped by error_examples); IMAGE_SELECT conditioned on ≥3 sibling real images (image-gen failures silently hollow WordDetective/MemoryLab); orchestrator's AI prompt and deterministic fallback enumerate only legacy types → **the 9 games are never auto-scheduled**; empty-state advice ("run the exercise generator") misleads — generation already ran, the gate is rung logic.

---

## Part 4 — Prioritized improvement plan

### Tier 0 — Unbreak (hours, mechanical)
1. Fix the 10 P1 bugs (Part 1 table). All are small, local, verified line-referenced fixes.
2. `SLIDE_COMPLETE` broadcast + End button restored for all 9 games.
3. Add GRAMMAR_FILL to `GRAMMAR_LADDER` rung 3 (one line).
4. `buildRound` adaptation: instead of dropping an unconsumable objective, walk down/up rungs to the nearest rung whose types ∩ shell.consumes ≠ ∅ (fixes fresh-class starvation in SoundLab/SentenceLab).
5. Shuffle pool items client-side in `useBoardPool` (or `order by random()` server-side).

### Tier 1 — Make it feel alive (1-2 days)
6. **Sound everywhere**: one `playCue('correct'|'wrong'|'streak')` helper wrapping the existing synth; call it in every result branch. Biggest felt-difference per line of code in this whole plan.
7. **Reveal-on-wrong**: second miss → show correct answer + `explanation` (field already ships in content; VocabBlitz already has the pattern). Timeout → reveal too, drop the raw −5 for youngest, or make it a "time's up, let's learn it" beat.
8. **Kill dead time**: compress emoji holds to <800ms, or fill the window with teaching (speak the correct sentence aloud via existing TTS, "say it with me" for the class).
9. **Real rounds**: pass actual `roundIndex/totalRounds` (e.g. 3 rounds per slide) so escalation climbs within the slide — round 3 of GrammarLab becomes production, not a fourth MCQ.
10. **Streaks that matter**: multiplier in `scoreForAttempt`, confetti (already in SessionContext) on 3-streak; fix or delete VocabBlitz's dominant-strategy bet.
11. **Orchestrator knows the games**: add the 9 types to the AI orchestration prompt + a phase-aware rotation in the deterministic fallback, so lessons actually include them.

### Tier 2 — Give the 28 watchers a job (design work, ~a week)
12. ClassRally: real choral mode — teacher taps "ALL ANSWER", class responds, teacher marks it, bar fills (the code comment already claims this exists).
13. Steal/backup: on a miss, offer the question to a rival team or a "phone a friend" class vote (GrammarLab, VocabBlitz first).
14. MemoryLab: choral countdown beat ("point at the missing card!"), bigger cards for projector, ticking clock, more rounds.
15. Speech teacher-override: "accept pronunciation" button on the remote (currently no Correct action exists for SoundLab/PhonicsArena).
16. PhonicsArena decision: either generate phonics objectives in the pipeline or retarget the game to vocab minimal-pairs (consume IMAGE_SELECT at rung 1) — today it's a screen that can never play.

### Tier 3 — Deepen the mechanics (per-game redesigns, post-Tier-2)
17. GrammarLab: token-level tap-the-error (the original spec's core interaction) + red→green diff animation.
18. TRANSFORM/WORD_BANK distractor tiles (both GrammarLab and SentenceLab banks are distractor-free today).
19. SentenceLab: render the promised LCS green/amber diff + 5s self-correct window.
20. StoryQuest: inference phase at the story climax; image-based prediction options; vocab-tap FSRS exposure.
21. WordDetective: earn an actual detective mechanic (magnifier reveal, case-file progression).

---

## Recommended sequencing

**Tier 0 immediately** (it's all verified, mechanical, and several items are user-visible bugs). Then **Tier 1 as one sprint** — items 6-8 together are what converts "silent color swaps" into a game that feels alive; 9-11 make sessions differ from each other. Tier 2 is the real answer to "the class watches one kid" and needs your classroom judgment on which mechanics fit your teaching style. Tier 3 per-game redesigns should wait until Tiers 0-2 are validated live.

**Post-fix validation:** regenerate pool for one grammar unit, verify GRAMMAR_FILL rows appear in `pool_items`, play GrammarLab 3 rounds and confirm round 3 differs from round 1, and check `select * from point_transactions where source='attempt' order by created_at desc limit 5` for honest analytics.
