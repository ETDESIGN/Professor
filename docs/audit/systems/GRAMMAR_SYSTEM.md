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

## §4 Anti-Gravity — quality opinion + redesign proposal

### 4.1 Executive Summary (Plain English)

The owner's frustration with the grammar system is completely justified. The grammar experience across both the live board and the student app is suffering from a fundamental architectural flaw: **it treats grammar as arbitrary string transformations rather than meaningful, communicative language patterns.**

Here is why the system feels broken in live use:
1. **The "Transformation" Illusion:** When a child sees *"How often do you brush your hair?"* and the board suddenly reveals *"I never brush my hair before bed"*, they are not seeing a grammatical transformation — they are seeing an arbitrary answer to a question with zero cue as to why *"never"* or *"before bed"* was chosen. On top of that, the code naively diffs the words position-by-position, causing almost every word to light up green as if the whole sentence mutated.
2. **Random Distractors in Practice:** When building multiple-choice options for transform exercises, the generator takes the transformed answers of *completely unrelated rules or sentences* as distractors. In a question about brushing hair, a distractor might be *"She always eats vegetables at dinner"*. A 7-year-old doesn't learn grammar from this; they just look for the word *"hair"*.
3. **Starved Content Pipeline:** The exercise generator emits at most **one single fill-in-the-blank item** per grammar rule. If two distinct distractors cannot be synthesized, it emits **zero**. This starves the student app micro-quiz, forcing it into a desperate fallback heuristic that hunts for words ending in *"-ed"* or longer than 4 letters, producing nonsensical options like *[vegetables, always, eat]*.
4. **Three Competing Board Surfaces:** The board currently has three separate grammar templates (`BoardGrammarSandbox`, `BoardGrammarLab`, and `BoardGrammarForge`). They have overlapping responsibilities, duplicate rung logic, and in `BoardGrammarLab`, flash the grammar rule for exactly 2 seconds before ripping it away from the class.

**The Solution:**
Replace the arbitrary "transformation" model with a structured **Prompt + Cue -> Target** drill model (e.g. *Prompt:* "How often do you brush your hair?" + *Cue:* "[never]" -> *Target:* "I never brush my hair."). Standardize the grammar teaching arc across all surfaces into **Notice (Sandbox) -> Guided Slot Practice (Lab) -> Production (Forge / Choral)**, and ensure the generator outputs at least 3 genuine word-level clozes per rule to fuel both classroom games and student solo quizzes.

---

### 4.2 Pedagogical Gap Analysis vs ESL Best Practice for Young Learners (6–12 y/o)

In young learner ESL pedagogy (Cambridge Young Learners Pre-A1 Starters through A2 Flyers, CEFR Young Learners, Oxford/Pearson Primary ELT), grammar acquisition differs drastically from adult grammar translation:

