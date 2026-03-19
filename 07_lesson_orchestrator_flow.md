# 07. Lesson Orchestrator & 6-Step Flow

## 1. The Universal Blueprint
The "Orchestrator" ensures every lesson follows a scientifically proven pedagogical structure, regardless of the source material's quality.

### The 6-Step Timeline (The Template)

| Step | Phase | Goal | Source Source | Board Container |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Warm-Up** | Switch to "English Mode" | YouTube / AI Song | `MEDIA_PLAYER` |
| **2** | **Vocab Input** | New word exposure | Textbook Images | `FOCUS_CARDS` |
| **3** | **Sentence** | Grammar modeling | Grammar Box | `GRAMMAR_BOARD` |
| **4** | **Game (Practice)** | Active drill | Multi-book drill | `GAME_ARENA` |
| **5** | **Application** | Story/Usage | Comic/Dialogue | `STORY_STAGE` |
| **6** | **Wrap-Up** | Score & Homework | System Stats | `SUMMARY_SCREEN` |

---

## 2. Orchestration Logic

### Multi-Day Splitting
If a teacher scans 20 pages (a full unit), the Orchestrator proposes a sequence:
- **Class 1 (Discovery):** Focus on Steps 1, 2, and 5.
- **Class 2 (Practice):** Focus on Steps 1, 3, and 4.
- **Class 3 (Performance):** Focus on Step 4 and 5 (Roleplay) + Quiz.

### Container Flexibility
If the scanner identifies a "Gap" (e.g., no Warm-Up provided in the book):
- The Orchestrator calls the **Gap-Filler Engine**.
- It generates a "Search Query" (e.g., "ESL song about Space") or a "Generative Prompt."
- It populates the container with the best match.

### Sequence Customization
Teachers can "Remix" the flow via the Lesson Studio:
- Drag-and-drop steps to change order.
- Delete unnecessary steps.
- Duplicate steps (e.g., two games instead of one).

---

## 3. Technical Blueprint Object
The result is a `blueprint_json` stored in the `lessons` table:
```json
{
  "unit_id": "...",
  "flow": [
    { "type": "MEDIA_PLAYER", "asset_id": "vid_123", "duration_goal": 300 },
    { "type": "FOCUS_CARDS", "data": { "items": [...] } },
    { "type": "GAME_ARENA", "game_type": "TICKET_WHEEL", "data": {...} }
  ]
}
```
Representing the "Source vs. Scenario" architecture.
