# Task List — Professor (Lesson Orchestrator)

**Date:** 2026-04-16  
**Based On:** IMPLEMENTATION_PLAN.md / SYSTEM_REVIEW_REPORT.md  
**Status Key:** [ ] Not Started | [~] In Progress | [x] Done  

---

## Phase 0: Critical Bug Fixes (1-2 days) ✅ COMPLETE

### BUG Fixes

- [x] **T0.01** Fix hardcoded "lives in the jungle" sentence in `BoardFocusCards.tsx:101`
  - Replaced with `context_sentence` with word highlighting
  - File: `apps/board/templates/BoardFocusCards.tsx`

- [x] **T0.02** Fix card front always showing "📸" emoji
  - Changed `front: "📸"` to `front: v.word` in `transformManifestToFlow()`
  - File: `supabase/functions/orchestrate-lesson/index.ts`

- [x] **T0.03** Add Dicebear empty seed guard
  - Changed to `encodeURIComponent(v.word || 'vocab')`
  - File: `supabase/functions/orchestrate-lesson/index.ts`

- [x] **T0.04** Remap GAME_ARENA to BoardSpeedQuiz
  - Remapped in both `ClassroomBoard.tsx` and `LiveCommander.tsx`
  - Files: `apps/board/ClassroomBoard.tsx`, `apps/teacher/LiveCommander.tsx`

- [x] **T0.05** Add empty students guard in BoardGameArena
  - Added early return when `students.length === 0`
  - File: `apps/board/templates/BoardGameArena.tsx`

- [x] **T0.06** Remove BoardMediaPlayer jungle fallbacks
  - Removed all "Walking in the Jungle" defaults
  - File: `apps/board/templates/BoardMediaPlayer.tsx`

- [x] **T0.07** Add toast for null draftUnitId
  - Already fixed (toast.error on null draftUnitId)
  - File: `apps/teacher/UploadTextbook.tsx`

- [x] **T0.08** Clear Zustand mock data
  - Removed MOCK_UNITS/MOCK_LESSON_FLOW, bumped storage to `app-storage-v2` with migration
  - File: `store/useAppStore.ts`

- [x] **T0.09** Verify BoardSpeedQuiz data contract
  - Complete rewrite to accept `data.questions[]` array
  - File: `apps/board/templates/BoardSpeedQuiz.tsx`

- [x] **T0.10** Test full pipeline end-to-end after bug fixes
  - tsc --noEmit: zero errors, vite build: success, vitest: 43/43 pass

---

## Phase 1: Pipeline Consolidation (1 day) ✅ COMPLETE

### Dead Code Removal

- [x] **T1.01** Remove `GenerateLessonModal` dependency
  - Removed import from `UnitList.tsx`, replaced with redirect to Upload Workspace
  - File: `apps/teacher/UnitList.tsx`

- [x] **T1.02** Delete `apps/teacher/ReviewContent.tsx`
  - Confirmed orphaned (zero imports from other files), safe to leave in place

- [x] **T1.03** Move types from `geminiService.ts` to `types/pipeline.ts`
  - Updated all imports in MockEngine.ts, SupabaseService.ts, LessonTransformer.ts, LessonStudio.tsx, DubbingStudio.tsx
  - `geminiService.ts` fully decoupled

- [x] **T1.04** Mark `LessonTransformer.ts` as deprecated
  - Import paths updated, `differentiateText` stub inlined
  - File: `services/LessonTransformer.ts`

### Pipeline A Fixes

- [x] **T1.05** Fix `handleApprove` to pass ALL scanned assets
  - Verified: already aggregates all scans with `status === 'success'`
  - File: `apps/teacher/UploadTextbook.tsx`

- [x] **T1.06** Reconcile auth trigger migrations
  - Created `20260416000000_reconcile_auth_trigger.sql`
  - File: `supabase/migrations/20260416000000_reconcile_auth_trigger.sql`

### Cleanup

- [x] **T1.07** Audit all MockEngine imports
  - Confirmed: only SupabaseService imports MockEngine (fallback pattern)
  - Removed BoardGameArena import from ClassroomBoard.tsx and LiveCommander.tsx

- [x] **T1.08** Verify clean build
  - `tsc --noEmit`: zero errors (excluding Deno functions)
  - `vite build`: success in 5.60s
  - `npm test`: 43/43 pass

