# System Review Report — Professor (Lesson Orchestrator)

**Date:** 2026-04-16  
**Version:** 0.1 MVP  
**Scope:** Full-stack audit of architecture, connectivity, AI pipeline, media generation, and production readiness  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Summary](#2-architecture-summary)
3. [What Is Properly Connected and Functioning](#3-what-is-properly-connected-and-functioning)
4. [Critical Bugs](#4-critical-bugs)
5. [Architectural Deficiencies](#5-architectural-deficiencies)
6. [Missing Systems](#6-missing-systems)
7. [Architecture Scorecard](#7-architecture-scorecard)
8. [File Risk Map](#8-file-risk-map)

---

## 1. Project Overview

**Professor** is a multi-portal EdTech SaaS for English language teaching. It converts physical textbooks into interactive, gamified lesson units via an AI pipeline, then delivers them in live classroom sessions or solo student practice.

### Core Value Proposition
- **Teacher uploads textbook pages** → AI extracts vocabulary, grammar, comics, exercises
- **AI orchestrates lesson flow** → Generates game-ready timeline (cards, quizzes, stories)
- **Live classroom broadcasting** → Teacher controls board via remote, students interact
- **Student solo practice** → Spaced repetition, pronunciation coaching, dubbing studio
- **Parent visibility** → Progress reports, dubbing gallery, messaging

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 18.3.1 |
| Build | Vite (MPA) | 6.2.0 |
| Styling | Tailwind CSS + Framer Motion | 3.4.1 / 12.35.2 |
| State | Zustand | 5.0.12 |
| Backend | Supabase (Auth/DB/Storage/Edge Functions/Realtime) | 2.99.3 |
| Real-Time | Socket.IO (dev) + Supabase Realtime (prod) | 4.8.3 |
| AI | OpenRouter (Mistral, Kimi VL) + ElevenLabs + Google AI | via Edge Functions |
| Deployment | Vercel | — |
| Language | TypeScript | 5.8.2 |

### Scale

| Metric | Count |
|---|---|
| Source files (non-deps) | ~160 |
| React components | ~90 |
| Board template components | 16 |
| Supabase Edge Functions | 3 |
| Database migrations | 15 |
| HTML entry points | 5 |
| Service modules | 7 |
| Store modules | 2 |

---

## 2. Architecture Summary

### 2.1 Multi-Page Application (MPA) Architecture

```
professor-0.1 (1)/
├── index.html ──── Hub/Landing (role selection, onboarding)
├── teacher.html ── Teacher Dashboard (classes, curriculum, live commander)
├── student.html ── Student App (home map, practice, lessons)
├── parent.html ─── Parent Portal (reports, messages, dubbing gallery)
├── admin.html ──── Admin Dashboard (district analytics)
│
├── apps/
│   ├── teacher/ (22 components) ── Curriculum management, live classroom control
│   ├── student/ (24 components) ── Gamified learning, practice, profile
│   ├── board/ (18 components) ─── Classroom board templates (16 game types)
│   ├── remote/ (5 components) ─── Teacher remote control (mobile)
│   ├── parent/ (8 components) ─── Parent portal
│   └── admin/ (1 component) ───── District admin dashboard
│
├── services/
│   ├── AuthService.ts ──────── Supabase Auth with self-healing profiles
│   ├── DataService.ts ──────── Full CRUD for classes, students, assignments, messages
│   ├── SupabaseService.ts ──── Unified Engine (Supabase or MockEngine fallback)
│   ├── AIService.ts ────────── Edge Function client for AI operations
│   ├── MockEngine.ts ───────── Local dev fallback (3 mock units, SRS items)
│   ├── LessonTransformer.ts ── Manifest → Flow converter (ORPHANED)
│   ├── geminiService.ts ────── Dead module (all functions return null)
│   └── supabaseClient.ts ───── Supabase client initialization
│
├── store/
│   ├── useAppStore.ts ──────── Zustand global state (units, students, profile)
│   └── SessionContext.tsx ───── Live classroom state machine + Realtime
│
├── supabase/
│   ├── functions/
│   │   ├── extract-page/ ───── Agent 1: Vision Scanner
│   │   ├── generate-lesson/ ── Omni-Router: OCR + Text + Image + Audio
│   │   └── orchestrate-lesson/ Agent 2: Manifest + Server-Side Hydration
│   └── migrations/ (15 files) ─ Schema evolution from mock to production
│
├── components/
│   ├── effects/ConfettiSystem.tsx ── Canvas particle system
│   └── shared/DrawingLayer.tsx ───── SVG overlay for real-time drawing
│
└── types/ & types.ts ─────────── TypeScript type definitions
```

### 2.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TEACHER WORKFLOW                             │
│                                                                     │
│  Upload Textbook Pages                                              │
│       ↓                                                             │
│  Agent 1 (extract-page) ── Vision LLM ──→ Structured JSON          │
│       ↓                                                             │
│  Review & Edit (UploadTextbook.tsx dual-pane)                       │
│       ↓                                                             │
│  Agent 2 (orchestrate-lesson) ── LLM ──→ LessonManifest            │
│       ↓                                                             │
│  Server-Side Hydration (transformManifestToFlow) ──→ Game Flow      │
│       ↓                                                             │
│  DB Save: units.flow = [...], units.status = 'Active'               │
│       ↓                                                             │
│  Live Classroom (LiveCommander → ClassroomBoard → 16 templates)     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        STUDENT WORKFLOW                              │
│                                                                     │
│  Solo Practice: SpacedRepetition ← srs_items (SuperMemo-2)         │
│  Live Session:  Socket.IO/Realtime ← ClassroomBoard                 │
│  Progress:      student_progress → XP, streak, completed units      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        PARENT WORKFLOW                               │
│                                                                     │
│  View Reports:  ParentReports ← student_progress (real data)        │
│  Messaging:     ParentMessages ← messages table                     │
│  Dubbing:       DubbingGallery ← (STUBBED, no real dubbing data)    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Database Schema (15 Tables)

| Table | Purpose | Status |
|---|---|---|
| `profiles` | User profiles linked to `auth.users` | Working, RLS active |
| `classes` | Teacher-owned classes with enrollment codes | Working |
| `class_enrollments` | Student ↔ Class many-to-many | Working |
| `parent_student_links` | Parent ↔ Student many-to-many | Working |
| `units` | Lesson units with `flow` JSONB and `scanned_assets` JSONB | Working |
| `student_progress` | XP, streak, completed units per student | Working |
| `students` | Legacy mock student table (pre-profiles) | Deprecated but still queried |
| `srs_items` | Spaced repetition items (SuperMemo-2) | Working, `unit_id` FK added |
| `assignments` | Teacher-created assignments | Working |
| `student_assignments` | Per-student assignment tracking | Working |
| `messages` | Direct messaging between users | Working |
| Storage bucket `materials` | Uploaded textbook pages | Working |
| `teacher_students_view` | Helper view for enrolled students | Working |

---

## 3. What Is Properly Connected and Functioning

### 3.1 Authentication & Authorization ✅

| Component | Status | Details |
|---|---|---|
| Email/password signup | ✅ | `AuthService.signUp()` with role in `user_metadata` |
| Email/password login | ✅ | `AuthService.signInWithPassword()` |
| Auto profile creation | ✅ | DB trigger `handle_new_user()` on `auth.users` insert |
| Self-healing profile | ✅ | Client-side fallback insert if trigger fails |
| Session hydration | ✅ | `App.tsx` calls `getCurrentUser()` on mount |
| Role-based access | ✅ | 4 roles: admin, teacher, student, parent |
| RLS policies | ✅ | All tables have row-level security |
| Logout | ✅ | `AuthService.signOut()` clears session and Zustand |
| Email confirmation flow | ✅ | `emailRedirectTo` configured for dynamic Vercel URLs |

**Known issue:** Competing trigger migrations (`20260320000002` vs `20260321000002`) may cause enum cast failures. The `EXCEPTION WHEN OTHERS` block silently swallows the error.

### 3.2 Data Layer ✅

| Feature | Status | Details |
|---|---|---|
| Teacher classes CRUD | ✅ | `DataService.getTeacherClasses()`, `createClass()` |
| Class enrollment | ✅ | Code-based enrollment via `findClassByCode()` |
| Student progress | ✅ | Real XP, streak, completed_unit_ids from Supabase |
| Assignments CRUD | ✅ | Create, read, submit, grade assignments |
| Messaging | ✅ | Send, receive, mark read, unread count |
| Parent-student links | ✅ | Parent can view linked students' progress |
| Class analytics | ✅ | Deterministic metrics from real student data |
| Unified Engine pattern | ✅ | Auto-switches between Supabase and MockEngine |

### 3.3 Real-Time Layer ✅

| Feature | Status | Details |
|---|---|---|
| Supabase Realtime channel | ✅ | `classroom_live` broadcast channel |
| Slide navigation sync | ✅ | `nextSlide`, `prevSlide`, `goToSlide` |
| Student selection | ✅ | RANDOM / FAIR / ELIMINATION modes |
| Point awards sync | ✅ | Optimistic update + broadcast |
| Drawing layer sync | ✅ | SVG strokes broadcast in real-time |
| Confetti triggers | ✅ | Canvas-based particle system on game wins |
| Wheel of Destiny | ✅ | Animated student picker overlay |
| Socket.IO dev server | ✅ | `server.ts` with Express + Vite + Socket.IO on port 3000 |

### 3.4 AI Pipeline — Stage 1: Ingestion ✅

| Feature | Status | Details |
|---|---|---|
| Textbook page upload | ✅ | To Supabase Storage `materials` bucket |
| Vision scanning (Agent 1) | ✅ | `extract-page` Edge Function with Kimi VL |
| Page classification | ✅ | COMIC, VOCABULARY, GRAMMAR, MIXED, etc. |
| Structured extraction | ✅ | vocabulary, reading_text, comic_panels, grammar_boxes, exercises |
| JSON sanitization | ✅ | Regex-based extraction bypasses LLM markdown wrapping |
| Draft unit creation | ✅ | `units` row with `status: 'Draft'`, `scanned_assets: [...]` |
| Dual-pane workspace UI | ✅ | `UploadTextbook.tsx` shows extracted pedagogy cards |

### 3.5 AI Pipeline — Stage 3: Orchestration ✅ (with caveats)

| Feature | Status | Details |
|---|---|---|
| LLM manifest generation | ✅ | `orchestrate-lesson` generates semantic `LessonManifest` |
| Server-side hydration | ✅ | `transformManifestToFlow()` converts manifest to game flow |
| DB save with Active status | ✅ | `units.flow` populated, `units.status = 'Active'` |
| SRS vocabulary insertion | ✅ | Non-fatal insert into `srs_items` with `unit_id` |
| Service role bypass | ✅ | Edge Function uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS |

### 3.6 Board Engine ✅ (with hardcoded fallback issues)

| Feature | Status | Details |
|---|---|---|
| Dynamic component routing | ✅ | 16 slide types → 16 React components |
| Cinematic transitions | ✅ | Framer Motion AnimatePresence with blur/scale |
| Progress bar | ✅ | Gradient bar synced to slide index |
| "No Signal" screen | ✅ | Shown when not connected to classroom |
| Card flip animations | ✅ | CSS 3D transforms with perspective |
| Video playback | ✅ | ReactPlayer integration |

---

## 4. Critical Bugs

### BUG-001: Hardcoded "lives in the jungle" Sentence

| Field | Value |
|---|---|
| **ID** | BUG-001 |
| **Severity** | CRITICAL |
| **File** | `apps/board/templates/BoardFocusCards.tsx:101` |
| **Impact** | Every vocabulary card shows "The [word] lives in the jungle" regardless of unit theme |
| **Root Cause** | Hardcoded template string on the card back face. The `context_sentence` field from the manifest is never read. |
| **Fix** | Replace `"The <span>...{activeCard.back.toLowerCase()}...</span> lives in the jungle."` with `{activeCard.context_sentence \|\| activeCard.definition \|\| ""}` |
| **Effort** | 5 minutes |

### BUG-002: BoardGameArena Crash on Empty Students

| Field | Value |
|---|---|
| **ID** | BUG-002 |
| **Severity** | CRITICAL |
| **File** | `apps/board/templates/BoardGameArena.tsx` |
| **Impact** | Runtime crash: `Cannot read properties of undefined (reading 'id')` when students array is empty |
| **Root Cause** | `BoardGameArena` is a student-selection wheel, not a quiz engine. It accesses `students[0].id` without a guard. Meanwhile, the AI-generated quiz data in `data.questions` is completely ignored. |
| **Fix** | (1) Add early return with "No students loaded" message when `students.length === 0`. (2) Remap `GAME_ARENA` type to `BoardSpeedQuiz` in `ClassroomBoard.tsx` which correctly handles `data.questions`. |
| **Effort** | 15 minutes |

### BUG-003: Card Front Always Shows Camera Emoji

| Field | Value |
|---|---|
| **ID** | BUG-003 |
| **Severity** | MAJOR |
| **File** | `supabase/functions/orchestrate-lesson/index.ts` — `transformManifestToFlow()` |
| **Impact** | Every vocabulary card displays "📸" instead of the word or an actual image |
| **Root Cause** | The transformer hardcodes `front: "📸"` for every card |
| **Fix** | Change to `front: v.word` (show the word) or generate an actual image URL |
| **Effort** | 5 minutes |

### BUG-004: Dicebear 400 Bad Request from Empty Seeds

| Field | Value |
|---|---|
| **ID** | BUG-004 |
| **Severity** | MAJOR |
| **File** | `supabase/functions/orchestrate-lesson/index.ts` — image URL generation |
| **Impact** | HTTP 400 errors when vocabulary items have empty/null `word` fields |
| **Root Cause** | `seed=${encodeURIComponent(v.word)}` — when `v.word` is empty, URL becomes `seed=` which Dicebear rejects |
| **Fix** | Add guard: `encodeURIComponent(v.word \|\| 'vocab')` |
| **Effort** | 5 minutes |

### BUG-005: BoardMediaPlayer Jungle-Themed Fallbacks

| Field | Value |
|---|---|
| **ID** | BUG-005 |
| **Severity** | MODERATE |
| **File** | `apps/board/templates/BoardMediaPlayer.tsx:18,79,104` |
| **Impact** | Default lyrics, YouTube URL, and title are all "Walking in the Jungle" |
| **Root Cause** | Hardcoded fallback values in the component |
| **Fix** | Replace jungle defaults with neutral fallbacks (empty array for lyrics, null for video URL, "Media Player" for title) |
| **Effort** | 10 minutes |

### BUG-006: Auth Trigger Enum Cast Failure (Silent)

| Field | Value |
|---|---|
| **ID** | BUG-006 |
| **Severity** | HIGH |
| **Files** | `supabase/migrations/20260320000002_profiles_and_auth.sql` vs `20260321000002_bulletproof_auth_trigger.sql` |
| **Impact** | Profile creation silently fails if role metadata doesn't match `user_role` enum. User exists in `auth.users` but has no `profiles` row. |
| **Root Cause** | Two competing trigger definitions. The bulletproof version uses `EXCEPTION WHEN OTHERS` which swallows enum cast errors. |
| **Fix** | Reconcile into a single migration with explicit `::user_role` cast and proper error logging |
| **Effort** | 30 minutes |

### BUG-007: Zustand Persistence Conflict

| Field | Value |
|---|---|
| **ID** | BUG-007 |
| **Severity** | MODERATE |
| **File** | `store/useAppStore.ts` |
| **Impact** | Stale mock units ("Jungle Safari", "My Family") persist in localStorage. App renders old data instead of fetching fresh from Supabase. |
| **Root Cause** | Zustand `persist` middleware saves the initial mock data. On reload, Zustand restores from localStorage before Supabase fetch completes. |
| **Fix** | (1) Remove `MOCK_UNITS` and `MOCK_LESSON_FLOW` from initial state. (2) Initialize `units: []`. (3) Add a version field to persist config to force cache invalidation. |
| **Effort** | 15 minutes |

### BUG-008: Silent Return on Null Draft Unit ID

| Field | Value |
|---|---|
| **ID** | BUG-008 |
| **Severity** | MODERATE |
| **File** | `apps/teacher/UploadTextbook.tsx` — `handleApprove` |
| **Impact** | "Approve & Generate Assets" button does nothing with zero feedback when `draftUnitId` is null |
| **Root Cause** | `if (!draftUnitId) return;` — silent early return |
| **Fix** | Replace with `toast.error('No draft unit found. Upload a page first.')` |
| **Effort** | 2 minutes |

---

## 5. Architectural Deficiencies

### DEF-001: No Real Media Creation Pipeline

**Severity:** CRITICAL architectural gap

The app has no functional text-to-speech, image generation, or video generation pipeline:

| Feature | Current State | What's Needed |
|---|---|---|
| Image generation | `generate-lesson` stub calls `generateContent` (text endpoint, not Imagen) → returns text, not images | DALL-E 3 / Stable Diffusion / Imagen API → upload to Storage → return URL |
| Audio synthesis | ElevenLabs call in `generate-lesson` generates base64 audio inline → unplayable in production | ElevenLabs / Google Cloud TTS → upload MP3 to Storage → return URL |
| Video content | `BoardMediaPlayer` expects YouTube URLs → no curation mechanism | YouTube search API or pre-curated video library |
| Asset persistence | All generated assets are ephemeral (base64 or Dicebear URLs) | Supabase Storage with CDN-backed public URLs |
| Character consistency | No character ledger → each vocab card gets a random Dicebear avatar | Character Ledger table tracking generated character images per unit |

**Files affected:** `supabase/functions/generate-lesson/index.ts`, `services/geminiService.ts`, `apps/board/templates/BoardMediaPlayer.tsx`

**Required new components:**
- `supabase/functions/generate-media/` — New Edge Function for asset generation
- `assets` DB table — Track generated media with deduplication
- `character_ledger` DB table — Visual consistency across units
- Storage bucket `generated-media` — Persistent CDN-backed asset storage

### DEF-002: No LLM Integration for Student-Facing Features

**Severity:** HIGH

All student-facing AI features are completely stubbed:

| Feature | File | Current Return |
|---|---|---|
| Pronunciation coaching | `geminiService.ts:checkPronunciation` | `null` |
| Dubbing evaluation | `geminiService.ts:evaluateDubbing` | `null` |
| Text differentiation | `geminiService.ts:differentiateText` | Returns identical text for all 3 levels |
| Song generation | `geminiService.ts:generateSong` | `{ title: "Song Gen Disabled", lyrics: "Feature pending..." }` |
| Live AI feedback | `AIService.ts:generateLiveFeedback` | Hardcoded response |

**Required integrations:**
- **Speech-to-Text:** Google Cloud Speech-to-Text or OpenAI Whisper for pronunciation scoring
- **Pronunciation evaluation:** Custom scoring algorithm comparing phoneme sequences
- **Text differentiation:** LLM-based text simplification (3 reading levels)
- **Song generation:** LLM generates lyrics, TTS synthesizes audio, optional melody generation

### DEF-003: Two Parallel Disconnected Pipelines

**Severity:** HIGH (architectural confusion)

```
Pipeline A (ACTIVE — UploadTextbook.tsx):
  Upload → extract-page → scanned_assets → orchestrate-lesson → flow → DB

Pipeline B (ORPHANED — GenerateLessonModal + ReviewContent):
  GenerateLessonModal → geminiService → LessonManifest → ReviewContent → LessonTransformer → flow → DB
```

Pipeline B is dead code. `ReviewContent.tsx` connects to `geminiService` (all stubs). `LessonTransformer.ts` has correct logic but is only called in Pipeline B's client-side path. The server-side `transformManifestToFlow()` in `orchestrate-lesson` has replaced it for Pipeline A.

**Fix:** Delete Pipeline B files. Move needed types to `types/pipeline.ts`.

### DEF-004: No Theme Context / World Binding

**Severity:** HIGH

Every unit should establish a narrative world (setting, characters, theme). All generated content should be bound to that world. Currently:
- Vocabulary has no `context_sentence` field in the manifest schema
- Grammar examples are generic, not theme-bound
- Story content is generated from a single base text, not from the unit's world

**Required:**
- Add `theme_context` object to `LessonManifest` schema: `{ setting, characters[], world_description }`
- Add `context_sentence` to each vocabulary item in the manifest
- Update `orchestrate-lesson` system prompt to generate theme-bound content
- Pass theme context through to board components

### DEF-005: Edge Functions Are Monolithic with Duplicated Code

**Severity:** MEDIUM

The 3 Edge Functions duplicate:
- CORS headers (identical in all 3)
- AI client configuration (base URL, API key, model name)
- JSON sanitization logic (`/\{[\s\S]*\}/` pattern)
- Error wrapping (`{ success: false, error: ... }` pattern)
- No shared utilities, no middleware, no auth validation

**Required:**
- Shared `cors.ts` utility
- Shared `aiClient.ts` utility
- Shared `jsonSanitize.ts` utility
- JWT auth validation middleware
- Rate limiting per user
- Request validation with Zod schemas

### DEF-006: Student App Is Largely Placeholder

**Severity:** HIGH

24 component files exist but most are UI shells without real functionality:

| Component | Status | Missing |
|---|---|---|
| `HomeMap.tsx` | Shell | No real map, no unit progression logic |
| `LessonSession.tsx` | Partial | Requires live classroom session, no solo mode |
| `FlashMatch.tsx` | Shell | No AI-driven content generation |
| `ListenTap.tsx` | Shell | No audio playback pipeline |
| `PhonicsPhlyer.tsx` | Shell | No speech recognition |
| `SentenceScramble.tsx` | Shell | No dynamic sentence generation |
| `DubbingStudio.tsx` | Shell | No TTS/STT integration |
| `PronunciationCoach.tsx` | Shell | No speech recognition API |
| `SpacedRepetition.tsx` | Partial | Needs proper scheduling and UI |
| `AvatarBuilder.tsx` | Shell | No persistence of avatar state |
| `Shop.tsx` | Shell | No economy system, no items |
| `Quests.tsx` | Shell | No quest generation system |
| `Leaderboard.tsx` | Partial | Needs real-time updates |

### DEF-007: No Error Monitoring or Observability

**Severity:** MEDIUM (production blocker)

- No Sentry, LogRocket, or equivalent
- Edge Functions use `console.error` only
- No structured logging
- No health checks or uptime monitoring
- No performance metrics or APM
- No user analytics or event tracking

### DEF-008: No Testing

**Severity:** HIGH (production blocker)

- Zero test files in the entire codebase
- No test framework configured (no Vitest, Jest, or Playwright)
- No CI/CD pipeline
- No pre-commit hooks for linting/testing
- `package.json` scripts have `"lint": "tsc --noEmit"` but no test command

---

## 6. Missing Systems

### 6.1 Media Generation Pipeline (Priority: CRITICAL)

| Component | Description | Estimated Effort |
|---|---|---|
| `generate-media` Edge Function | Image generation via DALL-E/SD, audio via ElevenLabs, upload to Storage | 3-5 days |
| `assets` DB table | Track generated media with deduplication and caching | 0.5 day |
| `character_ledger` DB table | Maintain visual consistency of characters across a unit | 0.5 day |
| Storage bucket `generated-media` | CDN-backed persistent storage for generated assets | 0.5 day |
| Client-side media service | `MediaService.ts` for fetching and caching generated assets | 1 day |

### 6.2 Student Solo Lesson Mode (Priority: HIGH)

| Component | Description | Estimated Effort |
|---|---|---|
| Solo lesson player | Student can play through units independently without live classroom | 3-5 days |
| Adaptive difficulty | AI adjusts content based on student performance | 2-3 days |
| Session state for solo | `SoloSessionContext.tsx` separate from live classroom context | 1-2 days |
| Student lesson API | Endpoints for fetching lesson flow, submitting answers, tracking progress | 2-3 days |

### 6.3 Speech & Pronunciation (Priority: MEDIUM)

| Component | Description | Estimated Effort |
|---|---|---|
| Pronunciation scoring | Web Speech API or Whisper-based phoneme comparison | 3-5 days |
| Dubbing evaluation | Compare student audio against reference audio | 2-3 days |
| Audio playback service | TTS generation + Storage upload + client playback | 1-2 days |

### 6.4 Testing Infrastructure (Priority: HIGH)

| Component | Description | Estimated Effort |
|---|---|---|
| Vitest configuration | Unit test framework setup | 0.5 day |
| React Testing Library | Component testing setup | 0.5 day |
| Playwright | E2E test setup for critical flows | 1 day |
| CI/CD pipeline | GitHub Actions for lint, test, build | 1 day |
| Test coverage | Write tests for auth, data, AI pipeline | 3-5 days |

### 6.5 Observability (Priority: MEDIUM)

| Component | Description | Estimated Effort |
|---|---|---|
| Sentry integration | Error tracking for frontend + Edge Functions | 0.5 day |
| Structured logging | Consistent log format with context | 0.5 day |
| Health checks | `/health` endpoint for uptime monitoring | 0.5 day |
| Analytics | User event tracking (Mixpanel/PostHog) | 1 day |

### 6.6 Admin Dashboard (Priority: LOW)

| Component | Description | Estimated Effort |
|---|---|---|
| District analytics | Aggregate metrics across schools/classes | 3-5 days |
| User management | Admin CRUD for teachers, students, parents | 2-3 days |
| Content moderation | Review and approve AI-generated content | 2-3 days |

---

## 7. Architecture Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Authentication & Authorization | 8/10 | Solid Supabase Auth, minor trigger race condition |
| Database Schema | 7/10 | Comprehensive migrations, good RLS, competing triggers |
| Data Connectivity | 7/10 | DataService fully wired; MockEngine fallback creates confusion |
| AI Pipeline — Ingestion | 8/10 | Agent 1 (Vision Scanner) robust and production-ready |
| AI Pipeline — Orchestration | 6/10 | Server-side hydration works, missing theme binding |
| Media Generation | 1/10 | All stubs, no persistent asset storage |
| Real-Time | 8/10 | Supabase Realtime + Socket.IO working well |
| Board Engine | 7/10 | 16 templates, good routing, hardcoded fallbacks |
| Student App | 3/10 | UI shells only, no solo mode, no speech features |
| Parent App | 4/10 | Connected to real data but limited functionality |
| Admin App | 2/10 | Single dashboard component, no real data feeds |
| Testing | 0/10 | No tests exist |
| Observability | 1/10 | Console.log only |
| Code Quality | 6/10 | Good component architecture, duplicated logic, dead code |
| Documentation | 7/10 | 20+ architecture docs, some outdated |

**Overall MVP Completion: ~45%**

---

## 8. File Risk Map

### Critical Risk (Fix Immediately)

| File | Risk | Issue |
|---|---|---|
| `apps/board/templates/BoardFocusCards.tsx` | CRITICAL | Hardcoded "lives in the jungle" sentence |
| `apps/board/templates/BoardGameArena.tsx` | CRITICAL | Crashes on empty students, ignores quiz data |
| `supabase/functions/orchestrate-lesson/index.ts` | CRITICAL | Empty `front: "📸"`, Dicebear 400, no theme binding |
| `apps/teacher/UploadTextbook.tsx` | CRITICAL | Silent return on null draftUnitId |

### High Risk (Fix This Sprint)

| File | Risk | Issue |
|---|---|---|
| `services/geminiService.ts` | HIGH | Dead module — all functions return null |
| `services/LessonTransformer.ts` | HIGH | Orphaned — only called in dead Pipeline B |
| `apps/teacher/ReviewContent.tsx` | HIGH | Orphaned — connected to dead geminiService |
| `apps/teacher/GenerateLessonModal.tsx` | HIGH | Orphaned — Pipeline B entry point |
| `store/useAppStore.ts` | HIGH | Stale mock data in persisted state |
| `supabase/migrations/20260321000002_bulletproof_auth_trigger.sql` | HIGH | Competing trigger definition |

### Medium Risk (Fix Next Sprint)

| File | Risk | Issue |
|---|---|---|
| `apps/board/templates/BoardMediaPlayer.tsx` | MEDIUM | Jungle-themed fallback values |
| `services/AIService.ts` | MEDIUM | Safe defaults mask pipeline failures |
| `supabase/functions/generate-lesson/index.ts` | MEDIUM | Image/audio generation stubs |
| `apps/student/DubbingStudio.tsx` | MEDIUM | Requires TTS/STT (not available) |
| `apps/student/PronunciationCoach.tsx` | MEDIUM | Requires speech recognition (not available) |
| `apps/admin/DistrictAdminDashboard.tsx` | MEDIUM | No real data feeds |

### Low Risk (Technical Debt)

| File | Risk | Issue |
|---|---|---|
| `services/MockEngine.ts` | LOW | Should be isolated, not imported by production code |
| `components/effects/ConfettiSystem.tsx` | LOW | Works, could be optimized |
| `server.ts` | LOW | Dev-only Socket.IO server |
| `types.ts` | LOW | Only 14 lines, could be expanded |
| `constants.ts` | LOW | Only 8 lines, model names hardcoded elsewhere |

---

*End of System Review Report. See IMPLEMENTATION_PLAN.md for the phased roadmap and TASK_LIST.md for actionable tasks.*
