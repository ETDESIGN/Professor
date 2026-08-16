# Student App — Deep Audit (2026-08-17)

Full-codebase audit of the student portal: structure/completeness, UI/mobile quality, and data-layer functionality. All findings verified against code; line numbers refer to this commit.

---

## TL;DR

The **learning core is genuinely built** (solo lesson player, exercise engine, FSRS review, reading/phonics, avatar, gamification service layer). But the **shell around it is broken on phones**, and underneath that, **five systemic issues make the app functionally empty for any real student**: XP/gems/hearts never persist, students can't join a class, the leaderboard is RLS-empty, homework is unwired, and the exercise pools are empty in production. On top of that sits a layer of decorative fakery (quests, shop, profile, settings) that masks broken data with hardcoded placeholders.

## Why the phone shows headers/nav but no content (owner-reported symptom)

1. **Routing double-prefix bug (primary).** `studentEntry.tsx:56` sets `basename="/student"`, but every `navigate()` inside `StudentApp.tsx` already uses prefixed paths (`navigate('/student/shop')` etc.). React Router prepends the basename to navigate targets, so tapping any bottom tab produces URL `/student/student/shop` — which matches no route and lands on a catch-all `<Navigate>` pointing at the same stuck location → **blank content area with the nav bar still visible**. Deep links/refresh are also blank: the early-return screens compare `location.pathname === '/student/lesson'` (`StudentApp.tsx:263-289`) but with a basename the pathname is just `/lesson`. **The same bug exists in all four standalone entries** (`teacherEntry.tsx:62`, `parentEntry.tsx:56`, `adminEntry.tsx:56`). It only "works" on desktop because entry normally happens via the hub (`App.tsx` mounts the same components *without* a basename, where prefixed paths are correct).
2. **Teacher-account bounce.** Opening `/student` while logged in as a teacher account hard-redirects to `/teacher` (`AuthGate.tsx:55-59`) — on a phone that shows the **teacher shell with sidebar + hamburger header**.
3. **Service worker serves the wrong shell.** `vite.config.ts:74-81` sets `navigateFallback: '/index.html'`; the denylist doesn't include `/student|/teacher|/parent|/admin` — so where the SW controls, portal URLs get answered with the *main* app shell (potentially stale). Manifest `start_url: "/"` + `display: standalone` means home-screen installs open the hub, not the student app.
4. **Silent empty data.** Unit fetching swallows all errors → `[]` (`SupabaseService.ts:73-104`); `HomeMap` has no loading skeleton or empty state.

**Diagnostic:** on the phone, tap a bottom tab and read the address bar — `/student/student/...` confirms (1); a teacher top bar confirms (2).

---

## P0 — Critical functional bugs

| # | Bug | Where | Effect |
|---|---|---|---|
| 1 | Routing double-prefix (above) | 4 entry files + inner route tables | Blank screens on direct phone access; broken tabs, deep links, refresh |
| 2 | **No `student_progress` row is ever created** — `handle_new_user` only creates `profiles`; no trigger/RPC inserts the row | migrations (none found) + `GamificationService.ts:12-21` | XP, gems, streaks, hearts, quest rewards, shop spending **silently no-op for every student forever** |
| 3 | **Join-class-by-code is RLS-blocked** — `findClassByCode` SELECTs `classes` before enrollment, but RLS requires enrollment to read | `DataService.ts:383-401` vs `20260506000000:34-41` | "Class not found" on valid codes → students can't join → unit list stays empty → blank home map |
| 4 | Leaderboard reads `class_roster_analytics_view`, whose underlying RLS excludes students | `GamificationService.ts:342-353` | Empty podium for all students; `(You)` never highlights (`Leaderboard.tsx:113` compares `roster_student_id` to auth uid) |
| 5 | Tapping a lesson node crashes — `HomeMap` → `/student/lesson` without `startLesson` → empty playlist → `currentActivity.type` throws | `HomeMap.tsx:207` → `StudentApp.tsx:411-417` → `LessonSession.tsx:77,140` | TypeError → error screen |
| 6 | Practice menu navigates to `/student/listen`, `/student/scramble` — **no routes exist** | `PracticeMenu.tsx:58,86` | Blank screens |
| 7 | Exercise/SRS engine dead in prod — `pool_items`/`objectives` have 0 rows (root cause: `generate-exercises` never produced data; see `docs/brainstorming/02_FOUNDATION_DEEPDIVE.md` §1), and student RLS on those tables additionally requires assignment rows | `poolService.ts`, `20260628000005:18-45` | "No exercises available", Daily Practice always "all caught up", phonics empty, crowns never render. FSRS code is wired but unreachable |
| 8 | Homework unwired — nothing ever INSERTs `student_assignments`; update targets the wrong id (assignment id vs student_assignment id) | `DataService.ts:671-694, 751, 768-800` | Student list always "All caught up" |

