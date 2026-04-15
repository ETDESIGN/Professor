# Pipeline Audit Report
**Date:** 2026-04-16  
**Scope:** Full end-to-end audit of the Multi-Stage Unit Builder pipeline  
**Auditor:** Principal Cloud Architect — AI Engineering Session

---

## Executive Summary

The pipeline has **3 critical blockers**, **2 major data contract gaps**, and **1 orphaned parallel pipeline** that must be resolved before a lesson can go from textbook upload to a playable game session. Each finding is documented with root cause, affected files, and precise fix instructions.

---

## 1. What Is Working Perfectly ✅

| Component | Status | Notes |
|---|---|---|
| `extract-page` Vision Scanner | ✅ Working | Correctly classifies pages and extracts `{ pedagogy, extracted_content }` |
| Regex JSON sanitization | ✅ Robust | The `/\{[\s\S]*\}/` pattern successfully bypasses markdown wrapping from LLMs |
| Supabase Storage Upload | ✅ Working | Files are correctly uploaded to `materials` bucket and a public URL is returned |
| `UploadTextbook.tsx` UI | ✅ Working | Dual-pane workspace correctly shows extracted pedagogy cards (vocab, objectives) |
| `orchestrate-lesson` AI call | ✅ Working | LLM successfully generates the game timeline JSON |
| Error wrapping (200 OK pattern) | ✅ Working | Both edge functions correctly wrap errors in `{ success: false, error: ... }` for safe FE parsing |
| RLS Policy (units) | ✅ Correct | Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS safely |

---

## 2. What Is Broken 🔴 — Root Causes of Current Crashes

### 🔴 BLOCKER 1: Database Status Constraint Violation (THE CRASH)

**Error:** `new row for relation "units" violates check constraint "units_status_check"`

**Root Cause:** The `orchestrate-lesson` Edge Function is trying to set `status: 'Completed'` (previously `'published'`). The Postgres constraint in [`20260320000000_initial_schema.sql`](./supabase/migrations/20260320000000_initial_schema.sql) line 8 only allows:

```sql
CHECK (status IN ('Active', 'Draft', 'Locked', 'Completed', 'Processing'))
```

> ⚠️ `'Completed'` **is actually valid**! The crash was happening earlier when `'published'` was being sent. The current code (after our last fix) sends `'Completed'` which **should not crash**.

**Suspected Current Issue:** The draft unit is inserted with `status: 'Draft'` (line 240 of `UploadTextbook.tsx`). The UPDATE on `'Completed'` should work. The more likely culprit is that the **update targets a unit that does not exist** (because `draftUnitId` is `null` when the approve button fires), causing a silent fail or unexpected constraint error on an upsert.

**Affected Files:**
- [`supabase/functions/orchestrate-lesson/index.ts`](./supabase/functions/orchestrate-lesson/index.ts) — line 104
- [`apps/teacher/UploadTextbook.tsx`](./apps/teacher/UploadTextbook.tsx) — line 204: `if (!draftUnitId) return;` — this is a **silent return with zero feedback**

**Fix Required:**
1. Change the silent early return in `handleApprove` to a `toast.error('No draft unit found. Please upload a page first.')` so the teacher knows WHY the button does nothing.
2. The status on approve must be `'Active'` (not `'Completed'`) — Active signals "ready to teach", Completed signals "students have finished it". This is what `ReviewContent.tsx` line 46 and `LessonStudio.tsx` line 133 both correctly use.

---

### 🔴 BLOCKER 2: Two Parallel, Disconnected Approval Pipelines

This is the most dangerous architectural flaw. **There are currently two entirely different review/approval flows that do NOT connect to the same data source.**

**Pipeline A (NEW — UploadTextbook.tsx):**
```
Upload → extract-page → scanned_assets (units table) → orchestrate-lesson → flow (units table)
```
The `approvedAssets` payload passed to `orchestrate-lesson` comes from `scan.data` — which is the **raw output from `extract-page`**, i.e. `{ page_type, pedagogy, extracted_content }`.

