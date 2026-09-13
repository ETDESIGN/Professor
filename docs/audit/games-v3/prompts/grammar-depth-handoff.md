# Handoff → live-class audit session: the grammar content-depth issue (add to your audit task)

Paste everything below the line into the session currently auditing the live-class/board games.

---

## ADD THIS to your audit: the grammar content-depth issue (same one the owner just hit in the student app — already fixed there; audit + fix the board equivalent)

### The issue (owner's words, student app, 2026-09-14)

Testing a lesson's grammar step, the owner found: **"the educational message is a little bit light"** — and three concrete symptoms:

1. **Thin content**: the grammar presentation shows a rule + a short explanation + 2–3 examples, and that's the whole teaching moment. No practice, no check, nothing that makes the child engage with the rule.
2. **Cosmetic quick-check**: where a check existed, it was **hardcoded demo content** ("Which word is in the past tense?" → walk/walked/walking) — identical for every unit, connected to nothing.
3. **Skippable**: the child can tap Next and reach the end of the lesson without ever listening or checking anything. (Plus: first audio tap had a 1–2s delay — TTS cold start.)

The owner chose the **deeper fix**: a real micro-quiz per grammar rule, gated into the step.

### The student-app fix (already live — commit `9f4a9e2`, `apps/student/SoloLessonPlayer.tsx`)

Pattern to replicate on the board side:

1. **Real content, not demos**: the grammar step now loads **2 `GRAMMAR_FILL` items from the unit's `pool_items`** (query: `unit_id` + `exercise_type='GRAMMAR_FILL'`, limit a few, take 2). Fallback when the pool is empty: derive one cloze from the step's own `examples` (blank the past-tense/longest word; distractors = words from the other examples). Options are shuffled with `correctIndex` kept in sync.
2. **Teaching-beat interaction**: sentence renders with a styled blank (`?` chip → fills with the correct word on reveal), 3 option chips, tap → reveal with correct/wrong coloring + `playCue`, then tap-to-advance to question 2, ending in a "Done ✓" state.
3. **Engagement gate**: the step's Continue is disabled-by-guidance until the child has **heard ≥1 example audio AND finished the quiz**. Tapping early opens a small **Chinese guidance modal** (先完成这一页的小任务再继续 / 听一个例句的发音，然后做完下面的小测验). It's guidance, not a hard lock.
4. **No learner-data writes** in the presentation gate — it's the teaching moment; real FSRS assessment stays in the practice battery (Grammar Lab / GRAMMAR_PRACTICE games). Keep that separation on the board too (`gradeObjective` belongs to the scored games only).
5. **Audio latency fix**: warm the speech engine on step entry (`window.speechSynthesis?.getVoices()` in an effect keyed to the step) so the first speaker tap doesn't pay the synthesis cold-start.

### What to audit / fix on the BOARD side (this session's task)

1. **`GRAMMAR_SANDBOX` board template** (`apps/board/templates/BoardGrammarSandbox.tsx` or wherever the flow's grammar presentation renders): check for the same symptoms — thin rule+examples only, any hardcoded quick-check, no class engagement beat. Apply the same pattern, adapted to the classroom model (teacher drives, kids answer orally): load the same 2 GRAMMAR_FILL pool items via the existing pool hooks (`useBoardPool` family), render a **class oral quick-check** — big A/B/C chips, teacher taps what the class answered, reveal + choral read of the full sentence. No new gates (the teacher controls pacing), but the check becomes a real teaching beat with real unit content.
2. **Grammar Forge / Grammar Lab v3 games** (`BoardGrammarForge.tsx`, `BoardGrammarLab.tsx`): verify their content is pool-driven (they should be — v3 work) and that nothing ships hardcoded demo options. Note findings in their games-v3 audit files if not.
3. **The generator is the root cause**: `supabase/functions/enrich-unit` / `orchestrate-lesson` emit the GRAMMAR_SANDBOX block's `rule`/`explanation`/`examples` — audit whether the generation prompt asks for enough depth (target: rule + 3 examples + a one-line "why" the way the student app's design shows) and whether GRAMMAR_FILL pool coverage exists per unit so the micro-quiz fallback rarely triggers. If the prompt needs strengthening, that's an edge-function change → apply it, **redeploy the function by hand** (`npx supabase functions deploy enrich-unit orchestrate-lesson --project-ref xsdnzijketjnzhakqtit --no-verify-jwt` — board pushes do NOT auto-deploy functions), and note the redeploy in your audit log.
4. Same discipline as always: data-write paths verbatim, gauntlet (`tsc` 0 / vitest ≥835 / build clean — pipe exit codes properly, don't let a failing suite slip through a grep pipe), explicit-path commits, verify the deploy per AGENTS.md §8.

Reference implementation to copy from: `apps/student/SoloLessonPlayer.tsx` — search `grammarQuizItems` (state + pool loader + shuffle with correctIndex sync + gated footer + Chinese modal) and the `speechSynthesis?.getVoices()` warm-up effect.
