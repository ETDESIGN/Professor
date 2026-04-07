Phase 1 Complete: Auth Pipeline Fixed

Phase 2 & 3 Complete: 404s Purged and Mock Data Eradicated. DataService, Store, and Apps are 100% data-driven.

Phase 6 Complete: The AI Professor MVP successfully integrated with mock AIService delay and direct Supabase insertion for units and srs_items.

### Universal AI Architecture (Phase 7)
The AI Professor feature now uses a universal architecture via Supabase Edge Functions (`generate-lesson`). This secures API keys and allows plugging in any OpenAI-compatible endpoint (OpenRouter, DeepSeek, Kimi, Qwen).

### Multi-Modal Omni-Router (Phase 8)
The `generate-lesson` Edge Function was upgraded to serve as an Omni-Router. It performs parallel generation tasks returning a unified multimodal payload:
- **Text Generation (OpenRouter/Mistral)**
- **Image Generation (Google Generative AI/Nano Banana 2)**
- **Audio Voice Synthesis (ElevenLabs)**

---

## 🚀 PIVOT: MULTI-STAGE UNIT BUILDER WORKSPACE (April 2026)

**Architectural Pivot:** The Product Manager vetoed the single-shot Edge Function pipeline in favor of a **Multi-Stage Unit Builder Workspace**. Textbooks are complex (Comics, Vocab, Exercises), and a single-shot extraction lacks fidelity.

**New Pipeline:**
1. **Stage 1 (Ingestion):** Teacher uploads pages sequentially. Edge Function categorizes the page and extracts raw structured text (saved to draft DB).
2. **Stage 2 (Review & Edit):** A dual-pane workspace UI lets teachers review/edit extracted text page-by-page.
3. **Stage 3 (Asset Generation):** A second Edge Function generates images/audio based on *approved* text, using a Character Ledger.
4. **Stage 4 (Orchestration):** A third Edge Function maps finalized assets into Game Engine Timeline (ActivityBlocks).

**Completed Tasks:**
- Documented new architecture in `AI_PIPELINE_ARCHITECTURE.md`.
- Created database migration (`20260403000000_unit_draft_state.sql`) adding `scanned_assets` JSONB for draft states.
- Refactored `UploadTextbook.tsx` into a dual-pane Workspace view.

---

## 🤖 PHASE 10: MULTI-AGENT BACKEND

**Agent 1 (Vision Scanner) Implemented**
- Created new `extract-page` Edge Function.
- **Vision Integration:** Uses Universal AI gateway with proper OpenAI vision spec (`image_url` within the message object) to classify uploaded lesson pages via `VISION_MODEL_NAME`.
- **Strict Data Extraction:** Applies strict JSON-only system prompting designed for EdTech. Robustly escapes markdown and extracts specific `page_type` (e.g. COMIC, VOCABULARY, GRAMMAR) and `extracted_content`.
- **UI & DB Connection:** Upgraded `UploadTextbook.tsx` so when a teacher uploads a file to the Workspace, it immediately:
  1. Uploads the file to `materials` bucket.
  2. Invokes `extract-page` edge function with the public URL.
  3. Saves the parsed JSON to `units.scanned_assets` array under a draft unit ID.

**Agent 2 (The Orchestrator) Implemented (Phase 11)**
- Created new `orchestrate-lesson` Edge Function.
- Acts as a 'Master Educational Game Designer', taking the approved structured textbook assets.
- Maps the structured educational data (vocabulary, grammar) into a 5-step `LessonManifest` `timeline` (MEDIA_PLAYER, FOCUS_CARDS, GRAMMAR_SANDBOX, GAME_ARENA, STORY_STAGE).
- Updates the draft `units` Database row to `status: 'published'` with `flow: parsedResponse.timeline`.
- UI handles orchestration via green 'Approve & Generate Assets' button and redirects on success.