## What's finished and works

Auth gate + role guard; solo lesson player (`SoloLessonPlayer.tsx`, all step types, clean empty guards); ExerciseRunner + 6 exercise components + registry (covered by tests); ReadingReader; PhonicsPhlyer UI; SpacedRepetition UI + real FSRS engine; AvatarBuilder (persists to `profiles`); quests/shop/gamification **service layer** (real DB code); join-class modal UI; assignments list UI; i18n shell (`locales/{en,es,zh}.json`).

## What's fake / unfinished / dead

- **Student `Login.tsx`** — leftover demo wizard ("Welcome, Leo! Class 3B"), never authenticates; unreachable at URL level in the standalone build.
- **Live-class participation** — architecturally absent *by design* (`LIVE_GAME_LIFECYCLE.md:250-257`: projector + teacher-remote only, no student subscription). The student app still carries dead UI: "Live Class Started!" banner that can never fire (`StudentApp.tsx:341-351`), `LessonSession` live branch, CELEBRATE confetti listener (`StudentApp.tsx:118-145`). **Owner decision 2026-08-17: remove the dead code.**
- **Quests** — fabricated fallback quests ("35/50 XP") whenever the query fails/empty (`Quests.tsx:31-35`); weekly challenge is a static placeholder.
- **Shop** — catalog hardcoded (`Shop.tsx:20-29`); buys silently fail (bug #2); purchased power-ups have zero gameplay effect (nothing consumes `student_inventory`).
- **Profile** — "#4 League", "My Studio" video card, "Unit 4 Review" promo all fake; "View Report" dead (`Profile.tsx:100-167`).
- **Settings/Help** — toggles local-only no-ops; Change PIN / Parent Dashboard / Email / Report Bug all dead; fake "Level 5 • 12 Day Streak" and version string.
- **LessonComplete** — "Review Mistakes" dead button; "+20 Gems" hardcoded (`LessonComplete.tsx:137-139`).
- **DubbingStudio** — flag-off mock (`VITE_ENABLE_DUBBING` default false). **Onboarding** — complete but unreachable from the standalone entry.
- **Hardcoded results** — `LessonSession.tsx:126` (`xp: 50, time: '2:30'`), `StudentApp.tsx:276-279` (pronounce/reading/phonics award fixed xp/accuracy).

## Architecture findings

- **Dual mount is the root architectural flaw**: every app component is written to be mounted two ways (hub `App.tsx` without basename, standalone entry with basename) — that is what broke all four entries. Production rewrites (`vercel.json`) make the standalone entries canonical; the hub's portal mounts are unreachable in prod and should be retired (Phase 2).
- **Two competing SRS models**: legacy SM-2 word-template clone (`Engine.ensureStudentSRSItems`, still called in `finalizeLesson`, `StudentApp.tsx:231`) creates `srs_items` rows with `objective_id NULL` that the new FSRS `selectPracticeItems` explicitly excludes (`poolService.ts:134`) — dead data accruing.
- **Teacher-shaped code in the student provider**: `SoloSessionContext.loadStudents` calls `getTeacherStudents(studentId)` (`SoloSessionContext.tsx:97-117`) — returns nothing in the student portal.
- **Broad error swallowing**: `.catch(() => {})` on XP/hearts/quest writes (`ExerciseRunner.tsx:61-103`), swallowed fetch errors, fabricated fallbacks masking failures.
- **Rules-of-Hooks landmines**: `FlashMatch.tsx:29-42` and `SentenceScramble.tsx:35-45` early-return before their hooks; both also freeze `data` into `useState`.
- **Tests skew green**: `e2e/student.spec.ts` uses tolerant `if (count > 0)` assertions; `test/Phase9.test.tsx` mocks `status: 'LIVE'` — a state the real student app can never reach.

## Mobile / UX quality findings

`pb-safe`/`no-scrollbar` classes used but never defined (bottom nav sits under the iPhone home indicator; `student.html` lacks `viewport-fit=cover`); `h-screen` instead of `h-dvh` in DubbingStudio (`:308`); LessonComplete can clip buttons on short phones (fixed inset, no scroll, `:44-47`); **production CSP `frame-src 'none'` blocks YouTube in MEDIA_PLAYER steps** (`SoloLessonPlayer.tsx:434` vs `vercel.json:14` — works in dev, dead in prod); `autoFocus` pops the keyboard over exercises (`TypeTranslate.tsx:28`, `Dictation.tsx:30`); sub-44px tap targets on media controls (`SoloLessonPlayer.tsx:496-507`); `text-[10px]` nav labels; UpdatePrompt banner overlaps the student bottom nav; HTML titles still say "Lesson Orchestrator Prototype"; global `body { overflow: hidden }` (`index.css:15`) makes any page without an inner scroll container unscrollable.

---

## Remediation roadmap

### Phase 1 — "make it work on a phone" (IN PROGRESS, approved 2026-08-17)
1. Routing fix in all 4 entries (remove `basename`, prefix inner route paths).
2. SW `navigateFallbackDenylist` for the four portals + dev-server rewrite middleware.
3. Lesson-node crash fix + remove dead live-class UI (owner decision).
4. Practice menu dead buttons → honest "coming soon".
5. AuthGate wrong-role explainer screen.
6. HomeMap loading/empty/error states.
7. Migration: `student_progress` auto-create trigger + backfill (fixes XP/gems/hearts/shop silent no-ops).
8. Migration: `join_class_by_code` SECURITY DEFINER RPC + DataService rewire (fixes join-class RLS deadlock).

### Phase 2 — functional correctness (COMPLETED 2026-08-17)
1. ✅ Leaderboard: `get_class_leaderboard` SECURITY DEFINER RPC (migration `20260817000003`) — same roster model as the board (class points + home XP incl. unclaimed kids), scoped to the caller's classes; `GamificationService.getLeaderboard` rewired to it; `(You)` now matches via `claimed_profile_id`.
2. ✅ Homework: `on_assignment_created` trigger fans out `student_assignments` rows per enrolled student + backfill (migration `20260817000004`); `updateStudentAssignmentStatus` now keys on `(assignment_id, student_id)` instead of the wrong row id. Known gap: students joining a class after an assignment is created don't receive that older assignment (INSERT-time fan-out only).
3. ✅ Shop/quest failure surfacing (error toasts) + fabricated quest fallbacks, weekly-challenge placeholder and "Get Plus" dead block removed.
4. ✅ Hub dual mounts retired: `App.tsx` portal routes now `PortalRedirect` (full-page handoff to the standalone entries); board/remote/onboarding/login/claim hub routes unchanged.
5. ✅ Legacy SM-2 SRS clone removed (`Engine.ensureStudentSRSItems` + call sites); `fetchSRSItems` now filters `objective_id NOT NULL` so badges count only FSRS items. Existing NULL-objective rows were left in place (displayed nowhere; deletion needs owner sign-off).
6. ✅ Rules-of-Hooks fixed in `FlashMatch` / `SentenceScramble` (empty-state returns moved below all hooks; SentenceScramble no longer freezes `targetSentence`).
7. ✅ CSP: `frame-src https://www.youtube.com https://www.youtube-nocookie.com` + `img-src … https://i.ytimg.com` — YouTube MEDIA_PLAYER steps now work in production.
8. ✅ Fake data removed: Profile "#4 League"/"My Studio"/"Unit 4 Review" promo/"View Report"; Settings fake level-streak/dead buttons (toggles now persist to localStorage); HelpCenter dead contact/legal buttons (search now filters FAQs); LessonComplete "+20 Gems" now shows the real `GEM_REWARDS.PERFECT_LESSON` and the dead "Review Mistakes" button is gone (card also scrolls on short screens).

### Phase 2 — remaining items (moved to Phase 3/4 backlog)
- Power-ups (Streak Freeze / Heart Refill) still have no gameplay effect — nothing consumes `student_inventory` (needs a consumer in learnerState/hearts flow).
- Hardcoded XP/accuracy results for pronounce/reading/phonics exits (`StudentApp.tsx` onBack handlers) — computing real results requires child components to report outcomes.
- `reach_familiar` quest type still missing from `quest_templates` seed (progress updates on a quest that never exists).

### Phase 3 — content pipeline (COMPLETED 2026-08-17, pending owner backfill run)
Re-verified live before planning: NULL-owner units already 0/79 (fixed by commit 9735b83 + backfill), and the pipeline had produced data 4× since orchestrate-lesson's Aug-15 redeploy (47 objectives / 449 pool_items). The real remaining causes were deploy drift, an unprotected fire-and-forget trigger, no re-run surface, and the assignment-gated student RLS.

1. ✅ **Reliability**: orchestrate-lesson's detached generate-exercises fetch is now protected with `EdgeRuntime.waitUntil` (isolate teardown could silently drop it — the months-long root cause); generate-exercises' job marking is an UPSERT on (unit_id, stage) so direct invocations record status; zero-errors-zero-persisted runs count as `succeeded` instead of `failed`.
2. ✅ **Deploy drift closed**: all 6 content functions redeployed from the repo (generate-exercises v17, enrich-unit v43, extract-page v42, generate-media v28, evaluate-pronunciation v20, orchestrate-lesson v41). Note: **nothing auto-deploys functions** — `supabase functions deploy` is manual after every change under `supabase/functions/`.
3. ✅ **Admin bypass** in `assertUnitOwnership` (admins already had full RLS read) so one admin account can backfill units owned by multiple teachers.
4. ✅ **Re-run surface**: "Exercises" button in Unit Studio (invokes + polls `generation_jobs` + shows pool count), bulk **"Generate missing pools"** in the Curriculum Library (sequential, 7s pacing for the 10/min rate limit, per-unit progress), and "Publish & Teach" kicks background generation when the pool is empty. Upload now hard-blocks without a session (never recreate NULL-owner units).
5. ✅ **Student access (migration `20260817000005`)**: student SELECT branches on objectives / pool_items / assets / srs templates swapped from the assignment-join to the enrollment rule (`unit.teacher_id = ANY(student_class_teacher_ids())`) — the identical boundary students already pass to see the unit. Unblocks lesson batteries, Daily Practice (ensureStudentLearnerState domino), crowns, phonics, and the media fast path.
6. ✅ **Playability**: GRAMMAR_FILL / STORY_COMPREHENSION / WHO_SAID_IT mapped onto ChoiceExercise; new `DialogueRoleplay` component (lenient tiered speech scoring, per-line hear-it-first, engagement-only fallback without mic, never-stuck line progression) — all 16 generated exercise types now render.

**Remaining owner action**: run "Generate missing pools" once as admin (≈13 Active units; image gen defaults to free Pollinations) — then verify on a student login: lesson PRACTICE steps, Daily Practice, Phonics, crowns.

### Phase 3 — leftover backlog
- 62 Draft units have no flow/enrichment — they need the normal upload→enrich→orchestrate path, not the pool backfill.
- `AIAnalysis.tsx` progress UI is orphaned and expects a never-written `enrich-unit` job stage — resurrect or delete (Phase 4).
- Rate limiter is per-IP + in-memory: NAT'd schools share the 10/min budget (systemic, revisit if bulk runs 429).

### Phase 3 — content pipeline (original note)
Depends on the existing `generate-exercises` fix plan (`docs/brainstorming/02_FOUNDATION_DEEPDIVE.md` §1: stamp `teacher_id` at unit creation, backfill NULL-owner units, make the orchestrator trigger reliable/re-runnable). Without it, Phases 1-2 still leave practice empty. Also: student RLS on `pool_items`/`objectives` requires per-unit assignment rows — either seed them on enrollment or relax via RPC.

### Phase 4 — polish + backlog (COMPLETED 2026-08-17)
1. ✅ **Power-ups work** (migration `20260817000006`): `student_inventory.quantity` column (the old UNIQUE constraint blocked stacking), atomic `consume_inventory_item` RPC, buys now upsert quantity+1. **Heart Refill** has a Use button in the Shop (refills to 5 via `learnerState.refillHearts`); **Streak Freeze** auto-consumes Duolingo-style when `checkAndUpdateStreak` detects a gap day. Shop shows owned quantities.
2. ✅ **`reach_familiar` quest template seeded** — ExerciseRunner's mastery-lift updates now target a quest that exists (was: progress written to nothing).
3. ✅ **Real XP/accuracy**: PronunciationCoach reports actual attempts (correct/total) on exit; ReadingReader reports quiz results; both feed the reward screen with computed XP. Phonics + SRS exits no longer re-award a second batch of hardcoded XP on top of ExerciseRunner's per-answer awards (double-award removed).
4. ✅ **Mobile CSS foundation**: `pb-safe` (safe-area inset) and `no-scrollbar` utilities finally defined in `index.css` (they were used but never existed); `viewport-fit=cover` on the student/parent/teacher entries; DubbingStudio + onboarding use `h-dvh`/`min-h-dvh` (no more toolbar clipping).
5. ✅ **Touch ergonomics**: 44px tap targets on media controls; keyboard no longer auto-pops over TypeTranslate/Dictation on touch devices (`pointer: fine` gate); UpdatePrompt banner sits above the mobile bottom nav.
6. ✅ **Dead code removed**: orphaned `AIAnalysis.tsx` (expected a never-written job stage) and the mock student `Login.tsx` demo wizard + its route; the never-used `isFullScreenApp` computation.

### Post-audit fixes (2026-08-17, owner reports)
1. ✅ **Voice recognition broken in Chrome (region-blocked Web Speech)**: Chrome's Web Speech API routes audio via Google, which is unreachable from the owner's region — every mic attempt died with a `network` error. `startPronunciationCheck` now falls back to a MediaRecorder + server-STT path on `network`/`service-not-allowed` (and when Web Speech is absent): records with silence detection, sends audio to `evaluate-pronunciation`, which transcribes via the region-safe OpenRouter audio model (`STT_PROVIDER=openrouter-audio`, `STT_AUDIO_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` — the only region-safe audio model on OpenRouter today; swap the env when a better one appears). Edge accepts an `audioFormat` for Safari mp4 recordings. Free-tier model — accuracy is best-effort; verify on device.
2. ✅ **Students saw Draft units** (migration `20260817000007`): the student branch of `units_select_policy` (and `get_unit_bundle`, plus the enrollment branches on objectives/pool_items/assets/srs templates) now requires `units.status = 'Active'` — students see only published units; teachers still see their Drafts.

### Phase 4 — leftover backlog
- i18n consistency for student child screens (still hardcoded English while the shell uses `t()`).
- Student onboarding is reachable only via the hub `/onboarding/student` — not linked from the student app.
- Teacher cross-tenant read breadth (`is_teacher_or_admin()` on objectives/pool_items allows any teacher to read any school's pools) — flag for a future tenancy pass.
- Rate limiter per-IP + in-memory (NAT'd schools share 10/min).