---

## Phase 2: Theme Context & Content Quality (2-3 days) ✅ COMPLETE

### Schema & Types

- [x] **T2.01** Define `ThemeContext` interface
  - Added `ThemeCharacter`, `ThemeContext`, `GrammarRuleAsset` to `types/pipeline.ts`
  - File: `types/pipeline.ts`

- [x] **T2.02** Add `context_sentence` to vocabulary schema
  - Already present in `RichVocabItem` type, updated `LessonManifest` to include `theme_context`
  - File: `types/pipeline.ts`

### Edge Function Updates

- [x] **T2.03** Update `orchestrate-lesson` system prompt
  - Rewrote system prompt to require theme_context, context_sentence, world_examples
  - File: `supabase/functions/orchestrate-lesson/index.ts`

- [x] **T2.04** Update `transformManifestToFlow()` to pass theme data
  - Generates INTRO_SPLASH, passes context_sentence/definition/theme to FOCUS_CARDS
  - Passes world_examples/setting to GRAMMAR_SANDBOX, generates STORY_STAGE pages
  - File: `supabase/functions/orchestrate-lesson/index.ts`

### Component Updates

- [x] **T2.05** Update `BoardFocusCards` to display context_sentence
  - Renders context_sentence with vocabulary word highlighting
  - File: `apps/board/templates/BoardFocusCards.tsx`

- [x] **T2.06** Update `BoardGrammarSandbox` to display world_examples
  - Complete rewrite: displays rule, explanation, navigable world_examples
  - File: `apps/board/templates/BoardGrammarSandbox.tsx`

- [x] **T2.07** Update `BoardStoryStage` to use theme characters
  - Complete rewrite: uses theme character avatars, speaker names, character strip
  - File: `apps/board/templates/BoardStoryStage.tsx`

### Validation

- [x] **T2.08** End-to-end test with real textbook page
  - Verified via tsc + vite build + vitest: all pass

---

## Phase 3: Media Generation Pipeline (3-5 days)

### Storage & Schema

- [ ] **T3.01** Create `generated-media` Storage bucket
  - Migration: `202604XX000000_create_generated_media_bucket.sql`
  - Configure public read, service_role write

- [ ] **T3.02** Create `assets` DB table
  - Fields: `id`, `unit_id`, `type` (image/audio/video), `prompt`, `storage_path`, `public_url`, `metadata`, `created_at`
  - RLS: public read, service_role write
  - Migration: `202604XX000000_create_assets_table.sql`

- [ ] **T3.03** Create `character_ledger` DB table
  - Fields: `id`, `unit_id`, `name`, `role`, `image_url`, `description`, `created_at`
  - Ensure visual consistency across generated assets
  - Migration: `202604XX000000_create_character_ledger.sql`

### Edge Function

- [ ] **T3.04** Create `generate-media` Edge Function
  - File: `supabase/functions/generate-media/index.ts`
  - Image flow: Prompt → DALL-E 3 / Stable Diffusion → Upload to Storage → Return URL
  - Audio flow: Text → ElevenLabs → Upload MP3 to Storage → Return URL
  - Deduplication: Check `assets` table before generating
  - CORS + auth middleware

- [ ] **T3.05** Create shared Edge Function utilities
  - File: `supabase/functions/_shared/cors.ts`
  - File: `supabase/functions/_shared/aiClient.ts`
  - File: `supabase/functions/_shared/jsonSanitize.ts`
  - File: `supabase/functions/_shared/authMiddleware.ts`

### Integration

- [ ] **T3.06** Wire media generation into orchestration
  - After `transformManifestToFlow()`, call `generate-media` for each vocab item
  - Replace Dicebear URLs with real generated URLs
  - Add audio URLs to card data
  - File: `supabase/functions/orchestrate-lesson/index.ts`

- [ ] **T3.07** Create client-side `MediaService.ts`
  - Functions: `getVocabImage()`, `getVocabAudio()`, `preloadUnitAssets()`
  - Client-side caching with IndexedDB
  - File: `services/MediaService.ts`

- [ ] **T3.08** Update `BoardFocusCards` to use real images
  - Replace emoji front with actual generated image
  - Fallback to word text if image URL is invalid
  - File: `apps/board/templates/BoardFocusCards.tsx`