**Pipeline B (OLD — ReviewContent.tsx / LessonStudio.tsx):**
```
GenerateLessonModal → geminiService → LessonManifest → ReviewContent → transformManifestToFlow → flow (units table)
```
This pipeline expects a structured `LessonManifest` with `{ meta, knowledge_graph, timeline }` — a completely different schema.

**Result:** The `orchestrate-lesson` Edge Function receives the raw `extract-page` output (`{ pedagogy, extracted_content }`) but its system prompt asks the AI to transform a **different data structure.** The resulting timeline has `data: {}` (empty objects) for all 5 activity blocks because the AI cannot fill in real vocab data without receiving it in the expected format.

**Affected Files:**
- [`apps/teacher/UploadTextbook.tsx`](./apps/teacher/UploadTextbook.tsx) — `handleApprove` passes `scan.data` (wrong shape)
- [`supabase/functions/orchestrate-lesson/index.ts`](./supabase/functions/orchestrate-lesson/index.ts) — system prompt doesn't map `extracted_content.vocabulary` into game blocks
- [`apps/teacher/ReviewContent.tsx`](./apps/teacher/ReviewContent.tsx) — still connected to `geminiService`, not the new pipeline

---

### 🔴 BLOCKER 3: `orchestrate-lesson` Returns `timeline` and Saves It as `flow`, But the Board Engine Ignores It

The `orchestrate-lesson` saves `parsedResponse.timeline` to `units.flow`. However, the game engine **does not use the raw AI timeline**—it requires the output of `LessonTransformer.transformManifestToFlow()`.

**What the Board Expects (from `LiveCommander.tsx` line 48-49):**
```typescript
const currentStep = state.activeSlideData;  
const activeFlow = state.activeUnit?.flow || [];
```

Each flow item must have:
```typescript
{ id: string, type: string, title: string, duration: number, teacherGuide: { instruction, script }, data: { cards[] | questions[] | pages[] } }
```

**What `orchestrate-lesson` saves to `flow`:**
```json
[
  { "type": "FOCUS_CARDS", "title": "Vocab", "duration": 10, "data": {} },
  { "type": "GAME_ARENA", "title": "Speed Quiz", "duration": 10, "data": {} }
]
```

Critical missing fields: `id`, `teacherGuide`, and populated `data` objects. The board will crash or render a blank slide.

---

## 3. What Is Disconnected / Missing 🟡

### 🟡 GAP 1: `orchestrate-lesson` Does Not Save `srs_items`

The `knowledge_graph.vocabulary` in the AI-generated manifest contains `{ word, definition, distractors, image_prompt }`. This data should be inserted into the `srs_items` table so students can review words via Spaced Repetition. **This step is completely missing from both edge functions.**

The `srs_items` schema requires `{ student_id, word, translation }` but has **no `unit_id` FK link** (it was added in a separate migration). Without this, flashcard progress tracking never links to a unit.

**Affected Files:**
- [`supabase/functions/orchestrate-lesson/index.ts`](./supabase/functions/orchestrate-lesson/index.ts) — no SRS insert
- [`supabase/migrations/20260325000001_add_unit_id_to_srs.sql`](./supabase/migrations/20260325000001_add_unit_id_to_srs.sql) — exists, but not used at publish time

---

### 🟡 GAP 2: `BoardFocusCards` and `BoardGameArena` Will Always Render Empty

**`BoardFocusCards`** (used in `LiveCommander.tsx` line 236) expects `data.cards[]`. The `LessonTransformer.ts` correctly builds this from `manifest.knowledge_graph.vocabulary`. But `orchestrate-lesson` saves `{ data: {} }` — empty. No cards will appear.

**`BoardGameArena`** / `BoardSpeedQuiz` expects `data.questions[]`. Same problem — the AI generates questions in `timeline[i].data` conceptually, but the prompt's schema uses `data: {}` as a placeholder. The transformer in `LessonTransformer.ts` lines 79–85 shows the correct data shape needed.

---

### 🟡 GAP 3: `scanned_assets` Contains Only ONE Page Scan (Single-File Limitation)

