# AI Generation Pipeline Architecture

## Overview

This document describes the complete flow from document upload to database insertion in the Professor AI platform.

## Pipeline Flow

```
UploadTextbook.tsx
    ↓ (file upload + text extraction)
AIService.generateLessonContent()
    ↓ (Supabase Edge Function invocation)
generate-lesson/index.ts (Edge Function)
    ↓ (LLM API call via OpenRouter)
LLM Response (JSON)
    ↓ (sanitization + fallback)
Edge Function Response
    ↓ (AIService resilience layer)
UploadTextbook.tsx
    ↓ (database insert)
units + srs_items tables (Supabase)
```

## Step-by-Step Breakdown

### 1. UploadTextbook.tsx (Frontend Component)

**Location:** `apps/teacher/UploadTextbook.tsx`

**Responsibilities:**
- Accept file uploads (PDF, images) via drag-and-drop or file picker
- Upload physical files to Supabase Storage (`materials` bucket)
- Extract text from PDFs using `pdfjs-dist`
- Call `AIService.generateLessonContent()` with extracted text as `documentContext`
- Insert generated unit into `units` table
- Insert generated flashcards into `srs_items` table
- Display review UI for teacher to approve/edit before publishing

**Key Functions:**
- `extractTextFromPDF(file)` - Extracts text from first 10 pages of PDF
- `uploadFileToStorage(file)` - Uploads to `supabase.storage.from('materials')`
- `handleAIComplete()` - Orchestrates the full pipeline

### 2. AIService.ts (Frontend Service Layer)

**Location:** `services/AIService.ts`

**Responsibilities:**
- Invoke the Supabase Edge Function `generate-lesson`
- Handle error responses from Edge Function
- Apply resilient defaults for missing properties
- Return a typed `GeneratedLesson` object

**Data Contract - Expected Response:**
```typescript
{
  textContent: {
    title: string,
    description: string,
    visual_prompt?: string,
    spoken_intro?: string,
    flashcards: Array<{ question: string, answer: string }>
  },
  imageUrl: string,
  audioUrl: string | null
}
```

**Resilience Layer:**
- If `data.success === false`, throws error with `data.error` message
- If `textContent` is missing, uses safe defaults
- If `flashcards` array is empty/missing, generates 5 fallback flashcards
- All properties have fallback values to prevent frontend crashes

### 3. generate-lesson/index.ts (Supabase Edge Function)

**Location:** `supabase/functions/generate-lesson/index.ts`

**Responsibilities:**
- Receive `{ topic, gradeLevel, documentContext }` payload
- Build system prompt for LLM (different for document vs topic-based)
- Call LLM API (OpenRouter/Mistral) with `response_format: { type: "json_object" }`
- Sanitize LLM response (strip markdown code blocks)
- Parse JSON with fallback on failure
- Run parallel image/audio generation (if API keys configured)
- Return unified multimodal response

**JSON Sanitization Pipeline:**
```
Raw LLM Response
    ↓
Strip ```json markers
    ↓
Strip everything before first {
    ↓
Strip everything after last }
    ↓
JSON.parse()
    ↓ (on failure)
Safe fallback object with 5 default flashcards
    ↓
Ensure all required properties exist
```

**Safe Fallback Object:**
```json
{
  "title": "Generated Lesson",
  "description": "A lesson about the topic.",
  "visual_prompt": "Educational illustration",
  "spoken_intro": "Welcome to today's lesson!",
  "flashcards": [
    { "question": "What is the main topic?", "answer": "The lesson content" },
    { "question": "What grade level?", "answer": "General" },
    { "question": "What to learn?", "answer": "Key concepts" },
    { "question": "How to practice?", "answer": "Review flashcards" },
    { "question": "Next step?", "answer": "Continue to next lesson" }
  ]
}
```

**Environment Variables Required:**
- `AI_BASE_URL` - LLM API endpoint (e.g., `https://openrouter.ai/api/v1`)
- `AI_API_KEY` - LLM API key
- `AI_MODEL_NAME` - Model identifier (e.g., `mistralai/mistral-7b-instruct:free`)
- `GOOGLE_API_KEY` - (Optional) For image generation
- `ELEVENLABS_API_KEY` - (Optional) For audio generation

### 4. Database Insertion (Supabase)

**Tables Modified:**

#### `units` table
```sql
INSERT INTO units (
  title,           -- From generated.textContent.title
  topic,           -- From filename or "Document Summary"
  level,           -- Grade level (e.g., "3rd Grade")
  status,          -- "Draft" initially
  lessons,         -- 1 (single lesson unit)
  cover_image,     -- From generated.imageUrl
  image_url,       -- From generated.imageUrl
  audio_url,       -- From generated.audioUrl
  flow,            -- [] (empty lesson flow)
  scanned_assets   -- [] (empty scanned assets)
)
```

#### `srs_items` table
```sql
INSERT INTO srs_items (
  unit_id,     -- ID of newly created unit
  word,        -- From flashcard.question
  translation, -- From flashcard.answer
  interval,    -- 0
  repetition,  -- 0
  efactor      -- 2.5
)
-- One row per flashcard (typically 5)
```

## Error Handling Strategy

| Layer | Error Type | Handling |
|-------|-----------|----------|
| Edge Function | LLM API failure | Returns `{ success: false, error: message }` with 200 status |
| Edge Function | JSON parse failure | Uses safe fallback object with default flashcards |
| AIService | Network/invocation error | Throws descriptive error |
| AIService | Missing response properties | Applies safe defaults |
| UploadTextbook | Database insert failure | Shows user-friendly error message |
| UploadTextbook | Any pipeline failure | Catches all errors, displays toast notification |

## Key Design Principles

1. **Never crash the pipeline** - Every failure point has a fallback
2. **Secure AI processing** - No client-side API keys, all LLM calls go through Edge Function
3. **Resilient data contract** - Frontend handles missing/invalid properties gracefully
4. **Document-first generation** - When `documentContext` is provided, AI bases content on actual uploaded material
5. **Multimodal output** - Supports text, image, and audio generation in parallel
