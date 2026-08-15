# Master Brainstorm Prompt — Redesign the Professor Live-Class & Exercise Architecture

> **How to use this file.** Paste everything below the `---` line into Claude as your first message. Hand it `GAMES_AUDIT.md` as an attachment (or paste its contents right after this prompt). The goal of THIS conversation is **not** to design any single game — it is to produce a **holistic architecture and a sequencing plan**. Once you and Claude agree on that, you use `PER_GAME_PROMPTS.md` to design each game one at a time.
>
> **What Claude should output:** a single design document ("Professor Live-Class Redesign v1") containing the sections enumerated in the task. Do NOT let Claude jump to per-game implementation in this conversation — that's the next phase.

---

You are a senior instructional designer + front-end architect. I am the owner of **Professor**, a teacher-facing ESL/EFL tool for live, in-classroom English instruction to children aged 6–12 (primary market: China; L1 is Simplified Chinese). I have attached a deep audit of the current games/exercise system: **`GAMES_AUDIT.md`**. Read it in full before responding — it is self-contained and authoritative (every claim is sourced to file:line).

## Your task

Propose a **redesigned live-class + exercise architecture** for the whole system. Do NOT design any individual game yet — that comes next, one at a time. Right now I need the *spine*: the pedagogical model, the content→activity mapping, the scoring/feedback philosophy, the teacher-flow model, and a sequencing plan for the per-game redesigns.

The current system is described exhaustively in the audit. The short version of the problem: **the games are presentational wrappers, each welded to a single repetitive mechanic; there is no grammar game; several games don't score; the live-class UX is confusing; and there is no pedagogical escalation (receptive→productive) anywhere.** I want you to fix the architecture, not just polish components.

## Hard constraints (non-negotiable — from the audit)

1. **Classroom model is projector + teacher-remote.** Three browser tabs (Commander / Remote-Baton / Board) converge via Supabase Realtime broadcast (`broadcast: { self: false }` — every sender must also optimistically `setState`). Students have NO device during a live class; the teacher performs all input. Do NOT assume "each student on their own device." If your design genuinely requires student-device interaction, flag it explicitly as an architecture decision requiring my buy-in — do not smuggle it in.
2. **The lifecycle contract (the 4 must-dos) is sacred** for any scored game: (1) reset on `currentTurnId` change, (2) track mistakes with `useRef` + an `awardedRef` latch, (3) score via `addPoints` + `scoreForAttempt`, (4) personalize the success message via `usePickedStudent()`. Any redesign must respect this or propose a *documented* replacement.
3. **Two type systems exist and should stay decoupled.** `flow[].type` (board presentation shells) vs `pool_items.exercise_type` (interactive payloads, 15 values). The decoupling is *correct in spirit* — the problem is no game exploits it. Your architecture should lean into the decoupling (one shell consumes multiple payloads, or one payload renders in multiple shells), NOT collapse it.
4. **Region-safe AI only.** OpenRouter gateway; models are Moonshot/Qwen/DeepSeek/Meta/NVIDIA. Never OpenAI/Google/Anthropic. The deterministic pool builder (`generate-exercises`) makes NO LLM calls — content shaping is done by `enrich-unit` prompts, and `generate-exercises` mechanically converts that into typed items.
5. **The pool will be populated.** The production bug that left `objectives`/`pool_items` empty is diagnosed and fixed in code. Design for a rich pool, not the empty-state games currently degrade to.
6. **One learner model, two tracks.** Live-board cognitive writes go to the *same* `srs_items` (FSRS) as the async student app. Class points (`point_transactions`) and home XP (`student_progress`) stay separate.

## The four problems I most want solved (from audit §H)

- **H1 — Grammar gap.** There is NO grammar game. Sandbox is passive; Practice is teacher-operated reveal-and-credit. Grammar content (`transformation_pairs`, `pattern_template`, `error_examples`) is generated and then discarded. This is the top priority.
- **H2 — No variety / no escalation.** Every game is welded to one exercise type forever. No receptive→productive progression within a game, no multi-skill rounds, no mastery-driven escalation. The `difficulty` and `modality` fields on pool items are ignored.
- **H3 — Live-class UX.** Dead contextual controls for the reference games, broken selection-mode toggle, hardcoded analytics, the wheel's permanent "+? XP" placeholder, no slide-complete signal, manual/auto-advance inconsistency.
- **H4 — Pedagogical soundness.** No skill-acquisition model behind the phase tags, no error-driven feedback loops, no comprehension tied to stories/dialogues, the "choral cop-out" (speaking scores nobody), binary right/wrong with no partial credit, scoring ignores difficulty.

## What I want you to produce (the deliverable structure)

Write a design doc with these sections. Be concrete and opinionated — where the audit shows the evidence is clear, take a position. Where the direction is genuinely a choice, present 2–3 options with a recommendation.