| ESL Young Learner Best Practice | Current Professor System Implementation | The Resulting Pedagogy Gap |
|---|---|---|
| **Inductive & Pattern-Anchored (PPP/ESA):** Grammar is noticed in context, analyzed as visual syntax blocks (e.g. `Subject` + `Frequency Word` + `Action`), then practiced. | Abstract rule text displayed for 2 seconds (`BoardGrammarLab.tsx:872`) or passive multi-card slideshow (`BoardGrammarSandbox.tsx:61-86`). | Children cannot internalize the syntactic rule; teachers lack visual anchor blocks to explain sentence mechanics. |
| **Controlled Transformation with Explicit Cues:** If converting form or answering, the prompt MUST provide the constraint (e.g., *"Prompt: She eats vegetables. Cue: [always] -> Target: She always eats vegetables."*). | Uncued question-answer pairs labeled "Original" vs "Transformed" (`BoardGrammarSandbox.tsx:303-323`). | Children must read the AI's mind. They cannot know whether the answer should be *"always"*, *"never"*, or *"sometimes"*. |
| **Visible Structural Linkages:** When shifting person or polarity (e.g., *you* -> *I*, *do* -> *don't*), the correspondence between source and target must be highlighted. | Naive positional diff (`BoardGrammarSandbox.tsx:36-54`) compares token index `i` to `i`, flagging words as changed merely because word order shifted. | The interface highlights arbitrary words, confusing learners about which word actually triggered the grammatical change. |
| **Distractors Test the Target Rule:** Distractors in a grammar drill must isolate the grammatical feature (e.g., target: *always eat*, distractors: *always eats*, *eat always*, *is always eat*). | Distractors are drawn from the answers of other unrelated sentences (`supabase/functions/generate-exercises/index.ts:362`). | Trivial semantic elimination replaces grammatical reasoning. Zero diagnostic value. |
| **Meaningful Cloze / Slot-Fill:** Cloze exercises test the specific grammatical slot (the auxiliary, the adverb, the inflection) within an authentic sentence. | `sentence_with_blank` contains abstract pattern templates (`generate-exercises/index.ts:395`), and choices are full 7-word sentences rather than slot words. | Overwhelming cognitive load; young learners cannot parse full-sentence options on mobile or board displays. |

#### Detailed Deconstruction of Owner Symptoms
- **Symptom 1: *"How often do you brush your hair?"* -> *"I never brush my hair before bed"*:**
  - In `enrich-unit/index.ts:718`, the AI is prompted: `transformation_pairs: pairs {original, transformed} showing different ways the pattern applies`. The AI generated a conversational dialogue turn (question -> answer) instead of a syntactic transformation.
  - In `BoardGrammarSandbox.tsx:303-323`, the component puts the question in an "Original" box and the answer in a "Transformed" box with a lightning bolt icon (`Zap`). Answering a question is not a transformation.
  - In `BoardGrammarLab.tsx:903-909`, the game takes `content.prompt_sentence` (*"How often do you brush your hair?"*), displays it with a strikethrough line (`line-through decoration-slate-600`), and asks the student to assemble the runway tiles for *"I never brush my hair before bed"*. The student has zero clue that *"never"* or *"before bed"* are the target words.
- **Symptom 2: *"Do you ever eat vegetables?"* -> *"She always eats vegetables at dinner"*:**
  - Three simultaneous grammatical shifts occurred without annotation: (1) Person shifted from 2nd person (*you*) to 3rd person singular (*She*); (2) Question auxiliary (*Do you ever*) transformed into an affirmative frequency adverb (*always*); (3) Subject-verb agreement shifted (*eat* -> *eats*); plus a new prepositional phrase (*at dinner*) was introduced.
  - With no visual cues, this appears completely arbitrary to both teacher and student.
- **Symptom 3: Student App Micro-Quiz "Still not perfect / Big gap":**
  - The micro-quiz in `SoloLessonPlayer.tsx:1093-1175` was designed as a 2-question quick check. However, because `generate-exercises` produces at most 1 item (and often 0), the student app almost always drops into the regex fallback (`SoloLessonPlayer.tsx:244-259`), generating broken questions from arbitrary words.

---

### 4.3 Code-Level Audit & Architecture Root Causes

#### 1. Generation Prompt Under-Specification (`supabase/functions/enrich-unit/index.ts:710-761`)
- **Vague Derivation Prompt (lines 715–722):**
  ```typescript
  // enrich-unit/index.ts:715-722
  For EACH box, derive:
  - explanation: a simple child-friendly explanation of the pattern IN the box
  - pattern_template: a fill-in-the-blank structure of the box's pattern
  - transformation_pairs: pairs {original, transformed} showing different ways the pattern applies
  - error_examples: pairs {wrong, correct} of typical learner mistakes with this pattern
  ```
  - **The Defect:** It does not specify *what* a transformation is. It provides no drill categories (e.g. `question_to_answer`, `adverb_insertion`, `person_shift`). It does not request a **why-line**, does not request **highlight spans**, does not request an explicit **student cue**, and does not enforce a minimum count of examples (>=3).
  - **Response Clamping (line 722):** Prompt instructs `Keep every value concise so the response is not cut off`, causing the LLM to emit the bare minimum (1–2 shallow pairs).
  - **Heading Mangling (lines 750–759):** When textbook boxes share headings (e.g. *"Grammar Focus"*), the code appends the first example sentence to the rule name (`r.rule = String(r.rule) + suffix;`), creating bizarre display titles like *"Grammar Focus — I never brush my hair before bed"*.

#### 2. Flawed Exercise Generation & Distractor Assembly (`supabase/functions/generate-exercises/index.ts:341-401`)
- **Absurd Distractors for `TRANSFORM` (lines 360–365):**
  ```typescript
  // generate-exercises/index.ts:362
  const distractors = buildablePairs
    .filter((x) => String(x?.transformed) && String(x.transformed) !== transformed)
    .map((x) => String(x.transformed));
  const c = buildChoices(transformed, distractors, Math.min(4, distractors.length + 1));
  push('TRANSFORM', { prompt_sentence: original, instruction: rule, ...c });
  ```
  - Distractors are literally the target sentences of *other pairs* in the rule! If Pair 1 is about brushing hair and Pair 2 is about eating vegetables, the distractor for the hair question is the vegetable sentence.
- **Starved `GRAMMAR_FILL` Pipeline (lines 375–401):**
  - Only generates from `pairs[0]` (line 382). It ignores all other pairs.
  - Sets `sentence_with_blank: g?.pattern_template || ''` (line 395). But `g?.pattern_template` is an abstract formula like `"Subject + frequency adverb + verb"`, NOT a sentence with a blank!
  - The choices (`...c`) are full sentences, not the word filling the blank.
  - If `list.length < 2` (line 391), it skips the item entirely, resulting in **zero** `GRAMMAR_FILL` items for the entire unit.

#### 3. Naive Positional Diff in Board Sandbox (`apps/board/templates/BoardGrammarSandbox.tsx:36-54`)
- **The Broken Diff Function:**
  ```typescript
  // BoardGrammarSandbox.tsx:43-52
  for (let i = 0; i < maxLen; i++) {
    const ot = o[i];
    const tt = t[i];
    if (tt === undefined) continue;
    if (ot === tt) {
      out.push({ text: tt, changed: false });
    } else {
      out.push({ text: tt, changed: true });
    }
  }
  ```
  - Comparing `o[i]` directly to `t[i]` assumes identical word positions. If a sentence inserts an adverb (e.g. *"I brush my hair"* [4 words] -> *"I never brush my hair"* [5 words]), from index 1 onward (`often` vs `brush`, `brush` vs `my`, etc.), **every single word is marked as changed (`changed: true`)** and underlined in green.

#### 4. Surface Conflict: Sandbox vs Lab vs Forge
- **`BoardGrammarSandbox.tsx` (Presentation):** Tries to show Pattern Card -> Transform Demo Card -> Error Teaser Card. The Transform Demo (lines 298–334) reveals the transformed sentence on click, but gives the teacher no speaking prompt, no choral cue, and no pedagogical explanation of the change.
- **`BoardGrammarLab.tsx` (Practice):**
  - Lines 871–873: Holds a syntax formula card for exactly 2 seconds (`"Challenge begins in 2s..."`) before automatically ripping it away. Young learners cannot read or process a grammar formula in 2 seconds.
  - Lines 888–975: For `TRANSFORM`, it displays the crossed-out prompt sentence and requires assembling tiles with no prompt cue.
- **`BoardGrammarForge.tsx` (Production):**
  - Duplicates Rung 2 (`ERROR_SPOT`) and Rung 3 (`TRANSFORM`) from Grammar Lab, but switches to a different visual layout.
  - Lines 158–171: Rung 4 (`PRODUCE`) reads directly from the reserved last pair of `grammar_rules.transformation_pairs`. If that pair is uncued, the teacher is asked to grade the student on reciting a sentence they could not possibly anticipate.

#### 5. Broken Micro-Quiz in Student Solo Player (`apps/student/SoloLessonPlayer.tsx`)
- **Underscore Split Bug (line 1119):**
  ```tsx
  // SoloLessonPlayer.tsx:1119
  {q.sentence.split('____').map((part, pi, arr) => (
  ```
  - The component splits strictly on **four** underscores (`'____'`). However, `enrich-unit` emits **three** underscores (`'___'`) or `'[blank]'`. As a result, `split('____')` returns an array of length 1; **no blank is rendered at all**, and the question renders as unbroken text with missing slots.
- **Disastrous Regex Fallback (lines 243–260):**
  - When pool items are missing (which happens often due to line 391 of `generate-exercises`), the fallback regex looks for `-ed` or words >4 characters in the raw example sentences, extracts random words from other sentences as distractors, and builds nonsensical clozes like:
    `"I always eat ____"` -> Options: `[vegetables, always, eat]`.

---

### 4.4 Concrete Redesign Proposal (Engineering Specifications)

We propose a complete overhaul of the Grammar Content Model and a clear separation of concerns across the teaching surfaces.

```
[enrich-unit]
  Emits: Rule Title + Why-Line + Visual Syntax Blocks + Paired Drills (with Prompt + Cue + Target + Highlight Spans)
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
[BoardGrammarSandbox]                    [generate-exercises]                   [SoloLessonPlayer]
Input / Presentation                     Emits True Slot Clozes                 Micro-Quiz Step
- Step 1: Rule & Visual Formula            - GRAMMAR_FILL (slot words)            - Audio Prompt
- Step 2: Model & Notice (Choral)          - ERROR_SPOT (near-miss)               - Visual Slot Fill
- Step 3: Prompt + Cue -> Target           - TRANSFORM (prompt + cue)             - Rule Explanation Card
                                                │
                                                ▼
                                  [BoardGrammarLab & Forge]
                                  Unified Practice & Production
                                  - Rung 1: Spot the Mistake (MCQ)
                                  - Rung 2: Slot Cloze (Syntax Blocks)
                                  - Rung 3: Guided Assembly (with Cue)
                                  - Rung 4: Oral Production (Choral/Solo)
```

#### 1. Upgraded Content Model (`grammar_rules` & manifest)
Update the `enrich-unit` prompt to emit structured, pedagogically sound grammar scaffolding:

```typescript
export interface CanonicalGrammarRule {
  rule_id: string;
  rule_title: string;              // e.g. "Adverbs of Frequency (How Often)"
  why_line: string;                // Child-friendly rule rationale: "We put 'always', 'often', and 'never' BEFORE the action to say how many times we do it."
  pattern_formula: {
    slots: Array<{
      label: string;               // e.g. "Subject", "Frequency Word", "Action Verb", "Detail"
      color: 'blue' | 'yellow' | 'green' | 'purple';
      examples: string[];          // e.g. ["I", "You", "She"] | ["always", "never"] | ["brush", "eat"]
    }>;
  };
  drills: Array<{
    drill_type: 'question_answer' | 'cue_insertion' | 'polarity_change' | 'person_shift';
    prompt: string;                // e.g. "How often do you brush your hair?"
    cue: string;                   // The explicit anchor: "[never]" or "[always / dinner]"
    target: string;                // e.g. "I never brush my hair before bed."
    focus_slot: string;            // "never"
    connection_note: string;       // "Change 'you' to 'I', place 'never' before the verb 'brush'."
    highlight_spans: {
      prompt_tokens: string[];     // ["How often", "you"]
      target_tokens: string[];     // ["never", "I"]
    };
  }>;
  contrastive_errors: Array<{
    wrong: string;                 // e.g. "I brush never my hair."
    correct: string;               // e.g. "I never brush my hair."
    error_type: 'word_order' | 'missing_auxiliary' | 'wrong_inflection';
    hint: string;                  // "Put 'never' BEFORE the action word!"
  }>;
}
```

#### 2. Overhaul of `generate-exercises/index.ts`
1. **True Slot `GRAMMAR_FILL` (Generate >=3 items per rule):**
   - Take each drill from `rule.drills`.
   - The sentence with blank replaces `drill.focus_slot` with `"[blank]"`.
     *Sentence:* `"I [blank] brush my hair before bed."`
   - The options are **word-level distractors**, NOT whole sentences:
     *Correct:* `"never"`
     *Grammatical Distractors:* drawn from sibling adverbs (`"always"`, `"sometimes"`, `"often"`) or inflection variants (`"nevers"`).
   - Guarantees at least 3 valid `GRAMMAR_FILL` items per unit so `SoloLessonPlayer` never starves.
2. **Cued `TRANSFORM` Items:**
   - In `push('TRANSFORM', ...)`, emit:
     `prompt_sentence: drill.prompt`
     `cue: drill.cue`
     `instruction: "Use the clue to say the sentence:"`
     `target_sentence: drill.target`
   - Distractors share the **exact same stem** with grammatical variations (e.g. wrong word order: *"I brush never my hair before bed"*, wrong pronoun: *"He never brush my hair before bed"*), never unrelated sentences about vegetables.

#### 3. Surface Responsibilities & UX Flow

##### Surface A: `BoardGrammarSandbox.tsx` (INPUT Phase — The Teaching Moment)
- **Eliminate the naive string diff and 2-second flash.** Replace with a 3-step teacher-guided presentation:
  - **Card 1: Visual Syntax Formula:** Render colored formula blocks (`[Subject (Blue)]` + `[Frequency (Yellow)]` + `[Action (Green)]`). Clicking a block cycles example words so the class sees how the structure works.
  - **Card 2: Model & Choral Read:** Show 2 authentic textbook example sentences with color-coded syntax pills and audio listen buttons. Teacher prompts choral repetition.
  - **Card 3: Guided Linkage (The Connection Demo):**
    - Show the Prompt: `"How often do you brush your hair?"`
    - Display the Cue Badge: `[Cue: never]`
    - Tap to Reveal Target: `"I never brush my hair before bed."`
    - Visual connection lines tie `"How often"` -> `"never"` and `"you"` -> `"I"`.
    - Teacher note displayed at the bottom: `"Point out that 'never' sits right before 'brush'!"`

##### Surface B: Unified Board Practice (`BoardGrammarLab.tsx` / `BoardGrammarForge.tsx`)
- **Consolidate Lab and Forge into ONE authoritative practice shell:**
  - **Rung 1: Spot the Mistake (`ERROR_SPOT` — Receptive):** 4-option MCQ spotting common learner errors. Teacher relays student pick.
  - **Rung 2: Fill the Slot (`GRAMMAR_FILL` — Guided Receptive):** Sentence displayed on syntax runway. Students select the correct slot word to complete the formula.
  - **Rung 3: Sentence Assembly (`TRANSFORM` — Guided Productive):**
    - Display prompt AND the cue badge (e.g. `Prompt: "Do you eat vegetables?"` | `Cue: [always / dinner]`).
    - Word tiles on runway for students to assemble.
  - **Rung 4: Oral Production (`PRODUCE` — Free Productive):**
    - Prompt + Cue shown on board. QuickWheel picks a student to say the full sentence aloud. Teacher gives a 3-way grade (Correct / Almost / Try Again).

##### Surface C: Student App Micro-Quiz (`SoloLessonPlayer.tsx`)
- **Blank Rendering Fix:** Replace `q.sentence.split('____')` with a robust regex:
  `q.sentence.split(/(?:_{2,}|\[blank\])/i)`
- **Word-Level Quick Check:** Render the sentence with an inline highlighted pill for the blank. Buttons display clean, single-word slot options (`never`, `always`, `sometimes`) that fit comfortably on mobile screens without truncation.
- **Deprecate the Past-Tense Heuristic:** If pool items are missing, generate clozes directly from the unit's `CanonicalGrammarRule.drills` by blanking the `focus_slot`, completely removing the fragile `-ed` regex fallback.
- **Add Rule Anchor Card:** If a student misses a micro-quiz question, expand a child-friendly hint card with the `why_line` and formula pills before proceeding.

---


## §5 ⬜ Synthesis → owner approval
*(ZCode merges both audits into ONE redesign proposal with scope estimate; owner approves before implementation.)*


## §5 Synthesis — ZCode merge of both audits → FOR OWNER APPROVAL

**ZCode verdict: AG's diagnosis is correct and complete; I verified the cited lines.** Adding three things from my side:

1. **TRANSFORM distractors are the same bug I already fixed for ERROR_SPOT** (sibling-pair targets as options — generate-exercises:362). The same near-miss approach I shipped in commit 17cbe21 extends directly: distractors = the target with the CUE swapped for other cue words. Cheap, proven.
2. **The Prompt+Cue→Target drill model is the right core.** It fixes the owner's exact complaint (no visible question→answer connection) at the DATA level — every surface gets the cue for free. The positional-diff mess (Sandbox:43) becomes unnecessary: the generator emits highlight spans; the UI just renders them.
3. **Sequencing + scope (3 stages, each independently shippable):**
   - **Stage 1 — Generator (edge, highest leverage):** new grammar_rules prompt (rule_title, why_line, pattern_formula slots w/ colors, ≥3 drills each with {drill_type, prompt, cue, target, highlight_spans}); GRAMMAR_FILL becomes true slot clozes from ALL drills (≥3/rule); TRANSFORM distractors → cue-swap near-misses. Redeploy enrich-unit + generate-exercises.
   - **Stage 2 — Board surfaces:** Sandbox = Notice arc (rule+formula → model&choral → Prompt+Cue reveal); Lab = guided slot practice (cue visible); Forge = production. Remove the 2s rule flash (Lab:872). No learner-data writes in Sandbox (unchanged rule).
   - **Stage 3 — Student app:** adopt the same drills in the Solo grammar step (extends the shipped micro-quiz 9f4a9e2).
   Content heals on next enrichment per unit (no migration needed — old manifests keep old shape; normalizeManifest reads both).
