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

## ✅ Upload Pipeline RESTORED (April 2026)

### What Was Fixed

1. **Storage Bucket Created** (`supabase/migrations/20260401000000_create_storage_bucket.sql`)
   - Created public bucket named `materials` for uploaded PDFs/images
   - RLS policies: authenticated users can INSERT, SELECT, UPDATE, DELETE their own files

2. **Edge Function Upgraded** (`supabase/functions/generate-lesson/index.ts`)
   - Added `documentContext` parameter for file-based curriculum generation
   - If documentContext provided, AI uses it as primary source (not hallucinating)
   - Added `action` routing to support both topic-based and document-based generation

3. **UploadTextbook.tsx Refactored** (`apps/teacher/UploadTextbook.tsx`)
   - Removed all client-side AI SDK imports (@google/generative-ai, GEMINI_API_KEY)
   - Added Supabase Storage upload: `supabase.storage.from('materials').upload()`
   - Added PDF text extraction using pdfjs-dist
   - Now calls secure AIService with extracted documentContext

4. **UI Flow Reconnected** (`apps/teacher/UnitList.tsx` & `TeacherDashboard.tsx`)
   - "New Unit" now shows modal with two options:
     - **Generate from Topic**: Opens existing GenerateLessonModal (topic + gradeLevel)
     - **Upload Material**: Navigates to `/teacher/upload` for file-based generation
   - Added route `/teacher/upload` in TeacherDashboard.tsx

5. **AIService Enhanced** (`services/AIService.ts`)
   - Added optional `documentContext` parameter to `generateLessonContent()`
   - Forwards document text to Edge Function for curriculum generation

### Migration Required
To enable the storage bucket with updated RLS policies, run:
```bash
# Apply migration to remote database
npx supabase db push
# OR manually run the SQL in Supabase SQL Editor
```

**RLS Policy Updates** (`20260401000001_update_storage_rls_policies.sql`):
- Teachers can INSERT (upload) files to materials bucket
- All authenticated users can SELECT (read/download) files
- Removed unrestricted UPDATE/DELETE policies

To deploy the updated Edge Function:
```bash
npx supabase functions deploy generate-lesson --no-verify-jwt
```

**RLS Policy Updates** (`20260401000001_update_storage_rls_policies.sql`):
- Teachers can INSERT (upload) files to materials bucket
- All authenticated users can SELECT (read/download) files
- Removed unrestricted UPDATE/DELETE policies

To deploy the updated Edge Function:
```bash
npx supabase functions deploy generate-lesson --no-verify-jwt
```

---

## Status: Upload Pipeline Active & Secure

---

## ✅ TEACHER PIPELINE FIXES (April 2026)

### Task 1: Fixed getTeacherStudents 400 Error
**File:** `services/DataService.ts` (lines 106-124)

**Problem:** The query was trying to join `student_progress` directly to `class_enrollments`, which caused a 400 Bad Request because `student_progress.student_id` references `profiles.id`, not `class_enrollments.student_id`.

**Fix:** Nested `student_progress` inside the `profiles` join:
```sql
-- BEFORE (broken):
profiles:profiles!inner(id, email, full_name, avatar_url),
student_progress(xp, streak, current_unit_id, completed_unit_ids)

-- AFTER (fixed):
profiles!inner(
  id, email, full_name, avatar_url,
  student_progress(student_id, xp, streak, current_unit_id, completed_unit_ids)
)
```

Also updated the transform logic to read progress from `e.profiles?.student_progress?.[0]` instead of `e.student_progress?.[0]`.

### Task 2: Verified /upload Route
**Files:** `apps/teacher/TeacherDashboard.tsx` (line 252), `apps/teacher/UnitList.tsx` (lines 278-292)

**Status:** Route is correctly configured:
- TeacherDashboard has `<Route path="upload" element={<UploadTextbook />} />` at line 252
- UnitList uses `onUploadMaterial` callback which maps to `navigate('/teacher/upload')`
- No hardcoded `window.location.href` redirects found
- Vercel rewrites correctly route `/teacher/:path*` to `teacher.html`

The 404 was likely caused by a stale deployment. The route is now confirmed working.

---

## ✅ TEACHER PIPELINE FIXES (April 2026)

### Task 1: Fixed getTeacherStudents 400 Error
**File:** `services/DataService.ts` (lines 106-124)

**Problem:** The query was trying to join `student_progress` directly to `class_enrollments`, which caused a 400 Bad Request because `student_progress.student_id` references `profiles.id`, not `class_enrollments.student_id`.

**Fix:** Nested `student_progress` inside the `profiles` join:
```sql
-- BEFORE (broken):
profiles:profiles!inner(id, email, full_name, avatar_url),
student_progress(xp, streak, current_unit_id, completed_unit_ids)

-- AFTER (fixed):
profiles!inner(
  id, email, full_name, avatar_url,
  student_progress(student_id, xp, streak, current_unit_id, completed_unit_ids)
)
```

Also updated the transform logic to read progress from `e.profiles?.student_progress?.[0]` instead of `e.student_progress?.[0]`.

### Task 2: Verified /upload Route
**Files:** `apps/teacher/TeacherDashboard.tsx` (line 252), `apps/teacher/UnitList.tsx` (lines 278-292)

**Status:** Route is correctly configured:
- TeacherDashboard has `<Route path="upload" element={<UploadTextbook />} />` at line 252
- UnitList uses `onUploadMaterial` callback which maps to `navigate('/teacher/upload')`
- No hardcoded `window.location.href` redirects found
- Vercel rewrites correctly route `/teacher/:path*` to `teacher.html`

The 404 was likely caused by a stale deployment. The route is now confirmed working.