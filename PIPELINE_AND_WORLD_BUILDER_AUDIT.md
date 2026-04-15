# Pipeline & World Builder Audit Report

**Date:** 2026-04-16 | **Auditor:** Principal EdTech Architect

---

## 1. Diagnosis: Where the "Jungle" is Hiding

### 🔴 Source 1: `BoardFocusCards.tsx` — Line 101 (The Primary Offender)
**File:** `apps/board/templates/BoardFocusCards.tsx`

```tsx
// Line 101 - HARDCODED template sentence injected in UI
"The <span>...{activeCard.back.toLowerCase()}...</span> lives in the jungle."
```
**Impact:** This is the exact source of the "The bus lives in the jungle" incident. The example sentence is a **hardcoded narrative template**, completely ignoring any context from the AI manifest. It does not read `activeCard.context_sentence` or any AI-generated field. The fix is to replace this with `activeCard.context_sentence || activeCard.definition`.

---

### 🔴 Source 2: `BoardMediaPlayer.tsx` — Lines 18-31 & 79 & 104 (Default Fallbacks)
**File:** `apps/board/templates/BoardMediaPlayer.tsx`

```tsx
// Line 18: Fallback lyrics when data.lyrics is missing
const lyrics = data.lyrics || [
  { text: "Walking in the jungle...", time: 0 },
  ...
];

// Line 79: Hardcoded default YouTube video
url={data.videoUrl || "https://www.youtube.com/watch?v=GoSq-yZcJ-4"} // Default walking in the jungle

// Line 104: Hardcoded title fallback
{data.title || "Walking in the Jungle"}
```
**Impact:** Our `transformManifestToFlow` in `orchestrate-lesson/index.ts` saves `data: { title, videoThumbnail, lyrics: [] }`. Because `lyrics` is an **empty array** (not undefined), the `data.lyrics || fallback` expression actually evaluates to the empty array — and the karaoke system renders nothing instead of the fallback. This is a secondary issue. The primary problem is that the fallback defaults are all jungle-themed.

---

### 🔴 Source 3: `BoardFocusCards.tsx` — Card `front` field is always `"📸"` emoji
The transformer in `orchestrate-lesson/index.ts` always sets `front: "📸"` for every card. The component renders the `front` emoji on the face-up side. This is a placeholder, not the actual vocabulary image or the word. Users see a generic camera emoji for every word.

---

## 2. Console Crash: `Cannot read properties of undefined (reading 'id')`

### Root Cause: `BoardGameArena` Component vs. Quiz Data Contract
**The architectural mismatch is severe:**

| What orchestrator saves (`flow`) | What `BoardGameArena.tsx` expects |
|---|---|
| `type: 'GAME_ARENA'` with `data.questions` array | **Ignores `data.questions` entirely** |
| `{ id, text, options, correct }` per question | Component renders a **Wheel of Destiny** (student picker) |

The `BoardGameArena` component is a **student-selection wheel**, not a quiz engine. When the teacher navigates to the GAME_ARENA step in the lesson, the component tries to spin to `students[0].id`, but if students have not been loaded yet, `students` is empty `[]`, and `students[0]` is `undefined` — causing the crash `Cannot read properties of undefined (reading 'id')`.

**The quiz questions that the Orchestrator carefully generates are never displayed.** They are saved to the database but consumed by no component.

---

## 3. What Works vs. What is Broken

### ✅ What Works
| Component | Status |
|---|---|
| Agent 1 (`extract-page`) Vision Scanning | ✅ Working — Extracts vocab, grammar, comics |
| `UploadTextbook.tsx` page aggregation | ✅ Working — Collects all scanned pages |
| Agent 2 (`orchestrate-lesson`) LLM manifest generation | ✅ Working — Produces semantic JSON |
| Server-side `transformManifestToFlow()` | ✅ Working — Deterministically hydrates flow |
| DB Save (`units.status = 'Active', units.flow`) | ✅ Working |
| `ClassroomBoard.tsx` routing of slides | ✅ Working — Routes by `currentStep.type` |
| `BoardFocusCards` — Card flip animation | ✅ Working |
| `BoardMediaPlayer` — Video playback | ✅ Working (using ReactPlayer) |

### ❌ What is Broken / Mocked
| Component | Bug |
|---|---|
| `BoardFocusCards` line 101 | ❌ Hardcoded "lives in the jungle" sentence |
| `BoardFocusCards` card `front` | ❌ Always renders `"📸"` emoji, never the actual word image |
| `BoardMediaPlayer` default lyrics | ❌ Falls back to "Walking in the jungle" lyrics |
| `BoardGameArena` | ❌ Is a student wheel, not a quiz; crashes when students are empty |
| GAME_ARENA quiz questions | ❌ AI-generated quiz data never displayed to class |
| `context_sentence` field | ❌ Not in the manifest schema; sentence is never AI-generated |
| Dicebear 400 errors | ❌ `encodeURIComponent` on empty strings generates invalid URLs |

---

## 4. The Dicebear 400 (Bad Request) Error

