# 05. AI Architecture & Gemini Integration

## 1. Multi-Modal "Director" Strategy
The app uses Google Gemini (1.5 Pro and Flash) as a central "Director" that doesn't just extract text but interprets pedagogical intent.

### Gemini 1.5 Pro (The Architect)
- **Role:** Heavy-lifting analysis of textbook pages/PDFs.
- **Task:** Vision-to-JSON orchestration. It sees the layout (comic strips, exercise boxes, grammar tips) and generates the `blueprint_json` for the lesson.
- **Context Awareness:** Recognizes recurring characters and maintains consistency across units.

### Gemini 1.5 Flash (The Speedster)
- **Role:** Real-time interactions and simpler tasks.
- **Tasks:** 
    - Real-time scoring of student recordings.
    - Generating search queries for YouTube/Unsplash.
    - Quick "Remote Control" voice command interpretation.
    - Chatting with teachers for quick edits.

---

## 2. Key AI Workflows

### Phase A: Vision to Structure
1. **Input:** Multi-page image upload.
2. **Analysis:** Gemini segmentates the images into:
    - `VOCABULARY`: Lists of words/images.
    - `NARRATIVE`: Comic panels and dialogue.
    - `GRAMMAR`: Explicit rule boxes or implicit patterns.
    - `MECHANICS`: Exercise types (Matching, Phonics, etc.).
3. **Output:** A structured JSON object defining the "Director's Script."

### Phase B: Asset Ingestion & Hydration
1. **Gap Detection:** The system checks the JSON for missing assets (e.g., "Need video for 'The Rainbow Song'").
2. **Agentic Search:** 
    - Queries YouTube Data API for relevant ESL videos.
    - Queries Unsplash API for high-res images.
3. **Generative Fallback:** If search fails, the system uses Nano Banana (via Gemini prompts) to generate style-consistent images/audio.

### Phase C: Assessment (Student App)
1. **Pronunciation:** Uses Gemini's audio processing to compare student recordings against a reference native pronunciation.
2. **Scoring:** Returns a 1-3 star rating and specific feedback (e.g., "Great job, but emphasize the 's' in 'apples'").

---

## 3. The "Global Brain" (RAG)
- **Feedback Loop:** Corrections made by one teacher (e.g., fixing a misidentified word) are saved to a vector database.
- **Collaborative IQ:** Future teachers scanning the same book receive the "Refined" version automatically, improving system accuracy over time.
