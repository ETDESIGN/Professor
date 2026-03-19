# 18. API & Real-time Synchronization

## 1. Goal
To ensure the Teacher's Phone acts as a seamless remote control for the Classroom Board with <100ms latency.

## 2. Real-time Architecture: Supabase Realtime Channels

### Channel: `session_sync:{session_id}`
Used to broadcast state changes from the **Commander (Phone)** to the **Board (Projector)**.

**Events:**
- `SLIDE_NAVIGATE`: `{ index: 5 }`
- `TOGGLE_REVEAL`: `{ active: true }`
- `TRIGGER_WHEEL`: `{ start: true, winner_id: "..." }`
- `AWARD_POINTS`: `{ student_id: "...", stars: 10 }`
- `SESSION_PAUSE`: `{ reason: "attention_check" }`

---

## 3. Key API Endpoints (Edge Functions)

### `/orchestrate-lesson` (POST)
- **Input:** Array of image URLs (scans).
- **Action:** Triggers Gemini 1.5 Pro analysis.
- **Output:** Validates and returns the `blueprint_json`.

### `/generate-asset` (POST)
- **Input:** Prompt, Asset Type.
- **Action:** Calls Nano Banana / Search APIs.
- **Output:** Returns the processed Asset URL.

### `/grade-submission` (POST)
- **Input:** Student Audio URL, Target Text.
- **Action:** Uses Gemini to score pronunciation.
- **Output:** Returns score (0-100) and feedback string.

---

## 4. Data Security
- **RLS (Row Level Security):** Ensures students can only see their own scores and their class's public leaderboard.
- **API Keys:** All external API keys (Gemini, YouTube, etc.) are stored as Supabase Secrets, never exposed to the frontend.
