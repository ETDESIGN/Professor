# Grammar System — Deep Audit & Redesign (round 2, 2026-09-15)

> **Status:** IN PROGRESS — ZCode §0–§3 + Anti-Gravity §4 (quality opinion + redesign proposal). Owner approves the synthesis BEFORE implementation.

## §0 Scope — every surface the grammar system touches
- **Generation:** `supabase/functions/enrich-unit` (grammar_rules: rule / explanation / error examples / transform pairs emitted into the manifest) · `orchestrate-lesson` (GRAMMAR_SANDBOX block) · `generate-exercises` (GRAMMAR_FILL / ERROR_SPOT / TRANSFORM pool items from grammar_rules; ERROR_SPOT distractor quality was reworked 2026-09-12, commit 17cbe21)
- **Board presentation:** `BoardGrammarSandbox.tsx` (INPUT phase — the teaching moment)
- **Board practice games:** `BoardGrammarLab.tsx` (v3) · `BoardGrammarForge.tsx` (v3)
- **Student app:** `SoloLessonPlayer.tsx` grammar step (micro-quiz pattern shipped 2026-09-14, commit 9f4a9e2 — reference implementation) + any grammar games under `apps/student/`
- **Data writes:** FSRS via `gradeObjective` (scored games only), attempts log — the presentation/teaching moments must NOT write learner data

## §1 Owner symptoms (verbatim intent)
- "How often do you brush your hair?" → "I never brush my hair before bed": the transformed answer feels randomly matched to the question, with almost no explanation of the connection. "There is a big flaw in the architecture of this game."
- Grammar Sandbox ("Do you ever eat vegetables?" → "She always eats vegetables at dinner"): "very confusing — I don't know what the teacher can do with that. Needs a full reorder and upgrade."
- Retested on the student app too: "still not perfect" → "a big gap in this grammar, different grammar exercises."

## §2 ZCode factual findings (code-derived; to be completed during the audit)
- (to be filled — generation prompt depth, GRAMMAR_FILL coverage per unit, content field inventory, per-surface rendering paths)

## §3 Known prior art inside this repo
- Student-app micro-quiz (9f4a9e2): 2 pool-driven GRAMMAR_FILL items, cloze with reveal, example-derived fallback, engagement gate, speech warm-up. Pattern to adapt to the classroom (teacher-driven, oral, choral) — NOT to copy blindly.
- ERROR_SPOT distractor rework (17cbe21): near-miss same-stem distractors — content-quality precedent.

## §4 ⬜ Anti-Gravity — quality opinion + redesign proposal
*(AG writes here: pedagogical analysis of the current grammar flow across surfaces, gap analysis vs ESL best practice for 6–12 y/o, and a concrete redesign proposal — the teaching arc, what content fields the generator must emit, and per-surface changes. Markdown only, no code.)*

## §5 ⬜ Synthesis → owner approval
*(ZCode merges both audits into ONE redesign proposal with scope estimate; owner approves before implementation.)*