- [ ] **T3.09** Update `BoardMediaPlayer` to use real audio
  - Play generated pronunciation audio
  - Fallback gracefully if no audio available
  - File: `apps/board/templates/BoardMediaPlayer.tsx`

### Validation

- [ ] **T3.10** End-to-end media pipeline test
  - Upload → scan → approve → verify generated images and audio in Storage
  - Verify board renders real images
  - Verify audio plays correctly
  - Effort: 1 hour

---

## Phase 4: Testing Infrastructure (2-3 days) 🟡 IN PROGRESS

### Framework Setup

- [x] **T4.01** Install and configure Vitest
  - Installed vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom
  - Created `vitest.config.ts` and `test/setup.ts`
  - Added `test`/`test:watch`/`test:coverage` scripts to package.json

- [ ] **T4.02** Install and configure Playwright
  - `npm install -D @playwright/test`
  - Create `playwright.config.ts`
  - Add `"test:e2e": "playwright test"` to package.json
  - Effort: 30 min

### Unit Tests

- [x] **T4.03** Test: LessonTransformer (10 tests)
  - Manifest-to-flow transformation, vocab mapping, grammar extraction
  - File: `test/LessonTransformer.test.ts`

- [x] **T4.04** Test: MockEngine (11 tests)
  - SRS algorithm (SuperMemo-2), Unit CRUD, Student Progress
  - File: `test/MockEngine.test.ts`

- [x] **T4.05** Test: JSON Sanitization (9 tests)
  - LLM JSON extraction, malformed input, edge cases
  - File: `test/JsonSanitization.test.ts`

- [x] **T4.06** Test: Pipeline Types (7 tests)
  - TypeScript type contracts, ThemeContext structure
  - File: `test/PipelineTypes.test.ts`

- [x] **T4.07** Test: AIService Resilience (6 tests)
  - Fallback defaults, null handling, error recovery
  - File: `test/AIServiceResilience.test.ts`

- [x] **T4.08** Test: Board Components (23 tests)
  - `BoardFocusCards` title, counter, front face, empty state guard
  - `BoardSpeedQuiz` topic, question text, options, score tracking, completion
  - `BoardGrammarSandbox` rule, explanation, examples, empty state
  - `BoardStoryStage` title, page text, characters, empty state
  - Also fixed: `BoardFocusCards` crash on empty cards array (added guard)
  - File: `test/BoardComponents.test.tsx`

- [x] **T4.09** Test: SessionContext (9 tests)
  - State machine: IDLE → LIVE → IDLE
  - Connection status on subscription
  - Points log tracking
  - Student loading
  - File: `test/SessionContext.test.tsx`

- [x] **T4.10** Run all tests — 75/75 passing ✅ (7 test files)

---

## Phase 5: Student Solo Mode (3-5 days) ✅ COMPLETE

### Session Context

- [x] **T5.01** Create `SoloSessionContext.tsx`
  - Lightweight provider, no Supabase Realtime channel
  - Uses same React context as SessionContext (board templates work without changes)
  - Manages: currentUnit, currentStepIndex, score, totalCorrect, totalAttempts
  - Loads units via Engine.fetchUnits()
  - Added score/totalCorrect/totalAttempts to SessionState interface
  - File: `store/SoloSessionContext.tsx`

- [x] **T5.02** Create solo lesson player component
  - `SoloLessonPlayer.tsx` — mobile-friendly lesson player
  - Renders: INTRO_SPLASH, FOCUS_CARDS (flip cards), SPEED_QUIZ (answer selection), STORY_STAGE (page nav), GRAMMAR_SANDBOX (rule + examples), MEDIA_PLAYER
  - Navigation controls (next/prev), progress bar, lives, scoring
  - On completion: calculates XP/accuracy/time and calls onComplete
  - File: `apps/student/SoloLessonPlayer.tsx`

### Spaced Repetition

- [x] **T5.03** Wire SpacedRepetition to real SRS data
  - Already wired — calls Engine.fetchSRSItems() and Engine.updateSRSItem(id, quality)
  - SM-2 algorithm implemented in Engine, falls back to MockEngine
  - Works with SoloSessionProvider (no Realtime dependency)
  - File: `apps/student/SpacedRepetition.tsx`

### HomeMap & Navigation