`UploadTextbook.tsx` line 277 contains the comment: `// Process only the first uploaded file in this demo`. The draft unit accumulates scanned_assets correctly for multiple uploads, but `handleApprove` only sends `scan.data` for the **currently selected page** — not all pages. Multi-page textbooks will lose data.

---

## 4. Step-by-Step Execution Plan 🛠️

### Phase A — Fix the Database Crash (30 min)

**Step 1:** In `UploadTextbook.tsx`, replace the silent `if (!draftUnitId) return;` with:
```typescript
if (!draftUnitId) {
  toast.error('No draft unit found. Upload a page first.');
  return;
}
```

**Step 2:** Change the status in `orchestrate-lesson/index.ts` line 104:
```typescript
status: 'Active'  // Was 'Completed', 'Active' = "ready to teach"
```

---

### Phase B — Fix the Data Contract (2 hours)

**Step 3:** In `UploadTextbook.tsx`, change `handleApprove` to pass ALL scanned assets, not just the current page:
```typescript
const handleApprove = async () => {
  const allAssets = Object.values(scans).filter(s => s.status === 'success').map(s => s.data);
  await AIService.orchestrateLesson(draftUnitId, allAssets);
};
```

**Step 4:** In `orchestrate-lesson/index.ts`, update the system prompt to explicitly map `extracted_content.vocabulary` to game block `data` fields. The prompt must instruct the AI to fill in the 5 `data` objects with real content from the input, not empty `{}`.

**Step 5:** After parsing the AI response in `orchestrate-lesson`, **run it through the existing `LessonTransformer` logic** (or replicate it inside the edge function). The output saved to `units.flow` must include `id`, `teacherGuide`, and populated `data`.

---

### Phase C — Wire SRS Items (1 hour)

**Step 6:** At the end of `orchestrate-lesson`, after updating `units`, insert vocabulary into `srs_items`:
```typescript
const vocabItems = parsedResponse.knowledge_graph.vocabulary.map(v => ({
  student_id: 'unit_template',  // placeholder — replaced at lesson start
  word: v.word,
  translation: v.definition,
  unit_id: unitId
}));
await supabase.from('srs_items').insert(vocabItems);
```

---

### Phase D — Connect the Pipelines (1 hour)

**Step 7:** Decision point: **deprecate Pipeline B** (`ReviewContent.tsx` + `GenerateLessonModal`) and make `UploadTextbook.tsx` the single entry point. OR make `ReviewContent.tsx` accept `scanned_assets` as input instead of a `LessonManifest`.

**Recommended:** Update `ReviewContent.tsx` to accept the new schema from `orchestrate-lesson` (which returns the full `orchestration` object including `knowledge_graph`). Pass this as `initialBlueprint` and update its Save/Publish handler to call `AIService.orchestrateLesson()` instead of `transformManifestToFlow`.

---

### Phase E — Verification

1. **DB Constraint:** Upload a page → click Approve → check Supabase Dashboard `units` table. Row status must be `'Active'`, `flow` must be a non-empty array.
2. **Board Rendering:** Navigate to Curriculum → click "Start Class" → `LiveCommander` must show real vocab cards (not blank).
3. **SRS Items:** Check `srs_items` table has rows with `unit_id` matching the published unit.
4. **Multi-page:** Upload 2 pages → approve → verify `scanned_assets` has 2 objects, `flow` has data from both.

---

## Appendix: File Risk Map

| File | Risk | Issue |
|---|---|---|
| `supabase/functions/orchestrate-lesson/index.ts` | 🔴 Critical | Status bug, empty `data: {}`, no SRS insert |
| `apps/teacher/UploadTextbook.tsx` | 🔴 Critical | Silent return on null draftUnitId, sends single page only |
| `services/LessonTransformer.ts` | 🟡 Orphaned | Not called in new pipeline; logic must be replicated |
| `apps/teacher/ReviewContent.tsx` | 🟡 Orphaned | Still uses old `geminiService` manifest schema |
| `apps/teacher/LiveCommander.tsx` | 🟢 Safe | Correctly reads `unit.flow` — will work once flow is populated correctly |
| `apps/board/ClassroomBoard.tsx` | 🟢 Safe | Correctly reads `activeSlideData` |
