Phase 1 Complete: Auth Pipeline Fixed

Phase 2 & 3 Complete: 404s Purged and Mock Data Eradicated. DataService, Store, and Apps are 100% data-driven.

Phase 6 Complete: The AI Professor MVP successfully integrated with mock AIService delay and direct Supabase insertion for units and srs_items.

### Universal AI Architecture (Phase 7)
The AI Professor feature now uses a universal architecture via Supabase Edge Functions (`generate-lesson`). This secures API keys and allows plugging in any OpenAI-compatible endpoint (OpenRouter, DeepSeek, Kimi, Qwen).

**Environment Variables Required in Supabase Project Settings:**
- `AI_BASE_URL` (e.g., https://openrouter.ai/api/v1)
- `AI_API_KEY` (Your secret key)
- `AI_MODEL_NAME` (e.g., mistralai/mistral-7b-instruct:free)

**Deployment Instructions:**
To deploy the Edge Function to your remote Supabase Project, run:
```bash
npx supabase functions deploy generate-lesson --no-verify-jwt
```
Then, add the environment variables via the Supabase Dashboard.

### Multi-Modal Omni-Router (Phase 8)
The `generate-lesson` Edge Function was upgraded to serve as an Omni-Router. It performs parallel generation tasks returning a unified multimodal payload:
- **Text Generation (OpenRouter/Mistral)**: Generates the core JSON object (title, description, visual_prompt, spoken_intro, flashcards).
- **Image Generation (Google Generative AI/Nano Banana 2)**: Reads the `visual_prompt` and triggers the Gemini model via the Google AI Studio endpoint if `GOOGLE_API_KEY` is configured.
- **Audio Voice Synthesis (ElevenLabs)**: Reads the `spoken_intro` and synthesizes voice generation via the ElevenLabs text-to-speech API if `ELEVENLABS_API_KEY` is configured.
These generations execute concurrently using `Promise.all` and are hydrated directly into the `units` table (`image_url`, `audio_url`).

---

## 🚨 CRITICAL AUDIT: Course Generation Pipeline Regression (March 2026)

### Problem Statement
The "Add New Unit" workflow in the Teacher app has regressed. When clicking the button:
- **Expected Flow**: Upload Material → AI Analyze → Generate Lesson Plan
- **Actual Flow**: Skips directly to the Lesson Plan Builder / Timeline Editor

### Audit Findings

#### 1. UI Flow Analysis
**Entry Point**: `apps/teacher/UnitList.tsx` (Line 81)
- "New Unit" button calls `onNewUnit` prop which navigates to `/teacher/timeline-builder` (LessonTimelineBuilder)
- This bypasses the file upload step entirely!

**Orphaned Component**: `apps/teacher/UploadTextbook.tsx`
- This component exists and is fully functional (file drag/drop, PDF conversion, AI analysis)
- **NOT CONNECTED** to the main routing in TeacherDashboard.tsx
- Contains complete implementation: PDF→Images→AI Analysis→Review→Publish

#### 2. Generate Lesson Modal
**Entry Point**: `apps/teacher/UnitList.tsx` (Line 75-79)
- "Generate Lesson" button opens `GenerateLessonModal`
- This only takes `topic` + `gradeLevel` as input
- Does NOT accept file uploads
- Calls `AIService.generateLessonContent(topic, gradeLevel)` which invokes Edge Function
- Edge Function only accepts `topic` and `gradeLevel` - **NO FILE SUPPORT**

#### 3. Upload & AI Architecture Gap
| Component | Status | Notes |
|-----------|--------|-------|
| `UploadTextbook.tsx` | ✅ Complete | Full PDF/Image upload, PDF.js conversion, AI analysis |
| `generate-lesson` Edge Function | ⚠️ Partial | Only accepts `topic` + `gradeLevel`, NO file handling |
| `AIService.ts` | ⚠️ Partial | Only has `generateLessonContent(topic, gradeLevel)` |
| Supabase Storage | ❌ Not configured | No bucket for uploaded PDFs |
| Text Extraction | ❌ Not connected | pdfjs-dist exists but results not used in pipeline |

### Root Cause
The "Upload Material" step was **intentionally or accidentally removed** from the routing. The `UploadTextbook.tsx` component is complete but disconnected.

---

## 📋 Integration Roadmap: Restore File Upload Pipeline

### Phase A: Connect Upload Screen to Routing (Quick Fix)
1. Add route for `/teacher/upload` in `TeacherDashboard.tsx`
2. Add navigation from "New Unit" to first show upload options
3. OR: Add a "From File" vs "From Scratch" choice in UnitList

### Phase B: Add Supabase Storage for File Persistence
1. Create Supabase Storage bucket `textbook-uploads` (or similar)
2. Update `UploadTextbook.tsx` to upload files to Supabase Storage
3. Store file URL in database alongside generated unit

### Phase C: Extend Edge Function for File Processing
1. Add new action type in `generate-lesson` Edge Function: `analyze-document`
2. Accept `fileUrl` (Supabase Storage URL) or base64 image data
3. Add text extraction logic: If PDF, use pdf.js in Edge Function (or pre-convert in frontend)
4. Pass extracted text to LLM for curriculum generation

### Phase D: Connect Frontend to Edge Function
1. Add `AIService.analyzeDocument(fileData)` method
2. Pass document to Edge Function with `action: 'analyze-document'`
3. Handle the manifest response and create unit

### Implementation Priority Order
1. **Highest**: Restore basic navigation - show Upload option when creating unit
2. **High**: Connect UploadTextbook results to Unit creation
3. **Medium**: Add Supabase Storage for file persistence
4. **Low**: Extend Edge Function for full document analysis

---

## Status: Awaiting Implementation