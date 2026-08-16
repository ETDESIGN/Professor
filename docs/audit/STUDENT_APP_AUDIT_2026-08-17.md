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

### Phase 2 — functional correctness
Leaderboard student view (student-safe view/RPC + fix `(You)` id compare); homework wiring end-to-end (create `student_assignments` rows on assignment/publish; fix update key); shop/quest failure surfacing + remove fabricated fallbacks; retire hub dual mounts; remove legacy SM-2 SRS clone path; FlashMatch/SentenceScramble hooks fix; CSP `frame-src https://www.youtube-nocookie.com` for media steps; remove remaining fake data (Profile/Quests/Settings/Help).

### Phase 3 — content pipeline
Depends on the existing `generate-exercises` fix plan (`docs/brainstorming/02_FOUNDATION_DEEPDIVE.md` §1: stamp `teacher_id` at unit creation, backfill NULL-owner units, make the orchestrator trigger reliable/re-runnable). Without it, Phases 1-2 still leave practice empty. Also: student RLS on `pool_items`/`objectives` requires per-unit assignment rows — either seed them on enrollment or relax via RPC.

### Phase 4 — polish
Mobile CSS (define `pb-safe`/`no-scrollbar`, `viewport-fit=cover`, `h-dvh`), 44px tap targets, drop `autoFocus` on touch, lift UpdatePrompt above bottom nav, i18n consistency for child screens, student onboarding reachability, decide fate of the mock student `Login.tsx`.