**Root Cause:** When vocabulary items have empty or null `word` fields (edge case with LLM output), the transformer generates:
```
https://api.dicebear.com/7.x/shapes/svg?seed=
```
An empty `seed` parameter causes Dicebear to return HTTP 400. The fix is to add a guard: `seed=${encodeURIComponent(v.word || 'default')}`.

---

## 5. Proposed: Unified World Architecture

### The Core Concept: ThemeContext Binding
Every unit must establish a `ThemeContext` object. The LLM is instructed to generate **all** content — vocabulary sentences, grammar examples, story dialogue — bound to this single world.

### The New Semantic Manifest Schema (Agent 2 Output)

```json
{
  "meta": {
    "unit_title": "Let's Go to the City!",
    "theme": "City Transportation",
    "world_description": "A busy city where people travel by bus, taxi, and train.",
    "difficulty_cefr": "A2"
  },
  "theme_context": {
    "setting": "A city bus stop and train station",
    "characters": [
      { "name": "Leo", "role": "Student", "emoji": "🧒" },
      { "name": "Ms. Chen", "role": "Bus Driver", "emoji": "👩‍✈️" }
    ]
  },
  "knowledge_graph": {
    "vocabulary": [
      {
        "word": "bus",
        "definition": "A large vehicle that carries many passengers",
        "context_sentence": "The bus stops at every corner in the city.",
        "distractors": ["train", "car", "bicycle"]
      }
    ],
    "grammar_rules": [
      {
        "rule": "There is / There are",
        "explanation": "Use 'there is' for singular, 'there are' for plural",
        "world_examples": ["There is a bus at the stop.", "There are taxis near the hotel."]
      }
    ]
  }
}
```

### Server-Side Hydration Pipeline (The Missing Link)

```
LLM → Semantic Manifest → transformManifestToFlow() → Game-Ready Flow
                                     ↓
        [MEDIA_PLAYER]  title from meta.theme, lyrics from manifest.knowledge_graph.vocab
        [FOCUS_CARDS]   cards from vocabulary, context_sentence on back
        [QUIZ_STAGE]    questions from vocabulary + distractors (NEW component)
        [GRAMMAR_BOX]   rules from grammar_rules with world_examples
```

---

## 6. Execution Roadmap (Step-by-Step)

### Step A: Upgrade Agent 2 Prompt — Add `context_sentence` & `theme_context`
Update `orchestrate-lesson/index.ts` system prompt to explicitly require the LLM to generate `context_sentence` for every vocabulary item, bound to the `world_description` (not "the jungle").

### Step B: Fix `BoardFocusCards.tsx` — Remove "lives in the jungle"
- Replace hardcoded sentence with `activeCard.context_sentence || activeCard.definition`.
- Change `front` rendering: if image URL is valid, show image; otherwise show the word itself.

### Step C: Fix `BoardMediaPlayer.tsx` — Remove jungle defaults
- Replace hardcoded lyrics fallback with `[]` (silence, show "No lyrics available").
- Replace hardcoded YouTube URL fallback with a neutral educational video or null rendering.

### Step D: Fix Dicebear Guard — Empty Seed Protection
In `orchestrate-lesson/index.ts` `transformManifestToFlow`:
```ts
image: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word || 'vocab')}`
```

### Step E: Replace `BoardGameArena` with `BoardSpeedQuiz` for GAME_ARENA type
`BoardGameArena` is a student-selection wheel and should remain mapped to `WHEEL_OF_DESTINY`. The new GAME_ARENA flow step should render `BoardSpeedQuiz` (or a similar quiz component), which already accepts `{ questions: [...] }` props.

Change in `ClassroomBoard.tsx` line 121:
```tsx
// FROM:
{currentStep.type === 'GAME_ARENA' && <BoardGameArena data={currentStep.data} />}
// TO:
{currentStep.type === 'GAME_ARENA' && <BoardSpeedQuiz data={currentStep.data} />}
```

### Step F: Verify `BoardSpeedQuiz` data contract matches transformer output
Confirm `BoardSpeedQuiz` expects `{ questions: [{ id, text, options, correct }] }` — which is exactly what our transformer generates.

---

## 7. Summary of Root Causes

| Bug | Root Cause | Fix |
|---|---|---|
| "The bus lives in the jungle" | Hardcoded template string in `BoardFocusCards.tsx:101` | Use `activeCard.context_sentence` |
| GAME_ARENA crash (`id` undefined) | `BoardGameArena` is a wheel, not a quiz; uses student data, not question data | Remap GAME_ARENA → `BoardSpeedQuiz` |
| Dicebear 400 error | Empty seed parameter from null/empty word | Add `|| 'vocab'` guard |
| Jungle lyrics in MediaPlayer | Lyrics are `[]` not `undefined`, causing the empty karaoke display | Generate thematic lyrics in manifest OR remove jungle fallback |
| Context sentences jungle-themed | No `context_sentence` field in LLM prompt | Add field + theme binding to Agent 2 prompt |
