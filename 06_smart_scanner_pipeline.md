# 06. Smart Scanner & Content Pipeline

## 1. The Scanning Workflow
The "Magic Scanner" is the entry point for all content. It follows a multi-stage pipeline:

### Stage 1: Layout & Object Detection (OD)
- **Visual Slicing:** The AI identifies geometric boundaries of content blocks.
- **Categorization:** Tags blocks as `DialogueBubble`, `VocabBox`, `ReadingPassage`, or `Illustration`.
- **Character Linking:** Matches characters across panels to create a "Character Profile" (e.g., "Mike: Boy, Red Cap, Voice: High-pitched").

### Stage 2: Contextual Extraction (NLP)
- **Dialogue Extraction:** OCRs speech bubbles and assigns them to characters for the "Dubbing" feature.
- **Exercise Mapping:** Translates paper exercises (e.g., "Fill in the blank with the correct verb") into structured JSON objects (e.g., `type: 'grammar_fill_blank'`).
- **Metadata Tagging:** Assigns difficulty, topic (e.g., 'Animals'), and skill focus (e.g., 'Listening') to every item.

### Stage 3: Asset Refinement (Enhancement)
- **Image Upscaling:** Low-quality scans are replaced or enhanced using Generative AI (Nano Banana).
- **Style Matching:** All generated assets are prompted to match the "Cartoon/Textbook" aesthetic of the source material.
- **Audio Generation:** TTS (Text-to-Speech) creates character-specific audio files for every line of dialogue.

---

## 2. Ingestion Modes

### Unit Mode (Primary)
- Teacher uploads 5-10 pages of a full unit.
- AI suggests a multi-day (Day 1/2/3) lesson split based on page themes.

### Quick-Snap Mode (Live)
- Teacher snaps a student's work or a specific object.
- AI instantly removes background and projects it onto the "Show & Tell" screen of the Big Board.

### Exercise-Specific Scan
- Teacher highlights a specific box in the book.
- AI converts ONLY that box into a Game Template (e.g., "Tic-Tac-Toe").

---

## 3. Quality Control (Split-Screen)
To ensure teacher trust, the scanner UI (Lesson Studio) features:
- **Source Highlight:** Hovering over a generated word highlights its exact location on the original scan.
- **Confidence Scores:** AI flags low-confidence extracts for manual verification.
