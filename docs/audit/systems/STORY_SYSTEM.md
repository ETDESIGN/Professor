# Story System — Deep Audit & Presenter Coupling (round 2, 2026-09-15)

> **Status:** IN PROGRESS — ZCode §0–§3 + Anti-Gravity §4 (quality opinion + coupling proposal). Owner approves the synthesis BEFORE implementation.

## §0 Scope — the whole story chain, board + student
- **Data:** `story_pages` (text, speaker, image_asset_id, extractor_version, status) · `scene_illustrations` (paragraph anchors, per-paragraph crops) · objectives type=story · STORY_COMPREHENSION pool items · the scan → enrich → publish pipeline that produces them
- **Board surfaces:** `BoardStoryStage.tsx` + `BoardStoryStage.ag.tsx` (reading theater presenter) · `BoardStoryQuest.tsx` (read + comprehension) · `BoardComicPanels.tsx` (comics presenter — panel crops from book pages) · `BoardStorySequencing` (shared askedComprehensionItems coordination with Story Stage)
- **Student app:** the story step in `SoloLessonPlayer.tsx` (and any story/comics presenter under `apps/student/`)
- **The coupling question (owner):** Story Quest should be coupled with the story presenter (the reading-theater / comics-presenter pattern) — on the board AND the student app — instead of being a separate-feeling surface. What exactly to share (components, data, UX) is what this audit decides.