### 1. Pedagogical model
- A unifying skill-acquisition framework for the live class (e.g. an explicit receptive→productive spiral, or PPP, or skill-specific ladders). State the model, justify it from the evidence in the audit, and show how it maps onto the existing `Phase` tags (WARMUP/INPUT/PRACTICE/OUTPUT/ASSESS/WRAPUP/REVIEW).
- How a single "learning objective" (a vocab word, a grammar rule, a story) should move through a lesson: what activities at each phase, and how the phase transitions are *enforced*, not just tagged.
- How mastery (FSRS state in `srs_items` + class-weak ordering from `useBoardPool`) should drive what content surfaces — concretely, not hand-wavily.

### 2. Content → Activity mapping grammar
- Propose a **declared mapping** between learning-object types (vocabulary / grammar / story / dialogue / phonics) and the activities that should be available for each, across the receptive→productive spectrum. Today this mapping is implicit and hardcoded per-game; make it explicit and data-driven.
- Decide: do we extend the `activity_type_registry` from a permissive filter into a real driver? Or keep the deterministic builders and add a "shell capability" declaration (which exercise types each shell can consume)? Recommend one.
- How does a game *escalate* the payload type within a session? (e.g. round 1 IMAGE_SELECT → round 4 TYPE_TRANSLATE). Specify the escalation rules per skill.

### 3. Scoring & feedback philosophy
- Reconcile the two scoring models (the per-pick `scoreForAttempt` model vs the dead `pointsForCorrect` map). Propose ONE model.
- How should `difficulty` (1/2/3) and `modality` (receptive/productive) affect the award? Today they don't.
- Partial credit: when and how (almost-right sentence order, right phoneme wrong stress)?
- Error-driven feedback: what happens when a student errs? Re-present? Hint? Narrow choices? Cycle back to weak items? Specify the feedback loop.
- Fix the visibility problems (points clamped at 0 hiding deductions; the wheel's permanent placeholder; no re-pay indication).

### 4. Teacher-flow model
- A coherent model for the pick → play → score → next loop that works for *every* game, with consistent contextual controls (fix the dead FLASH_MATCH/LISTEN_TAP bars).
- The selection-mode situation (sidebar shows FAIR/RANDOM, default is hidden ROUND_ROBIN, ELIMINATION unused) — reconcile.
- Slide-complete signals and auto vs manual advance — propose a consistent rule.
- Real analytics (replace the hardcoded "85%" and the `points<50` heuristic with accuracy from `srs_items`/`point_transactions`).

### 5. The grammar strand (special focus — H1)
This is the most important single deliverable. Propose a complete grammar strand:
- A redesigned **presentation** stage (replacing the passive `BoardGrammarSandbox`) that actually demonstrates the rule in action (uses `pattern_template`, `transformation_pairs`).
- A real **grammar game** (or games) where the *student* transforms sentences, spots errors, fills patterns — graduated from recognition to production. Specify the mechanic(s), the content shape needed (does the pool need a NEW exercise type? a new content variant?), and how it scores under your model from §3.
- How the presentation and practice stages share context (so a student sees "the rule, then the rule in action").
- Whether new pool content needs to be generated (i.e. does `enrich-unit` need to produce richer grammar fields, and does `generate-exercises` need a new builder?).

### 6. Game portfolio & sequencing plan
- A table of every game (current + any new ones you propose), with: the shell name, which skill(s) it serves, which exercise types it should consume (the decoupling exploited), scored? , phase, and a one-line "what makes it pedagogically sound."
- Identify games to **retire/consolidate** (e.g. `BoardGameArena` vs `BoardWheelOfDestiny`; the dead `POLL`).
- Identify games to **promote** (e.g. unscored `BoardWhatsMissing`/`BoardMagicEyes` — should they score? how?).
- A **sequencing plan**: in what order should we redesign/implement the games, and why (dependencies, leverage, risk). This plan is what drives the per-game prompts in the next phase.

### 7. Risks, trade-offs, and open questions
- What are the hardest parts of your proposal to implement? Where does it strain the existing architecture?
- What decisions do you need ME (the owner) to make before per-game design can start? List them as explicit questions.

## Style & depth expectations

- **Concrete over abstract.** "Use a mastery-driven escalation" is useless; "round 1 pulls IMAGE_SELECT items for objectives with avg FSRS retrievability <0.4, round 4 pulls TYPE_TRANSLATE for objectives with mastery_state='familiar'" is useful.
- **Cite the audit.** When you reference a current behavior, problem, or data structure, point to the audit section (e.g. "per audit §F, the per-pick model…").
- **Respect the constraints.** If you propose something that touches a hard constraint (e.g. student-device interaction, or abandoning the lifecycle contract), flag it loudly.
- **Don't write code yet.** This is architecture. Code comes in the per-game phase. Pseudocode for a tricky algorithm is fine if it clarifies.

Begin by briefly restating the problem in your own words (2–3 paragraphs) so I can confirm you've understood the audit, then deliver the design doc.