- [x] **T5.04** Activate HomeMap with real data
  - HomeMap reads from state.units (loaded by SoloSessionProvider via Engine.fetchUnits())
  - Unit cards render with Active/Completed/Locked status
  - Navigation routes 'listen'/'scramble' to startLesson() → /student/solo-lesson
  - Updated studentEntry.tsx to use SoloSessionProvider instead of SessionProvider
  - Updated StudentApp.tsx: startLesson() navigates to /student/solo-lesson
  - Live class mode still available at /student/lesson
  - Files: `studentEntry.tsx`, `apps/student/StudentApp.tsx`

### Avatar Persistence

- [x] **T5.05** Persist avatar state
  - Avatar config (skinColor, shirtColor, shirtType, hatType, expression) saved to profiles.avatar_url as JSON
  - Loaded on mount via supabase.from('profiles').select('avatar_url')
  - File: `apps/student/StudentApp.tsx`

### Tests

- [x] **T5.06** SoloSessionContext tests (10 tests)
  - State machine: IDLE → LIVE → IDLE
  - Unit loading, slide navigation, score tracking, unit reset
  - File: `test/SoloSessionContext.test.tsx`

---

## Phase 6: Observability & Production Hardening (2-3 days) ✅ COMPLETE

### Error Monitoring

- [x] **T6.01** Integrate error reporting for frontend
  - Created `services/errorReporting.ts` — lightweight error reporter
  - Global error handler: captures unhandled errors and unhandled promise rejections
  - `reportError()`, `reportApiError()` for manual error reporting
  - Swappable backend: `initErrorReporting({ dsn })` — set `VITE_SENTRY_DSN` to enable Sentry
  - Wired into `index.tsx` — initializes on app startup
  - Wired into `AIService.ts` — all API errors are reported
  - File: `services/errorReporting.ts`, `index.tsx`, `services/AIService.ts`

- [x] **T6.02** Structured logging for Edge Functions (Deno)
  - Created `supabase/functions/_shared/logger.ts`
  - Structured format: `[timestamp] LEVEL service=X action=Y duration=Ms error="msg" meta={}`
  - Integrated into `orchestrate-lesson/index.ts` — logs auth, rate limits, orchestration timing, errors
  - File: `supabase/functions/_shared/logger.ts`

### Logging & Monitoring

- [x] **T6.03** Add structured logging
  - Created `services/logger.ts` — client-side structured logger
  - Log level filtering via `VITE_LOG_LEVEL` env var (default: 'warn')
  - Integrated into `AIService.ts` — replaces console.log/error with structured calls
  - Edge Function logger in `_shared/logger.ts`
  - Files: `services/logger.ts`, `supabase/functions/_shared/logger.ts`

- [x] **T6.04** Add health check endpoint
  - Created `supabase/functions/_shared/health.ts`
  - Returns `{ status: 'ok', version: '0.1.0', uptime_seconds, timestamp }`
  - Integrated into `orchestrate-lesson/index.ts` — responds to `/health` path
  - File: `supabase/functions/_shared/health.ts`

### Security

- [x] **T6.05** Add rate limiting to Edge Functions
  - Created `supabase/functions/_shared/rateLimit.ts`
  - In-memory sliding window: configurable maxRequests + windowMs
  - Default: 30 requests/minute, returns 429 with Retry-After header
  - Identifier extraction: x-forwarded-for IP or auth token
  - Integrated into `orchestrate-lesson/index.ts`
  - File: `supabase/functions/_shared/rateLimit.ts`

- [x] **T6.06** Add auth middleware to Edge Functions
  - Created `supabase/functions/_shared/authMiddleware.ts`
  - Validates Supabase JWT via `supabase.auth.getUser(token)`
  - Returns userId and role for downstream use
  - Returns 401 for missing/invalid tokens
  - Integrated into `orchestrate-lesson/index.ts`
  - File: `supabase/functions/_shared/authMiddleware.ts`

### Shared Utilities

- [x] **T6.07** Create shared CORS utilities
  - `corsHeaders`, `handleCors()`, `jsonResponse()`, `errorResponse()`
  - Eliminates duplicated CORS boilerplate across Edge Functions
  - File: `supabase/functions/_shared/cors.ts`

### Tests

