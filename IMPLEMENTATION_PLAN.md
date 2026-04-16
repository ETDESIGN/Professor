# Implementation Plan — Professor (Lesson Orchestrator)

**Date:** 2026-04-16  
**Based On:** SYSTEM_REVIEW_REPORT.md  
**Goal:** Move the platform from ~45% MVP completion to production-ready v1.0  

---

## Guiding Principles

1. **Fix before feature** — Resolve all critical bugs before building new features
2. **Pipeline consolidation** — Eliminate dead code and parallel pipelines before extending
3. **Media pipeline is the bottleneck** — The entire platform depends on generated assets
4. **Test as you build** — Every phase includes testing requirements
5. **Incremental delivery** — Each phase produces a deployable increment

---

## Phase 0: Critical Bug Fixes

**Duration:** 1-2 days  
**Priority:** IMMEDIATE  
**Goal:** Stop the bleeding. Fix all bugs that cause crashes or incorrect data rendering.

### 0.1 Fix BoardFocusCards Hardcoded Sentence
- **File:** `apps/board/templates/BoardFocusCards.tsx:101`
- **Action:** Replace `"The <span>...{activeCard.back.toLowerCase()}...</span> lives in the jungle."` with `{activeCard.context_sentence || activeCard.definition || ""}`
- **Test:** Load any unit with FOCUS_CARDS step. Verify card back shows contextual sentence, not "jungle".

### 0.2 Fix Card Front Emoji
- **File:** `supabase/functions/orchestrate-lesson/index.ts` — `transformManifestToFlow()`
- **Action:** Change `front: "📸"` to `front: v.word` (display the word itself on card front)
- **Test:** Orchestrate a lesson. Verify cards show the vocabulary word, not a camera emoji.

### 0.3 Fix Dicebear Empty Seed Guard
- **File:** `supabase/functions/orchestrate-lesson/index.ts` — image URL generation
- **Action:** Change all occurrences of `encodeURIComponent(v.word)` to `encodeURIComponent(v.word || 'vocab')`
- **Test:** Create a lesson with a vocabulary item that has an empty word field. Verify no 400 error.

### 0.4 Remap GAME_ARENA to BoardSpeedQuiz
- **File:** `apps/board/ClassroomBoard.tsx`
- **Action:** Change `{currentStep.type === 'GAME_ARENA' && <BoardGameArena data={currentStep.data} />}` to `{currentStep.type === 'GAME_ARENA' && <BoardSpeedQuiz data={currentStep.data} />}`
- **Test:** Navigate to a lesson with GAME_ARENA step. Verify quiz renders with questions, not a student wheel.

### 0.5 Add Empty Students Guard in BoardGameArena
- **File:** `apps/board/templates/BoardGameArena.tsx`
- **Action:** Add early return at top of component: `if (students.length === 0) return <div>No students loaded</div>`
- **Test:** Open BoardGameArena without students. Verify no crash.

### 0.6 Remove BoardMediaPlayer Jungle Fallbacks
- **File:** `apps/board/templates/BoardMediaPlayer.tsx`
- **Action:** Replace hardcoded "Walking in the Jungle" defaults with neutral values:
  - `lyrics` fallback → `[]`
  - `videoUrl` fallback → `null` (render "No video available" state)
  - `title` fallback → `"Media Player"`
- **Test:** Load MediaPlayer with empty data. Verify neutral display, no jungle references.

### 0.7 Add Toast for Null Draft Unit ID
- **File:** `apps/teacher/UploadTextbook.tsx` — `handleApprove`
- **Action:** Replace `if (!draftUnitId) return;` with `if (!draftUnitId) { toast.error('No draft unit found. Upload a page first.'); return; }`
- **Test:** Click "Approve & Generate Assets" without uploading. Verify toast appears.

### 0.8 Clear Zustand Mock Data
- **File:** `store/useAppStore.ts`
- **Action:** Remove `MOCK_UNITS` and `MOCK_LESSON_FLOW`. Initialize `units: []`. Add `version: 2` to persist config to force cache invalidation.
- **Test:** Clear localStorage. Reload app. Verify empty units list, no Jungle Safari.

