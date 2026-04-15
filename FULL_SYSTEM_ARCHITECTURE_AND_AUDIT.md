# Full System Architecture & Audit Report

## 1. Multi-Stage Pipeline Map
The current state of the EdTech application utilizes a heavily modified architecture originally designed for client-side generative AI (Gemini SDK), now pivoting to serverless orchestration (Supabase Edge Functions + universal LLMs). 

### Stage 1: Ingestion & Vision Scanning
* **Flow**: `UploadTextbook.tsx` -> Upload to `materials` bucket -> Invoke `extract-page` Edge Function.
* **Mechanism**: Agent 1 (Vision Scanner) processes textbook images and uses structural JSON regex extraction to pull raw JSON content (Vocabulary, Grammar tables, Comics). 
* **State**: The parsed pedagogical content is appended to `scans` state inside `UploadTextbook.tsx`. An empty draft unit is created via `MockEngine.createUnit` (or `SupabaseService.createUnit`) where the data is stored in `units.scanned_assets`.

### Stage 2: Draft Review (The Disconnected Node)
* **Flow**: `UploadTextbook.tsx` displays the raw JSON output in specialized viewers.
* **Disconnect**: Previously, `ReviewContent.tsx` governed this step using client-side `geminiService` and `LessonTransformer.ts`. `ReviewContent.tsx` currently acts as a phantom node; it still expects the legacy `LessonManifest` schema, but the active flow simply aggregates text assets from `UploadTextbook.tsx` directly.

### Stage 3: Orchestration (Agent 2)
* **Flow**: Teacher clicks **"Approve & Generate Assets"** inside `UploadTextbook.tsx`.
* **Mechanism**: Front-end calls `AIService.orchestrateLesson(draftUnitId, allAssets)`, which invokes the `orchestrate-lesson` Edge Function.
* **LLM Action**: The LLM parses the `allAssets` (deep reading content) and attempts to map them into exact game component parameters (`FOCUS_CARDS`, `STORY_STAGE`, etc.).
* **State Update**: The edge function directly performs a Supabase database `UPDATE` on `units`, setting `status: 'Active'` and injecting the LLM output into the `flow` JSONB column.

### Stage 4: Live Execution
* **Flow**: Teacher navigates to `/teacher/curriculum`, selects the unit, and launches `ClassroomBoard.tsx`.
* **Mechanism**: `SessionContext.tsx` reads `units.flow` into `activeSlideData`. The board UI dynamically mounts React components (`BoardFocusCards`, `BoardTeamBattle`) passing the raw `data` object from the database slice.

---

## 2. Root Cause Diagnostic: The "Dummy Data" Fallback
The defining issue is that **the Board components render dummy texts, missing images, and fake placeholders instead of actual gamified assets**. 

**Diagnostic Outcome:** This is **NOT** a crash, nor a `try/catch` fallback. The UI is rendering EXACTLY what Agent 2 (`orchestrate-lesson`) saved into the database. 

**The precise failure point:**
1. **The Deprecation of `LessonTransformer.ts`:** Under the legacy client-side system, the AI generated a semantic `LessonManifest`, which was then passed through `LessonTransformer.ts` to hydrate the `flow` array. The transformer injected dynamic image avatars (`getAssetUrl(keyword)`), generated TTS audio links, and formatted the JSON cleanly for React.
2. **The New Prompt Architecture Flaw:** To fix the Pipeline, we upgraded the Agent 2 system prompt to force the LLM to skip the Manifest and *generate the raw component `flow` array directly*.
3. **The LLM Hallucination:** The LLM does not have access to our `api.dicebear.com` image generator URLs. We fed it a massive JSON schema (e.g., `{ "image": "string" }`). Unable to generate actual URLs or React-compliant configurations, the LLM simply parrots the schema strings, returning literals like `"emoji"`, `"uuid-string"`, or completely hallucinated URLs. The React component blindly attempts to render these placeholders.

---

## 3. Disconnected & Missing Architectural Pieces

### A. The Schema Fracture: Manifest vs. Flow
The system operates on two conflicting architectural paradigms:
* **The `LessonManifest` Paradigm**: A semantic understanding of the unit (`knowledge_graph.vocabulary`, `meta.theme`).
* **The Game `Flow` Paradigm**: The exact UI implementation (`[ { type: 'FOCUS_CARDS', data: { cards: [...] } } ]`).
Agent 2 is trying to generate the `Flow` array directly, but LLMs are terrible at generating complex, nested, hydrated frontend prop objects. The pipeline is missing a **Server-Side Hydration Layer** (the server equivalent of `LessonTransformer.ts`).

### B. The `ReviewContent.tsx` Orphan
`ReviewContent.tsx` is completely uncoupled from the new Orchestrator pipeline. It attempts to read data via `services/geminiService.ts`, which we have slated for deprecation. We currently completely bypass the teacher's ability to edit the generated game timelines before they are finalized.

### C. Missing Asset Generation
Agent 2 cannot generate Text-to-Speech audio or external image assets by itself. We are missing the "Asset Curator" phase. Board games that require dynamic images or character audio currently crash or show empty white space.

---

## 4. Execution Roadmap (Moving Forward)
To completely heal the pipeline, we must execute the following:

**Phase 1: Re-establish the Manifest -> Flow Separation**
1. Revert the Agent 2 (`orchestrate-lesson`) System Prompt so it **only** generates the semantic `LessonManifest` (the intelligence).
2. Do **not** ask Agent 2 to generate exact React component properties.

**Phase 2: Backend Hydration (The Missing Link)**
1. Move the logic of `LessonTransformer.ts` into a new Edge Function, `hydrate-lesson`, or safely execute it inside `orchestrate-lesson` *after* the LLM returns the `LessonManifest`. 
2. The code will programmatically map `manifest.knowledge_graph.vocabulary` into the exact `FOCUS_CARDS` structure and inject the proper `getAssetUrl()` links, entirely shielding the LLM from UI details.

**Phase 3: Re-wire `ReviewContent.tsx`**
1. Instead of immediately pushing the `flow` to the DB and setting to `Active`, `UploadTextbook.tsx` will return the `LessonManifest`.
2. `ReviewContent.tsx` will load the `LessonManifest` and hydrate it using the Transformer, allowing the teacher to modify the actual game sequence visually.
3. Only upon Teacher confirmation will the unit be pushed to `Active`.
