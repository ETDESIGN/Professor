# AI Generation Pipeline Architecture (Multi-Stage Workspace)

This document describes the updated Multi-Stage Unit Builder Workflow for converting textbook pages into interactive lesson units. The previous single-shot LLM approach has been deprecated in favor of a multi-stage sequential layout to ensure high-fidelity data extraction, teacher review, and stable asset generation.

## Stage 1: Ingestion
- **Upload:** The teacher uploads textbook pages (images/PDFs) sequentially into the Workspace.
- **Edge Function 1 (Extraction):** The system categorizes each page (e.g., Comic, Vocab List, Grammar Box) and extracts raw structured text (e.g., comic dialogues, target vocabulary, and grammar rules).
- **Draft Storage:** The extracted raw text is saved into the database (`units.scanned_assets`) to persist the draft state.

## Stage 2: Review & Edit
- **Workspace UI:** The Teacher Workspace displays a sidebar of uploaded pages and a main review area.
- **Human-in-the-Loop:** The teacher manually reviews the extracted raw text for the selected page, fixing any OCR or parsing mistakes (e.g., correcting comic dialogue typos, fixing vocabulary definitions).
- **Persistence:** Edits are synced back to the `units.scanned_assets` draft JSON array.

## Stage 3: Asset Generation
- **Edge Function 2 (Enrichment):** Based on the *approved* text, the system generates enriched educational assets.
  - Image prompts are crafted.
  - Audio scripts for dubbed stories are synthesized.
  - Distractors for vocabulary mini-games are created.
- **Character Ledger:** A character ledger is maintained to ensure visual and narrative consistency across generated assets.

## Stage 4: Orchestration
- **Edge Function 3 (Timeline Assembly):** The finalized assets are mapped into the Game Engine Timeline.
- **ActivityBlocks:** Game-ready configurations (e.g., SPEED_QUIZ, FOCUS_CARDS, STORY_STAGE) are generated and saved as the `flow` array on the unit.
- **Publish:** The Unit moves from "Draft" to "Published" status, becoming playable in the Classroom Board.