### Phase 0 Exit Criteria
- [ ] No "lives in the jungle" anywhere in the rendered UI
- [ ] No crashes when students array is empty
- [ ] No Dicebear 400 errors
- [ ] GAME_ARENA renders quiz questions, not a student wheel
- [ ] Card fronts show vocabulary words
- [ ] "Approve" button gives feedback on failure
- [ ] Fresh load shows empty units, not mock data

---

## Phase 1: Pipeline Consolidation & Dead Code Removal

**Duration:** 1 day  
**Priority:** HIGH  
**Goal:** Eliminate architectural confusion. Single source of truth for content creation.

### 1.1 Delete Dead Pipeline B Files
- Delete `apps/teacher/GenerateLessonModal.tsx` (orphaned Pipeline B entry point)
- Delete `apps/teacher/ReviewContent.tsx` (orphaned, connected to dead geminiService)
- Remove any imports of these files from `TeacherDashboard.tsx`

### 1.2 Deprecate geminiService.ts
- Move `LessonManifest` and `ActivityBlock` types from `services/geminiService.ts` into `types/pipeline.ts`
- Update all imports across the codebase
- Delete `services/geminiService.ts`
- Create a compatibility re-export in `types/pipeline.ts` if needed

### 1.3 Deprecate LessonTransformer.ts (Client-Side)
- Verify that `LessonTransformer.ts` is not called anywhere in the active Pipeline A path
- The server-side `transformManifestToFlow()` in `orchestrate-lesson/index.ts` has replaced it
- Keep as reference but mark as `@deprecated`

### 1.4 Fix handleApprove to Pass ALL Scanned Assets
- **File:** `apps/teacher/UploadTextbook.tsx`
- **Action:** Change `handleApprove` to aggregate all scanned pages:
  ```typescript
  const allAssets = Object.values(scans)
    .filter(s => s.status === 'success')
    .map(s => s.data);
  await AIService.orchestrateLesson(draftUnitId, allAssets);
  ```
- **Test:** Upload 2+ pages. Approve. Verify all pages' data appears in the generated lesson.

### 1.5 Reconcile Auth Trigger Migrations
- Create a new migration that drops and recreates `handle_new_user()` as the single source of truth:
  ```sql
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'role', 'student')::public.user_role
    );
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Profile creation failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
  ```

### 1.6 Clean Up MockEngine References
- Audit all imports of `MockEngine` in production code
- Ensure `SupabaseService.ts` (Engine pattern) is the only consumer
- No component should directly import from `MockEngine.ts`

### Phase 1 Exit Criteria
- [ ] Pipeline B files deleted
- [ ] geminiService.ts removed, types moved to types/pipeline.ts
- [ ] Single content creation pipeline: UploadTextbook → extract-page → orchestrate-lesson
- [ ] handleApprove passes all scanned pages
- [ ] Single auth trigger migration
- [ ] No direct MockEngine imports outside SupabaseService.ts

---

## Phase 2: Theme Context & Content Quality

**Duration:** 2-3 days  
**Priority:** HIGH  
**Goal:** Every unit tells a coherent story. Vocabulary sentences match the unit theme.

### 2.1 Define Theme Context Schema
- **File:** `types/pipeline.ts`
- Add to `LessonManifest`:
  ```typescript
  interface ThemeContext {
    setting: string;
    characters: Array<{ name: string; role: string; emoji: string }>;
    world_description: string;
  }
  ```

### 2.2 Update orchestrate-lesson System Prompt
- **File:** `supabase/functions/orchestrate-lesson/index.ts`
- Require the LLM to generate:
  - `meta.theme_context` with setting, characters, world description
  - `context_sentence` for every vocabulary item (bound to the world, not generic)
  - `world_examples` for every grammar rule (using characters and setting)
- Provide few-shot examples of good theme-bound content

### 2.3 Update transformManifestToFlow to Use Theme Context
- **File:** `supabase/functions/orchestrate-lesson/index.ts` — `transformManifestToFlow()`
- Pass `context_sentence` through to FOCUS_CARDS card data
- Pass `world_examples` through to GRAMMAR_SANDBOX data
- Generate STORY_STAGE pages using the characters and setting