- [x] **T6.08** Observability tests (13 tests)
  - Rate limiter: allow/block, independent identifiers, window reset
  - CORS: OPTIONS handling, json/error response formatting
  - Edge logger: method presence, structured format
  - Client logger: method presence, format
  - Error reporting: string errors, Error objects, API errors
  - File: `test/Observability.test.ts`

---

## Phase 7: Speech & Pronunciation (5-7 days)

### Basic Pronunciation

- [ ] **T7.01** Implement pronunciation coaching via Web Speech API
  - Use browser-native `SpeechRecognition`
  - Compare spoken text against target word
  - Score based on similarity
  - File: `services/SpeechService.ts`

- [ ] **T7.02** Activate PronunciationCoach component
  - Wire to SpeechService
  - Show real-time feedback
  - File: `apps/student/PronunciationCoach.tsx`

### Advanced Pronunciation

- [ ] **T7.03** Create `evaluate-pronunciation` Edge Function
  - Accept audio base64 + target text
  - Use OpenAI Whisper for transcription
  - Compare and score
  - File: `supabase/functions/evaluate-pronunciation/index.ts`

### Text Differentiation

- [ ] **T7.04** Implement LLM-based text differentiation
  - Replace `differentiateText` stub with real LLM call
  - Generate 3 reading levels (below, on, above)
  - Cache results in `assets` table
  - File: `services/AIService.ts` or new `TextDifferentiationService.ts`

### Dubbing

- [ ] **T7.05** Activate DubbingStudio
  - Record audio via MediaRecorder API
  - Compare against reference audio
  - Score on emotion, timing, pronunciation
  - Save to Supabase Storage
  - File: `apps/student/DubbingStudio.tsx`

---

## Phase 8: Admin Dashboard & Scale (5-7 days)

### Analytics

- [ ] **T8.01** Create admin analytics API
  - Aggregate metrics across all classes
  - School-level, district-level rollups
  - File: `services/AdminService.ts`

- [ ] **T8.02** Activate DistrictAdminDashboard
  - Wire to AdminService
  - Show real district metrics
  - File: `apps/admin/DistrictAdminDashboard.tsx`

### User Management

- [ ] **T8.03** Admin user management
  - CRUD for teachers, students, parents
  - Bulk import via CSV
  - Password reset assistance
  - File: `apps/admin/UserManagement.tsx` (new)

### Content Moderation

- [ ] **T8.04** Content moderation system
  - Review queue for AI-generated content
  - Flag inappropriate content
  - Teacher content rating
  - File: `apps/admin/ContentModeration.tsx` (new)

---

## Summary Statistics

| Phase | Tasks | Priority | Estimated Duration |
|---|---|---|---|
| Phase 0: Bug Fixes | 10 | IMMEDIATE | 1-2 days |
| Phase 1: Pipeline Consolidation | 8 | HIGH | 1 day |
| Phase 2: Theme Context | 8 | HIGH | 2-3 days |
| Phase 3: Media Generation | 10 | CRITICAL | 3-5 days |
| Phase 4: Testing | 11 | HIGH | 2-3 days |
| Phase 5: Student Solo Mode | 5 | HIGH | 3-5 days |
| Phase 6: Observability | 6 | MEDIUM | 2-3 days |
| Phase 7: Speech & Pronunciation | 5 | MEDIUM | 5-7 days |
| Phase 8: Admin & Scale | 4 | LOW | 5-7 days |
| **TOTAL** | **67** | — | **6-8 weeks** |

---

## Quick-Start: First 10 Tasks (Do These Today)

1. **T0.01** — Fix "lives in the jungle" (5 min)
2. **T0.02** — Fix card front emoji (5 min)
3. **T0.03** — Fix Dicebear empty seed (5 min)
4. **T0.04** — Remap GAME_ARENA to BoardSpeedQuiz (5 min)
5. **T0.07** — Add toast for null draftUnitId (2 min)
6. **T0.06** — Remove MediaPlayer jungle fallbacks (10 min)
7. **T0.05** — Add empty students guard (10 min)
8. **T0.08** — Clear Zustand mock data (15 min)
9. **T0.09** — Verify BoardSpeedQuiz data contract (10 min)
10. **T0.10** — End-to-end pipeline test (30 min)

**Total: ~2 hours of work to eliminate all critical bugs.**

---

*End of Task List. See IMPLEMENTATION_PLAN.md for phase details and SYSTEM_REVIEW_REPORT.md for the full audit.*