## §1 Owner symptoms & requests (verbatim intent)
- "First, it seems there is no story, and then there is a screen with a question: 'What does the text remind us to do when we exercise?' The questions are good, but we didn't see any text or story." (#7)
- "Story Quest: one page with text but no image — is it normal? Needs checking." (#12)
- "Add a zoom option on images — tap or corner button to show the image big." (#13)
- "After seeing the student app, I believe we need to couple Story Quest with the story presenter — we have one on the student side too. I figured out some little bugs, so I'd like a deep audit of the story system to see if there are extra bugs we didn't think about."

## §2 ZCode factual findings (code-derived; to be completed during the audit)
- (to be filled — why a unit can reach comprehension with zero story pages; which page lost its image; zoom absence; student-side story step inventory; data-health stats across units)

## §3 Prior art
- Story Stage reading theater (both builds, live as STORY_STAGE + STORY_STAGE_AG) — the presenter pattern to couple TO.
- Comics pipeline: per-paragraph scene anchors + panel crops (`docs/audit/games-v3/28-comic-panels.md`, scan-v8).

## §4 Anti-Gravity — quality opinion + coupling proposal

### 4.1 Executive Summary (Plain English)

The owner's decision to couple **Story Quest** with the **Story Presenter** touches the core of how language reading comprehension actually works. 

In real classrooms and self-study, **reading a story and checking comprehension are not two separate activities** — they are two halves of the same cognitive process (Guided Reading). The current codebase split them into separate, disconnected worlds:
1. **The "Question with No Story" Mystery:** In `apps/student/SoloLessonPlayer.tsx`, the router treats `STORY_QUEST` as a generic exercise pool (`services/gameRouting.ts:86`). When a student arrives at Story Quest, the app throws them straight into multiple-choice questions (*"What does the text remind us to do when we exercise?"*) with **zero story text, zero story pictures, and zero context**. On the board, `supabase/functions/orchestrate-lesson/index.ts:305` forgot to pass story pages into `STORY_QUEST`, leaving it blank or switching to a full-screen question card that completely hides the story.
2. **The "Page with No Image" Mystery:** In `supabase/functions/enrich-unit/index.ts:786-827`, the pipeline cuts stories into one page per paragraph. But textbooks don't have an illustration for every single paragraph — a 4-paragraph story often has only 1 or 2 pictures. Any paragraph without an exact illustration box is assigned `image_url: null`. The board then displays an ugly, dead grey placeholder box (`BoardStoryQuest.tsx:703-706`) or an empty brown gradient (`BoardStoryStage.ag.tsx:1133-1141`).
3. **The Missing Zoom:** Scanned textbook pages contain dialogue bubbles, handwriting, and detailed narrative artwork. Currently, both board and student surfaces trap the image in a fixed box with zero ability to tap or expand it.

**The Solution:**
Unify reading and comprehension into a **single, shared Story Presenter** (`StoryPresenter`). When reading a story, comprehension questions are **anchored to the scene** — the text and illustration stay visible on screen while students answer the question. Add an accessible **image zoom modal**, implement an **automatic 3-tier illustration fallback** so no page is ever left blank, and eliminate duplicate story slides on the live board.

---

### 4.2 Comprehensive Bug Hunt Results (Beyond the Known Symptoms)

Our deep audit of the data chain and presentation code uncovered **8 systemic bugs and failure modes** across the story ecosystem:

```
Textbook Scan (book_pages / page_structures)
       │
       ▼
[enrich-unit] (supabase/functions/enrich-unit/index.ts)
  ├─ Bug 2: Paragraph-count > scene-count ──► image_asset_id: null (dead grey box)
  ├─ Bug 5: 75s AI deadline timeout ────────► comprehension_questions: [] dropped silently
  └─ Bug 6: Comics stripped from story ────► zero comic renderer in student app
       │
       ▼
[generate-exercises] (supabase/functions/generate-exercises/index.ts)
  └─ Converts questions into STORY_COMPREHENSION pool items
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
[orchestrate-lesson]                     [services/gameRouting]                  [Session / Board State]
  ├─ Bug 1: Omitted data.pages for QUEST   └─ Bug 1: STORY_QUEST routed to pool    └─ Bug 8: askedComprehensionItems
  └─ Bug 4: Emits STAGE + QUEST together        │                                     singleton ignored by QUEST
       │                                        ▼                                        │
       ▼                                 [SoloLessonPlayer]                              ▼
[Board Surfaces]                         (apps/student/SoloLessonPlayer.tsx)      [Audio Desynchronization]
  ├─ BoardStoryStage.ag (Reading Theater)  └─ Bug 1: Renders cold MCQ in            └─ Bug 7: Multi-speaker bubble
  ├─ BoardStoryQuest (Disconnected Check)     ExerciseBattery with zero story          replays full page audio
  └─ BoardComicPanels (Comics Rebuild)
```

#### Bug 1: The "Ghost Story" Bug — Routing & Manifest Omission
- **Student App Root Cause (`services/gameRouting.ts:86` & `apps/student/SoloLessonPlayer.tsx:130-140, 1433`):**
  - In `services/gameRouting.ts:86`, `STORY_QUEST` is registered as:
    `STORY_QUEST: { kind: 'pool', types: ['STORY_COMPREHENSION', 'WHO_SAID_IT'], signature: ['STORY_COMPREHENSION'] }`.
  - In `SoloLessonPlayer.tsx:130-140`, `isPoolStep` evaluates to `true` for `STORY_QUEST`.
  - In `SoloLessonPlayer.tsx:1433`, `if (isPoolStep) return renderExerciseBattery();` intercepts the step and passes it to the generic `ExerciseBattery` / `ChoiceExercise`.
  - **Result:** The student sees a cold, isolated multiple-choice question: *"What does the text remind us to do when we exercise?"* with no storybook, no text, and no images.
- **Board Root Cause (`supabase/functions/orchestrate-lesson/index.ts:300-306`):**
  - When content groups are present:
    ```typescript
    // orchestrate-lesson/index.ts:300-306
    flow.push({
      type: 'STORY_STAGE_AG',
      data: { title: `${sg.title} — Story`, pages: sg.pages.map(toStoryPage), ...groupTags(sg) },
    });
    flow.push({
      type: 'STORY_QUEST',
      data: { title: `${sg.title} — Story Quest`, ...groupTags(sg) }, // ⚠️ pages is omitted!
    });
    ```
  - Line 305 emits `STORY_QUEST` without `data.pages`.
  - If `useUnitRelational()` is still fetching or fails, `BoardStoryQuest.tsx:151` calculates `storyPanels = []`, and line 491 shows: *"This unit has no story pages yet — skip to the next slide."*
- **Board Viewport Eviction (`BoardStoryQuest.tsx:825-848`):**
  - Even when panels load, entering `phase === 'comprehension'` completely unmounts the story feed and replaces the screen with a giant question card. The class cannot look back at the text to verify their answer.

#### Bug 2: The Illustration Starvation Bug (Paragraph vs Scene Crop Mismatch)
- **Root Cause (`supabase/functions/enrich-unit/index.ts:786-827`):**
  - In `buildBasketStory`, the function executes:
    `const segments = segmentPassageByScenes(String(p.passage_text || ''), scenes);`
  - In textbooks, reading passages have multiple paragraphs (3 to 6 paragraphs), but the page scan typically identifies only 1 or 2 illustration bboxes (`scenes`).
  - Segments that do not match an illustration index get `seg.sceneIndex === null`.
  - Lines 792–799 skip these segments when assembling `cropItems`.
  - In lines 821–823:
    ```typescript
    image_asset_id: crop?.ok && crop.asset_id ? crop.asset_id : null,
    image_url_book_crop: crop?.ok && crop.url ? crop.url : null,
    image_url: crop?.ok && crop.url ? crop.url : null,
    ```
    `image_url` is stored as `null`.
  - **Result:**
    - In `BoardStoryQuest.tsx:703-706`: Renders an empty placeholder box: `<BookOpen size={48} /> Story Illustration`.
    - In `BoardStoryStage.ag.tsx:1133-1141`: Renders a featureless brown gradient box: `background: 'linear-gradient(160deg, #3A2A16, #1F1408)'`.
    - There is **no fallback policy** to use the parent page's illustration or full-page scan when a paragraph crop is missing.

#### Bug 3: Absence of Zoom / Detail Inspection
- Scanned textbook illustrations often contain rich contextual details, subtle facial expressions, and tiny speech bubbles that are completely illegible when forced into a CSS `object-contain` container inside a fixed 16:9 grid (`BoardStoryQuest.tsx:695-708` and `BoardStoryStage.ag.tsx:1121-1132`).
- No story component on either board or student apps provides a lightbox, tap-to-expand modal, or pinch-to-zoom handler.

#### Bug 4: Duplicate Comprehension Slides on Live Board
- **Root Cause (`supabase/functions/orchestrate-lesson/index.ts:298-323`):**
  - `orchestrate-lesson` automatically emits `STORY_STAGE_AG` **immediately followed by** `STORY_QUEST`.
  - However, `BoardStoryStage.ag.tsx:88-100` and `BoardStoryStage.tsx:87-100` **already include a 4-question comprehension closer** (`MAX_COMPREHENSION_QUESTIONS = 4`) that runs immediately after the final page!
  - **Result:** The teacher and class read the story in `StoryStage` and answer comprehension questions. Then the teacher advances to the next slide, only to find `StoryQuest`, which asks them to read the exact same story and answer comprehension questions all over again!

#### Bug 5: Silent Question Generation Timeout
- **Root Cause (`supabase/functions/enrich-unit/index.ts:905-934`):**
  - Comprehension questions run under a strict 75-second deadline: `const STORY_Q_DEADLINE = Date.now() + 75_000;`.
  - In line 932: `catch { /* questions are optional derived content */ }`.
  - If OpenRouter is slow or rate-limited, comprehension questions silently fail to generate, writing 0 rows to `story_comprehension_questions`.
  - When `BoardStoryQuest.tsx:327-334` loads this unit, `comprehensionItems.length === 0`, and the game silently skips comprehension entirely.

#### Bug 6: Comics vs Story Pipeline Schism
- **Root Cause (`supabase/functions/enrich-unit/index.ts:766-769` & `apps/student/SoloLessonPlayer.tsx:1434-1452`):**
  - Comics were split from stories (`"Comics are NO LONGER flattened into story pages"`).
  - While the live board has `BoardComicPanels.tsx`, the student app in `SoloLessonPlayer.tsx` has **zero comic presenter**.
  - If a unit has a comic, the student app either skips it or renders an empty/unsupported placeholder.

#### Bug 7: Audio Desynchronization in Multi-Speaker Bubbles
- **Root Cause (`apps/board/templates/BoardStoryStage.ag.tsx:53-100` & `BoardStoryQuest.tsx:44-114`):**
  - Both templates parse page text into separate character speech turns via `parseDialogueLines`.
  - However, the audio file associated with the page (`p.audioUrl`) is recorded at the **whole-page level**.
  - When a student taps an individual character's speech bubble to hear them speak, the app calls `playAudioUrl(currentItem.audioUrl)`, playing the entire page from the beginning instead of that character's line.

#### Bug 8: Session Coordination Leak Between Story Shells
- **Root Cause (`apps/board/templates/BoardStoryStage.ag.tsx:26-46` vs `BoardStoryQuest.tsx:188-193`):**
  - `BoardStoryStage.ag` and `BoardStorySequencing` share an in-memory singleton map: `askedComprehensionItems`.
  - `BoardStoryQuest.tsx` does **not** import or check `askedComprehensionItems`. It blindly queries `useBoardPool({ exerciseTypes: ['STORY_COMPREHENSION'] })`, repeatedly asking questions that were already presented earlier in the lesson.

---

### 4.3 Presentation Surfaces Fragmentation Analysis

The codebase currently contains **four separate board story templates** and **one isolated student reader**, resulting in massive code duplication and inconsistent student experiences:

| Surface | File | Role / Phase | Comprehension Mechanism | Illustration Rendering | Audio Support |
|---|---|---|---|---|---|
| **Board Story Stage (v2)** | `apps/board/templates/BoardStoryStage.tsx` | OUTPUT (Presentation + Closer) | 4-question MCQ closer after last page | Standard `object-contain` | Whole page audio |
| **Board Story Stage (AG)** | `apps/board/templates/BoardStoryStage.ag.tsx` | OUTPUT (Reading Theater) | 4-question MCQ closer with student picker | Standard `object-contain` + brown gradient fallback | Multi-speaker speech bubbles (whole-page audio) |
| **Board Story Quest** | `apps/board/templates/BoardStoryQuest.tsx` | PRACTICE (Story + Quest) | Prediction gates + inline comprehension every 2 panels | Dedicated widescreen card + grey book fallback | Dialogue turns + Listen button |
| **Board Comic Panels** | `apps/board/templates/BoardComicPanels.tsx` | PRACTICE (Sequencing) | Implicit (narrative reconstruction) | Shuffled tray + slot placement | Speech synthesis / TTS |
| **Student Solo Player** | `apps/student/SoloLessonPlayer.tsx:735-890` | Step 4: Story Stage | None (routed separately to raw `ChoiceExercise` on Quest steps) | 2-column mobile card + generic cover fallback | Tap-to-inspect vocab popover |

**Redundancy:**
- `parseDialogueLines` is duplicated verbatim between `BoardStoryStage.ag.tsx:66-114` and `BoardStoryQuest.tsx:45-114`.
- Vocabulary tap highlighting is duplicated across `BoardStoryQuest.tsx:462-488` and `SoloLessonPlayer.tsx:762-785`.
- Character color mapping is duplicated in three different files with different fallback color arrays.

---

### 4.4 The Coupling Proposal: Unified Story Presenter Contract

Instead of having `StoryStage` as a reading tool and `StoryQuest` as a separate, detached question screen, **we propose a single unified component: `<StoryPresenter />` and hook `useStoryPresenter()`.**

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SHARED STORY PRESENTER                          │
│                                                                        │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │   ILLUSTRATION STAGE          │  │   READING & DIALOGUE FEED     │  │
│  │                               │  │                               │  │
│  │   - Crisp Uncropped Book Art  │  │   - Character Speech Bubbles  │  │
│  │   - Automatic 3-Tier Fallback │  │   - Interactive Vocab Pills   │  │
│  │   - [🔍 Zoom / Lightbox]      │  │   - Speaker Badges & Audio    │  │
│  └───────────────────────────────┘  └───────────────────────────────┘  │
│  ────────────────────────────────────────────────────────────────────  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │   SCENE-ANCHORED COMPREHENSION DRAWER                            │  │
│  │   (Slides up over bottom 35% — Story Art & Text Remain Visible!) │  │
│  │   "What does the text remind us to do when we exercise?"         │  │
│  │   [A. Drink water]  [B. Go to sleep]  [C. Eat candy]             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

#### 1. Core Pedagogical Rules of the Coupled Presenter
1. **Never Show a Question Without Its Story:** A comprehension check must always be presented alongside the scene text and illustration that contains the answer.
2. **Never Show an Empty Image Placeholder:** Implement a 3-tier illustration fallback hierarchy.
3. **Interactive Inspection:** Both teachers and students must be able to tap/click any illustration to inspect it in high resolution.
4. **Single Slide in Lesson Orchestration:** Eliminate the back-to-back `STORY_STAGE_AG` + `STORY_QUEST` pairing in `orchestrate-lesson`. The unified `STORY_STAGE` runs the story presentation with anchored prediction and comprehension checks in a single, fluid experience.

#### 2. The Shared Presenter Data Contract
Define a single canonical data structure for any story consumer:

```typescript
export interface StoryPresenterScene {
  id: string;
  sceneIndex: number;
  pageNumber: number;
  title: string;
  
  // Text & Dialogue
  rawText: string;
  dialogueTurns: Array<{
    speaker: string;
    speakerCharacterId?: string;
    text: string;
    color: string;
  }>;
  
  // Media with 3-Tier Fallback
  image: {
    primaryUrl?: string;          // Paragraph/scene crop
    pageCropUrl?: string;         // Full book page crop (Tier 2 fallback)
    coverUrl: string;             // Story/unit cover art (Tier 3 fallback)
    imagePrompt?: string;         // Visual description for alt/TTS
  };
  audioUrl?: string;
  
  // Embedded Comprehension (Anchored directly to this scene)
  predictionGate?: {
    prompt: string;               // e.g. "What happens next?"
    options: Array<{ text: string; correct: boolean }>;
  };
  comprehensionQuestion?: {
    id: string;
    prompt: string;               // e.g. "What does the text remind us to do?"
    options: string[];
    correctIndex: number;
    explanation?: string;
  };
}

export interface StoryPresenterContract {
  storyId: string;
  title: string;
  scenes: StoryPresenterScene[];
  activeSceneIndex: number;
  viewMode: 'board' | 'student';
}
```

#### 3. Automatic 3-Tier Image Fallback Resolution
To permanently resolve the "page with no image" bug, wrap image resolution in a cascading helper:

```typescript
export function resolveStoryImage(scene: StoryPresenterScene): { url: string; tier: 'scene' | 'page' | 'cover' } {
  if (scene.image.primaryUrl) {
    return { url: scene.image.primaryUrl, tier: 'scene' };
  }
  if (scene.image.pageCropUrl) {
    return { url: scene.image.pageCropUrl, tier: 'page' };
  }
  return { url: scene.image.coverUrl, tier: 'cover' };
}
```
- **Tier 1 (Ideal):** Paragraph scene crop (from `page_structures` scene bbox).
- **Tier 2 (Fallback):** The parent book page crop (from `book_pages` asset). Even if paragraph 3 doesn't have a specific illustration, showing the full book page keeps the student immersed in the book's authentic artwork.
- **Tier 3 (Safety Net):** Unit story cover illustration. Under no circumstances does the UI render a blank box or grey placeholder.

#### 4. The Zoom & Lightbox Component Specification (`StoryImageLightbox`)
- **Trigger:**
  - Board: A subtle zoom button (`🔍 Zoom Image`) in the top-right corner of the image stage, or clicking the image itself.
  - Student App: Tapping the illustration.
- **Interaction:**
  - Mounts a high-z-index full-screen overlay (`z-[100]`) with backdrop blur (`backdrop-blur-md bg-black/90`).
  - Board: Renders the image at maximum unconstrained dimensions (`max-w-[95vw] max-h-[95vh] object-contain`). Teacher clicks anywhere or presses `Escape` to close.
  - Student: Supports touch pinch-to-zoom and pan. A prominent `×` button in the top-right corner allows easy dismissal.

#### 5. Shared vs Device-Specific Surface Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SHARED CORE MODULES                             │
│  - useStoryPresenter (scene indexing, state machine, audio playback)  │
│  - StoryImageLightbox (zoom & pan overlay)                             │
│  - StoryDialogueParser (speaker turns & character color binding)       │
│  - StoryVocabPill (tap-to-inspect word popovers)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────┐
│        BOARD ADAPTER              │   │        STUDENT ADAPTER            │
│   (BoardStoryStage.tsx)           │   │    (SoloLessonPlayer.tsx)         │
│                                   │   │                                   │
│ • 16:9 Widescreen Layout          │   │ • Portrait Mobile/Tablet Layout   │
│ • QuickWheel Student Picker       │   │ • Self-Paced Audio Playback       │
│ • Remote Commander Listener       │   │ • Native Touch Swipe Gestures     │
│   (NEXT_PANEL, REVEAL_ANSWER)     │   │ • Hearts (♥) & Solo XP Rewards    │
│ • Dual-Write Scoring (addPoints + │   │ • Direct Attempt Logging to FSRS  │
│   attemptsLog)                    │   │                                   │
└───────────────────────────────────┘   └───────────────────────────────────┘
```

##### What is Shared:
- **State Machine:** Pacing through scenes: `Scene Read -> (Optional Prediction) -> (Optional Comprehension) -> Advance`.
- **Dialogue Engine:** Splitting narration from character turns with character badge colors.
- **Vocabulary Tap Popover:** Tapping highlighted words displays phonetic pronunciation, L1 translation, and audio pronunciation.
- **Zoom Lightbox:** The exact same modal component is reused across both devices.
- **Comprehension Evaluator:** Validating student selections against `correctIndex` and giving immediate visual feedback.

##### What Stays Device-Specific:
- **Board (`BoardStoryStage.tsx`):**
  - Uses 60/40 split-screen layout (Left: Reading feed with dialogue bubbles; Right: Large uncropped illustration stage).
  - Integrates with `QuickWheel` to designate who answers the comprehension check.
  - Listens to teacher remote actions (`state.lastAction`).
  - Dual-writes points to the classroom team leaderboard.
- **Student App (`SoloLessonPlayer.tsx`):**
  - Uses vertical card stack optimized for touch scrolling.
  - When comprehension triggers, the question slides up from the bottom as a drawer, keeping the illustration visible above.
  - Integrates with local hearts (`♥`) and awards personal student XP.
  - Fixes `gameRouting.ts` so `STORY_QUEST` routes directly to this coupled presenter rather than dumping the student into `ExerciseBattery`.

---


## §5 ⬜ Synthesis → owner approval


## §5 Synthesis — ZCode merge of both audits → FOR OWNER APPROVAL

**ZCode verdict: AG's coupling proposal is right; I verified the cited failure modes.** Status of the known three + additions:

1. **"Question with no story" (owner #7): board side FIXED today** (useUnitRelational recovery, commit 3fdefcf) — but AG found the STUDENT-app half: STORY_QUEST routes straight to questions with no story (gameRouting:86) — that fix is Stage 2 below.
2. **Anchored comprehension is the core UX change:** questions render WITH the scene + text visible (question replaces only the dialogue panel), never a separate blank card. Matches how guided reading actually works and the owner's instinct.
3. **Image fallback ladder (data-level):** page scene art → nearest previous scene → full book-page crop (we already crop per-paragraph book art). No dead grey boxes ever. Zoom: BOARD side shipped today (9d35718 — tap/magnifier fullscreen overlay, all three surfaces); student side joins in Stage 2.
4. **Sequencing + scope (each stage independently shippable):**
   - **Stage 1 — Data (edge):** enrich-unit story pass — illustration fallback ladder + never drop comprehension questions on AI timeout (cache + retry); scene→question anchoring stamps story_page_id (already present) verified end-to-end.
   - **Stage 2 — Shared StoryPresenter:** one presenter contract (pages, scenes, anchored question slot, zoom) consumed by BoardStoryStage (both builds converge to one), Story Quest, and the student Solo story step; student gains the story+zoom it lacks today.
   - **Stage 3 — Cleanup:** duplicate story slides de-duplicated from plans; Story Sequencing retirement folded into the Comic Panels type (owner already leaned this way).