### 2.4 Update BoardFocusCards to Use context_sentence
- **File:** `apps/board/templates/BoardFocusCards.tsx`
- Replace hardcoded sentence with `{activeCard.context_sentence || activeCard.definition || ""}`
- Add visual treatment for the theme-bound sentence (highlight the word within the sentence)

### 2.5 Update BoardGrammarSandbox to Use world_examples
- **File:** `apps/board/templates/BoardGrammarSandbox.tsx`
- Render `data.examples` which now contains theme-bound examples
- Show character names and setting context

### 2.6 Update BoardStoryStage to Use Theme Characters
- **File:** `apps/board/templates/BoardStoryStage.tsx`
- Render story pages using the theme context characters
- Display character dialogue with proper attribution

### Phase 2 Exit Criteria
- [ ] Every vocabulary item has a `context_sentence` bound to the unit theme
- [ ] Grammar rules have `world_examples` using unit characters
- [ ] Story stages reference theme characters and setting
- [ ] No generic or jungle-themed fallback content
- [ ] Focus cards display contextual sentences on the back

---

## Phase 3: Media Generation Pipeline

**Duration:** 3-5 days  
**Priority:** CRITICAL  
**Goal:** Generate and persist images and audio for every vocabulary item.

### 3.1 Create Storage Bucket for Generated Media
- New migration: `202604XX000000_create_generated_media_bucket.sql`
- Create `generated-media` Storage bucket
- Configure RLS policies (public read, service_role write)

### 3.2 Create `assets` DB Table
- Track generated media:
  ```sql
  CREATE TABLE public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID REFERENCES public.units(id),
    type TEXT NOT NULL CHECK (type IN ('image', 'audio', 'video')),
    prompt TEXT,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

### 3.3 Create `generate-media` Edge Function
- **File:** `supabase/functions/generate-media/index.ts`
- **Inputs:** `{ type: 'image' | 'audio', prompt: string, unitId: string, vocabWord: string }`
- **Image flow:** Send prompt to DALL-E 3 / Stable Diffusion API → receive image → upload to Storage → return public URL
- **Audio flow:** Send text to ElevenLabs → receive MP3 → upload to Storage → return public URL
- **Deduplication:** Check `assets` table before generating. Return cached URL if exists.

### 3.4 Wire Media Generation into Orchestration
- **File:** `supabase/functions/orchestrate-lesson/index.ts`
- After `transformManifestToFlow()`, iterate through vocabulary items
- For each vocab item, call `generate-media` (image + audio) in parallel
- Replace Dicebear URLs with real generated image URLs
- Add audio URLs to card data

### 3.5 Create Client-Side MediaService
- **File:** `services/MediaService.ts`
- Functions: `getVocabImage(word, unitId)`, `getVocabAudio(word, unitId)`, `preloadUnitAssets(unitId)`
- Client-side caching with localStorage/IndexedDB for generated assets

### 3.6 Update Board Components to Use Real Assets
- `BoardFocusCards.tsx` — Use real image URL on card front (replace emoji)
- `BoardMediaPlayer.tsx` — Use real audio URL for playback
- `BoardStoryStage.tsx` — Use real character images

### Phase 3 Exit Criteria
- [ ] Every vocabulary item has a generated image (not Dicebear)
- [ ] Every vocabulary item has generated pronunciation audio
- [ ] Assets are persisted in Supabase Storage with public URLs
- [ ] Assets are deduplicated (same word doesn't regenerate)
- [ ] Board components render real images, not emoji placeholders

---

## Phase 4: Testing Infrastructure

**Duration:** 2-3 days  
**Priority:** HIGH  
**Goal:** Prevent regressions. Enable confident refactoring.

### 4.1 Configure Vitest
- Install: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- Add `vitest.config.ts` extending Vite config
- Add `"test": "vitest"` to package.json scripts

### 4.2 Write Auth Flow Tests
- Test: signup creates profile in DB
- Test: login returns correct role
- Test: self-healing profile on login
- Test: role-based access control
- Test: session persistence and hydration

### 4.3 Write Data Service Tests
- Test: CRUD for classes, students, assignments, messages
- Test: class analytics calculations (deterministic from real data)
- Test: error handling and fallbacks

### 4.4 Write AI Pipeline Tests
- Test: `extract-page` response parsing
- Test: `orchestrate-lesson` manifest generation
- Test: `transformManifestToFlow()` output structure
- Test: JSON sanitization (markdown wrapping, malformed JSON)

### 4.5 Write Component Tests
- Test: `ClassroomBoard` renders correct template for each slide type
- Test: `BoardFocusCards` card flip and navigation
- Test: `BoardSpeedQuiz` question rendering
- Test: `SessionContext` state machine (slide navigation, point awards)

### 4.6 Configure Playwright E2E
- Install: `@playwright/test`
- Write critical path tests:
  - Teacher: upload page → scan → approve → start live class
  - Student: login → join class → practice
  - Parent: login → view reports

### 4.7 Set Up CI/CD Pipeline
- GitHub Actions workflow:
  - `tsc --noEmit` (typecheck)
  - `vitest run` (unit tests)
  - `vite build` (build verification)
  - Playwright (E2E, on merge to master)

### Phase 4 Exit Criteria
- [ ] `vitest run` passes with 50+ tests
- [ ] Critical auth, data, and AI pipeline paths tested
- [ ] Playwright covers 3+ E2E scenarios
- [ ] CI/CD pipeline blocks merges on test failures

---

## Phase 5: Student Solo Mode

**Duration:** 3-5 days  
**Priority:** HIGH  
**Goal:** Students can learn independently, not just via live classroom.

### 5.1 Create SoloSessionContext
- **File:** `store/SoloSessionContext.tsx`
- Similar to `SessionContext` but for solo play
- Manages: current unit, current step, score, answers, timer
- No real-time broadcasting (no Socket.IO)
- Persists progress to `student_progress` table

### 5.2 Create Solo Lesson Player
- Reuse board template components for solo play
- Add answer submission UI for quiz steps
- Add score tracking and XP awarding
- Add lesson completion screen with results

### 5.3 Wire Spaced Repetition Properly
- Fetch SRS items for the current student
- Implement SuperMemo-2 algorithm client-side
- Show review cards with flip animation
- Update SRS item after each review
- Track daily review streak

### 5.4 Activate HomeMap
- Fetch available units from DB
- Display unit progression (locked/active/completed)
- Navigate to solo lesson or practice mode
- Show XP and streak prominently

### 5.5 Persist Avatar State
- Save avatar choices to `profiles.avatar_url`
- Load avatar in student app header
- Use Dicebear API for dynamic avatar generation based on customization

### Phase 5 Exit Criteria
- [ ] Student can play through a unit independently
- [ ] Spaced repetition works with real SRS data
- [ ] Progress persists across sessions
- [ ] HomeMap shows real units with progression state
- [ ] Avatar customization persists

---

## Phase 6: Observability & Production Hardening

**Duration:** 2-3 days  
**Priority:** MEDIUM  
**Goal:** Production-ready monitoring and error handling.

### 6.1 Integrate Sentry
- Frontend: `@sentry/react` with source maps
- Edge Functions: Sentry Deno SDK
- Capture: unhandled errors, API failures, auth errors

### 6.2 Add Structured Logging
- Consistent log format: `{ timestamp, level, service, action, userId, metadata }`
- Log levels: DEBUG, INFO, WARN, ERROR
- Edge Functions: Replace `console.error` with structured logger

### 6.3 Add Health Checks
- Edge Function: `/health` endpoint returning `{ status: 'ok', version: '0.1' }`
- Vercel: Configure health check monitoring
- Supabase: Connection pool health check

### 6.4 Add Rate Limiting
- Edge Functions: Rate limit by user ID (100 requests/minute)
- Use Supabase `pg_cron` or Redis for rate limit tracking
- Return 429 with retry-after header

### 6.5 Edge Function Auth Middleware
- Validate Supabase JWT on every request
- Reject unauthenticated requests with 401
- Extract user ID and role for downstream use

### 6.6 Edge Function Shared Utilities
- Extract: `cors.ts`, `aiClient.ts`, `jsonSanitize.ts`, `authMiddleware.ts`
- Reduce code duplication across 3 functions

### Phase 6 Exit Criteria
- [ ] Sentry captures all unhandled errors
- [ ] All logs follow structured format
- [ ] Health checks return 200 OK
- [ ] Rate limiting prevents abuse
- [ ] All Edge Function endpoints require valid JWT

---

## Phase 7: Speech & Pronunciation

**Duration:** 5-7 days  
**Priority:** MEDIUM  
**Goal:** Enable pronunciation coaching and dubbing features.

### 7.1 Pronunciation Coaching via Web Speech API
- Use browser-native `SpeechRecognition` API
- Compare spoken text against target word
- Score based on phoneme similarity
- No backend needed for basic functionality

### 7.2 Pronunciation Coaching via Whisper (Advanced)
- Create `evaluate-pronunciation` Edge Function
- Accept audio base64 + target text
- Use OpenAI Whisper for transcription
- Compare transcription against target
- Return score + specific phoneme feedback

### 7.3 Text Differentiation (LLM-based)
- Update `differentiateText` in `geminiService.ts` (or create new service)
- Send text to LLM with prompt: "Simplify this text for 3 reading levels"
- Cache results in DB for reuse

### 7.4 Dubbing Studio Activation
- Use Web Speech API for recording
- Compare student audio against reference
- Score on emotion match, timing, pronunciation
- Save recordings to Supabase Storage

### Phase 7 Exit Criteria
- [ ] Pronunciation coach gives real-time feedback
- [ ] Text differentiation produces 3 reading levels
- [ ] Dubbing studio records and evaluates audio
- [ ] All speech features work on Chrome and Safari

---

## Phase 8: Admin Dashboard & Scale

**Duration:** 5-7 days  
**Priority:** LOW  
**Goal:** District-level analytics and multi-tenant support.

### 8.1 Admin Analytics API
- Aggregate metrics across all classes
- School-level, district-level rollups
- Export to CSV/PDF

### 8.2 User Management
- Admin CRUD for teachers, students, parents
- Bulk import via CSV
- Password reset assistance

### 8.3 Content Moderation
- Review queue for AI-generated content
- Flag inappropriate content
- Teacher content rating system

### 8.4 Multi-Tenant Support
- Row-level tenant isolation
- Tenant-specific branding
- Per-tenant AI configuration

---

## Timeline Summary

| Phase | Duration | Priority | Dependencies |
|---|---|---|---|
| Phase 0: Critical Bug Fixes | 1-2 days | IMMEDIATE | None |
| Phase 1: Pipeline Consolidation | 1 day | HIGH | Phase 0 |
| Phase 2: Theme Context | 2-3 days | HIGH | Phase 1 |
| Phase 3: Media Generation | 3-5 days | CRITICAL | Phase 2 |
| Phase 4: Testing | 2-3 days | HIGH | Phase 0 |
| Phase 5: Student Solo Mode | 3-5 days | HIGH | Phase 3 |
| Phase 6: Observability | 2-3 days | MEDIUM | Phase 4 |
| Phase 7: Speech & Pronunciation | 5-7 days | MEDIUM | Phase 3 |
| Phase 8: Admin & Scale | 5-7 days | LOW | Phase 6 |

### Recommended Execution Order

```
Week 1: Phase 0 (bugs) → Phase 1 (consolidation) → Phase 4 starts (testing infra)
Week 2: Phase 2 (theme context) → Phase 3 starts (media pipeline)
Week 3: Phase 3 completes → Phase 4 completes → Phase 5 starts (student solo)
Week 4: Phase 5 completes → Phase 6 (observability)
Week 5-6: Phase 7 (speech features)
Week 7-8: Phase 8 (admin dashboard)
```

### Total Estimated Timeline: 6-8 weeks to production v1.0

---

*End of Implementation Plan. See TASK_LIST.md for granular task breakdown.*
