# AUDIT_ROADMAP_2026-08-02 — Professor Reaudit & Completion Roadmap

> **Status:** Canonical "what's left" list. Read at session start alongside `docs/FIXPLAN_INDEX.md` and `LIVE_GAME_LIFECYCLE.md`.
> **Audit date:** 2026-08-02 · **Head commit audited:** `b8ed4c6`
> **Supersedes** the scattered/stale audit `.md` files at repo root (those will be archived in P3-6; not deleted in this doc's scope).
> **Cross-reference** `qoder_tasks/README.md` Batch 2+ so items are not double-tracked.

---

## 0. Method & scope

Three parallel Explore agents audited the app on 2026-08-02, each verifying findings against **current source** (not commit messages or docs, since `docs/brainstorming/QODER_AUDIT.md` found commit narratives overstate completion):

- **Axis 1 — Frontend / UX:** 4 build entries, SessionContext live loop, all `Board*.tsx` templates, per-portal apps, services.
- **Axis 2 — Backend / data integrity:** 13 edge functions, 84 migrations, `_shared` helpers, RLS, Stripe, AI calling, the generation pipeline.
- **Axis 3 — Architecture / completeness:** feature inventory per role, TODO/FIXME sweep, testing/tooling/CI, docs-vs-code drift, deployment readiness.

**Corrections to prior docs (AGENTS.md etc.):**
- Migration count is **84 on disk**, not 65 (8 added 2026-07-29 → 2026-08-02). Newest is `20260802000003_content_tables_rls_authenticated.sql`. The cloud-vs-repo drift appears resolved.
- **FIXPLAN A/B/C is landed** in code. Board scoring (`addPoints`/`scoreForAttempt`), `broadcast:{self:false}`, `BoardSoundLayer`, action-string matching, roster cascade archive — all verified present and correct.
- The `generate-exercises` 0-rows bug is **mitigated for new uploads** (via `assertOwnership.ts`), but the **NULL-owner backfill migration is still missing** — see P2-1.

---

## 1. Cross-cutting themes

These four patterns recur across findings and are the most important things to internalize before reading the itemized list:

### (a) "Fabricated success" — surfaces that look real but aren't measured
Multiple user-facing surfaces render plausible data that has no basis in actual measurement. For an **educational reporting** product this is the highest-trust risk — parents and teachers make decisions off numbers that are fabricated or placeholder:

- `AIAnalysis.tsx` cycles 4 hardcoded strings on a `setInterval` (ignores the `generation_jobs` table that now exists).
- `ParentDashboard.tsx` weekly-activity + "struggle areas" charts are `xp / N` divisions, not real per-skill mastery or activity history.
- `evaluate-pronunciation` reports `emotionMatch` and `timing` as if measured — they're derived from string similarity (no prosody/pitch analysis).
- `BoardPoll.tsx` has no voting handler — bars animate to 0% every time.
- `VoiceCommandModal.tsx` has no SpeechRecognition — it types canned phrases.
- `DubbingGallery.tsx` shows a 🎬 emoji "player" with hardcoded `0:12 / 0:45`.

### (b) RLS hardening has regressed twice
The answer-leak fix in `20260628000005_rls_hardening.sql` removed `OR auth.role() = 'authenticated'` from `objectives`/`pool_items` (it let any student read every unit's answers). The newest migration `20260802000003` **re-added that exact clause** to the newer content tables (`vocabulary_items`, `story_pages`, `dialogue_lines`, `grammar_rules`) — whose `grammar_rules.error_examples[].correct`, distractors, and comprehension answers are equally sensitive. Additionally `assets` is still `USING(true)` to **anon**. Net: any authenticated student can read every unit's answer-key content + every generated asset today.

### (c) Generation pipeline is observable but not self-healing
`generation_jobs` now records failures (good), but: nothing retries `failed` jobs automatically; the trigger to `generate-exercises` is still a detached, un-awaited `fetch` that re-uses the caller's short-lived JWT; the NULL-owner backfill never landed (~14 legacy units still can't publish); and `enrich-unit` overwrites the *whole* `manifest` JSONB on each write, deleting sibling keys like AssetWorkshop's `knowledge_graph` (the B7 dual-shape drift).

### (d) AI spend is unbounded
Per-isolate in-memory rate limiting (`_shared/rateLimit.ts`) is trivially defeated by Supabase's multi-isolate scaling (effective limit = `maxRequests × isolate_count`); `generate-media` performs **no ownership check**; `ai_credits_balance` is read for display but **decremented nowhere**. One compromised account (or one manager invite bypass, P1) drains the OpenRouter / ElevenLabs / image-gen budget with no metering gate.

---

## 2. Prioritized roadmap (35 items)

### P0 — Blockers for any paid launch (4)

| ID | Issue | Evidence | Fix direction |
|---|---|---|---|
| **P0-1** | **Billing is not enforced at all.** Advertised "3 classes / 10K AI credits" (Free) and "Unlimited / 50K" (Pro) are fictional. No `subscription_tier` gate anywhere in `apps/` or `services/`. `ai_credits_balance` is read by `subscription-status` for display but decremented nowhere. Free users can create unlimited classes + run unlimited AI. | `services/BillingService.ts`, `apps/teacher/BillingSettings.tsx:23-44`, `subscription-status/index.ts:39` | Add a tier-check helper; gate class creation + AI-invoking functions (`enrich-unit`, `generate-exercises`, `generate-media`, `evaluate-pronunciation`) against `ai_credits_balance` and class count; decrement credits on each AI call; surface upgrade prompts. |
| ~~**P0-2**~~ | ~~**Per-portal entries have no auth gate or profile hydration.**~~ FIXED 2026-08-03: `AuthGate.tsx` created + mounted in all 4 entries; `adminEntry` now routes to `AdminPortal` (manager/admin split works). | ~~`adminEntry.tsx`, `teacherEntry.tsx`, `studentEntry.tsx`, `parentEntry.tsx`~~ | ~~Track 3 (auth)~~ |
| ~~**P0-3**~~ | ~~**RLS regression re-leaked answer keys**~~ FIXED 2026-08-03: migration `20260803000001` drops `auth.role()='authenticated'`, restores enrollment-scoped policy + revokes anon SELECT. | ~~`20260802000003_content_tables_rls_authenticated.sql:18-58`~~ | ~~Track 1 (security)~~ |
| **P0-4** | **Stripe webhook has 3 correctness bugs.** (a) No event-id idempotency → redeliveries double-insert `billing_history` (UNIQUE throws → 400 → Stripe retries → amplification loop). (b) `handleSubscriptionUpdate` has a dead `customers.list` call and silently no-ops if `stripe_customer_id` wasn't stamped. (c) Client polls `subscription-status` for a tier the webhook writes *asynchronously* → users see "upgrade failed" right after paying. | `supabase/functions/stripe-webhook/index.ts:49-63, 106-143`; `create-checkout/index.ts:57-67`; `subscription-status/index.ts:20-24` | (a) `processed_events` table with `ON CONFLICT DO NOTHING`. (b) Resolve userId from customer `metadata.supabuse_user_id`, upsert by `id`. (c) In `subscription-status`, reconcile from Stripe API if `stripe_subscription_id` exists; return `pending` rather than stale `free`. |

### P1 — Trust & correctness (functional but wrong/misleading) (11)

| ID | Issue | Evidence |
|---|---|---|
| ~~**P1-1**~~ | ~~AIAnalysis progress screen is fake~~ FIXED 2026-08-03: rewritten to poll `generation_jobs` with real failure UI + stall detection. | ~~`apps/teacher/AIAnalysis.tsx:11-24`~~ |
| ~~**P1-2**~~ | ~~ParentDashboard charts fabricated~~ FIXED 2026-08-03: real `point_transactions` + FSRS mastery via `services/parentAnalytics.ts`. | ~~`apps/parent/ParentDashboard.tsx:61-76`~~ |
| ~~**P1-3**~~ | ~~Pronunciation emotion/timing fabricated~~ FIXED 2026-08-03: fields removed from edge function + client; honest Levenshtein score kept. | ~~`evaluate-pronunciation/index.ts:96, 120, 135-136`~~ |
| ~~**P1-4**~~ | ~~VoiceCommandModal is mock theater~~ FIXED 2026-08-03: flag-gated off (`VITE_ENABLE_VOICE_COMMANDS=false`), MOCK header added. | ~~`apps/remote/VoiceCommandModal.tsx:33-86`~~ |
| ~~**P1-5**~~ | ~~DubbingGallery + DubbingStudio are static mock UI~~ FIXED 2026-08-03: flag-gated off (`VITE_ENABLE_DUBBING=false`), MOCK headers added. | ~~`apps/parent/DubbingGallery.tsx:159-219`~~ |
| ~~**P1-6**~~ | ~~BoardPoll has no voting handler~~ FIXED 2026-08-03: removed outright (no student device surface). | ~~`apps/board/templates/BoardPoll.tsx:8-13, 104-160`~~ |
| **P1-7** | `assets` table near-empty despite heavy generation — insert errors silently swallowed (`.catch(()=>{})` at `imageGen.ts:100`); vault empty → media picker can't reuse → duplicate image spend. | `supabase/functions/_shared/imageGen.ts:100` (verify task-03 claim actually surfaced errors) |
| **P1-8** | AI spend unbounded: rate limiting per-isolate (defeated by multi-isolate scaling) + `generate-media` has **no ownership check** + no credit metering. One compromised account drains the budget. | `_shared/rateLimit.ts:1-32`; `generate-media/index.ts:24-71` |
| ~~**P1-9**~~ | ~~Permissive RLS still live~~ FIXED 2026-08-03: migration `20260803000004` tightens assets/srs_items/parent_student_links. | ~~`20260417000002:20`; `20260517000001:8-15`; `20260320000003:146`~~ |
| ~~**P1-10**~~ | ~~Blocking FKs block user deletion~~ FIXED 2026-08-03: migrations `20260803000002` + `20260803000003` add ON DELETE SET NULL. | ~~`20260420000003:5`; `20260730000006:82`; `manage-school-members/index.ts:229-236`~~ |
| ~~**P1-11**~~ | ~~`audit_logs` missing GRANT + mis-named policy~~ FIXED 2026-08-03: migration `20260803000002` adds GRANT + tightens to admin-only. | ~~`20260420000003:5, 21-29`~~ |

**Smaller correctness items folded into this tier:**
- Reports silently renders all-zeros on fetch failure (`apps/teacher/Reports.tsx:42-75`) — no error UI; teacher believes "0% mastery."
- StudentApp fires `getStudentProgress()` etc. before `userId` resolves; combined with P0-2 an unauthenticated `/student` load fires them with no user (`apps/student/StudentApp.tsx:80-112`).
- `BoardSpeedQuiz` penalizes the picked student when the teacher taps "Reveal" — `handleAnswer(-1)` runs the wrong-answer branch including `-MISTAKE_PENALTY` + `mistakesRef++` (`apps/board/templates/BoardSpeedQuiz.tsx:101, 125-148`).
- `BoardTeamBattle` uses interpolated Tailwind classes (`border-${color}-500`, `bg-${color}-500`, etc.) that JIT purges → team rails render with no color/border/glow (`apps/board/templates/BoardTeamBattle.tsx:367, 370-373`).
- ParentSettings dead buttons (avatar edit, "Edit" profile, "Help Center" rows; notification toggles flip local state never persisted) — `apps/parent/ParentSettings.tsx:68, 76, 129, 141, 177`.

### P2 — Pipeline integrity & completeness gaps (10)

| ID | Issue | Evidence |
|---|---|---|
| **P2-1** | **NULL-owner backfill never landed.** `assertOwnership` is strict in code but no migration backfills the ~14 legacy NULL-owner `units`; they still can't publish. Trigger is fire-and-forget (re-uses caller's short-lived JWT, no auto-retry). | `orchestrate-lesson/index.ts:556-595`; `assertOwnership.ts:51-65`; `UploadTextbook.tsx:331` |
| **P2-2** | `enrich-unit` overwrites the *whole* `manifest` JSONB on each write → deletes sibling keys (e.g. AssetWorkshop's `knowledge_graph`). Root of the B7 dual-shape drift. | `enrich-unit/index.ts:721-735` |
| **P2-3** | Phase-2 "Unified Unit Studio" is a wrapper, not a unification — embeds `<UnitContentVault/>` + `<PlanComposer/>` with 3 independent save buttons; `AssetWorkshop` still navigates OUT to a separate route. Plan §2 exit criterion ("one component, one data contract, one save path") unmet. | `apps/teacher/UnitStudio.tsx` |
| **P2-4** | `unit_media` many-to-many table is schema-only (0 rows) — producers never write to it → media not reusable cross-unit; only `assets.unit_id` (single FK) links them. | `20260730000006`; `_shared/imageGen.ts`, `tts.ts` |
| **P2-5** | `content_review_status` is write-only — AssetWorkshop persists approvals but nothing reads it to gate downstream consumption ("don't show un-reviewed vocab in live games"). | `20260730000008`; `apps/teacher/AssetWorkshop.tsx` |
| **P2-6** | `activity_type_registry` is a filter, not a driver — generate-exercises never reads `generator_key`; loads registry only to filter its own hardcoded builders. Adding an activity type still requires code. The "extensibility win" is unmet. | `20260730000007`; `generate-exercises/index.ts` |
| **P2-7** | Reconciliation is full re-run — editing one vocab word re-runs `generate-exercises` for the whole unit + burst image-gen for every imageless word. Functionally correct, cost-wise sloppy. | `apps/teacher/UnitContentVault.tsx` save path |
| **P2-8** | YouTube region block + CSP `frame-src 'none'` → song/video path degrades to a search URL and can't even embed a pasted watch URL. | `generate-media/index.ts:57-66`; `vercel.json:14` |
| **P2-9** | Prompt-injection surface — raw textbook text concatenated into AI prompts with no fencing; injected content reaches `vocabulary_items`/`grammar_rules`/YouTube `search_query` served to children. | `enrich-unit/index.ts:387-400`; `orchestrate-lesson/index.ts:377` |
| **P2-10** | Misc data drift: `units` has `last_updated` but the `set_updated_at` trigger never fires for it (column-name mismatch); many tables with `updated_at` (schools, roster_students, classroom_sessions, etc.) have no trigger; `extract-page` returns `success:true` with placeholder text on AI failure (then fed to enrichment as real content); `generate-lesson` returns Dicebear placeholder URLs on failure. | `20260502000000:65-83`; `extract-page/index.ts:30-42, 128-139`; `generate-lesson/index.ts:133, 195, 248` |

### P3 — Dev quality, DX & polish (10)

| ID | Issue | Evidence |
|---|---|---|
| **P3-1** | **No ESLint, no Prettier.** `npm run lint` is aliased to `tsc --noEmit`. No `.eslintrc`/`eslint.config.js`/`.prettierrc`, none in deps. No style/format gate in CI. | `package.json:10, 39-58` |
| **P3-2** | **TypeScript not strict; ~588 `any` usages.** `tsconfig.json` omits `strict`/`noImplicitAny`/`strictNullChecks`/`noUncheckedIndexedAccess`. `SessionAction.payload?: any` (`SessionContext.tsx:24`) leaves the entire command bus untyped — exactly the discriminated-union FIXPLAN D wanted. | `tsconfig.json:1-31`; hotspots `UnitContentVault.tsx` (42), `generate-exercises/index.ts` (28), `enrich-unit/index.ts` (26), `manifest.ts` (26) |
| **P3-3** | **E2E tests smoke-only.** 32 tests all assert "loads/renders"; no upload→generate→play, no Stripe→tier, no edit→pool-reconcile. `generative.spec.ts` uses `waitForTimeout(3000)`. No test-DB seeding. | `e2e/*.spec.ts`; `e2e/generative.spec.ts:1-12`; `.github/workflows/ci.yml:45-52` |
| **P3-4** | **Accessibility effectively absent.** 4/117 tsx files have any `aria-*`; 9 have keyboard handlers. No `eslint-plugin-jsx-a11y`, no a11y assertion in tests. Legal/usability risk for classroom-projection + young-learner product. | `apps/**`, `components/**` |
| **P3-5** | **Spanish i18n incomplete.** `locales/es.json` 108 keys vs en/zh 123; ~15 keys render as raw strings or fallback English. No CI parity check. | `locales/es.json`, `locales/en.json`, `locales/zh.json` |
| **P3-6** | **Repo hygiene.** `supabase/.temp/*` (project-ref leak) and `tsconfig.tsbuildinfo` (380 KB) tracked in git; `<title>` still "Lesson Orchestrator Prototype"; `index.tsx` entry uses non-conventional name; 50+ redundant/stale `.md` at repo root (some contradict current code). | `git ls-files supabase/.temp`; `index.html:5`; repo root |
| **P3-7** | **Observability gaps.** Sentry DSN empty by default in `.env.example`; structured `logger.ts` not forwarded as Sentry breadcrumbs; `llm_telemetry` grows unbounded (no retention / pg_cron not configured). | `.env.example:3`; `services/logger.ts:37-60`; `services/errorReporting.ts:30`; `20260423000000_llm_telemetry.sql` |
| **P3-8** | **No DB backup/restore runbook.** Generated content (`assets`/`pool_items`/`vocabulary_items`) cost real money to regenerate; no RPO/RTO/PITR doc, no periodic content export. | repo-wide |
| **P3-9** | **Scattered direct `supabase.from()` in components** (7 files) bypassing the centralized `services/*` + TanStack Query cache — consistency + missed error handling + refetch storms. | `apps/parent/ParentOnboarding.tsx:62`, `apps/student/DubbingStudio.tsx`, `apps/teacher/{AssetWorkshop,UnitContentVault,UnitStudio,UploadTextbook}.tsx`, `apps/board/ClassWeakBanner.tsx`, inline reads in `StudentApp.tsx:93-99, 194-200`, `Reports.tsx:25` |
| **P3-10** | **Dead decorative buttons** (the FIXPLAN-D cleanup was deferred). TeacherRemote "Action"/camera "Flip"/bottom-nav "Class"+"Settings" (`apps/remote/TeacherRemote.tsx:429-434, 569, 492-503`); ParentSettings (see P1); `BoardTeamBattle.pickStudent` defined-never-called dead code (`:140-146`). Command bus is still `type: string`, not a discriminated union. | `apps/remote/TeacherRemote.tsx`; `apps/board/templates/BoardTeamBattle.tsx:140`; `store/SessionContext.tsx:24` |

---

## 3. What's genuinely done and solid (don't re-break these)

So the roadmap isn't purely negative — these subsystems are complete and verified working, and any fix work must not regress them:

- **Auth + multi-role dispatch** (Supabase auth, `onAuthStateChange`, role guard, Hub dispatcher) — *modulo* the per-portal entry gap (P0-2).
- **The full live-session loop** — 3-tab realtime sync (`classroom_live` broadcast + `classroom_session_sync` postgres_changes), `broadcast:{self:false}`, pick→play→score→next, the 4-things lifecycle contract correctly implemented across all 6 scored board games (`useEffect` reset on `currentTurnId`, `mistakesRef`+`awardedRef`, `addPoints`+`scoreForAttempt`, personalized message via `usePickedStudent`).
- **18 board templates** + `ClassroomBoard` router; remote↔board action strings all matched (the historical mismatches FIXPLAN B called out are fixed).
- **FSRS + the 12-type student exercise battery** (`services/fsrs.ts` 344 L with 8.9 KB of tests; `apps/student/exercises/*` + registry).
- **Hearts/energy** (`student_hearts` migration, `GamificationService`).
- **Roster & student management** with cascade archive (FIXPLAN C landed; `archive_roster_cascade` migration).
- **Attendance** (occurrences, walk-ins, history, 2 migrations, `AttendanceService`).
- **Multi-tenancy** (`classes_school_scoping` + `units_tenant_isolation`, `is_school_manager(uuid,uuid)`).
- **Stripe checkout + customer portal mechanics** (`create-checkout`, `customer-portal`, `BillingService`) — *modulo* the webhook bugs (P0-4).
- **Generation pipeline** (now that B1/B1b/VOCAB-EMIT/ORCH-DRIFT landed): `extract-page` → `enrich-unit` (writes `vocabulary_items` relationally) → `orchestrate-lesson` (reads `story_pages`/`grammar_rules`/`dialogue_lines` relationally) → `generate-exercises` → `generate-media`. 589 `pool_items` live per QODER_AUDIT.
- **Sentry error reporting** (tracing + replay + user tagging, wired in `App.tsx:80-88` + all 4 entries).
- **PWA prompt-mode update flow** (`registerType:'prompt'`, no `skipWaiting`, `UpdatePrompt.tsx` mounted in every entry) — load-bearing per AGENTS.md §8.1; do not revert.
- **34 unit tests** (FSRS, services, contexts, components) running in CI.

---

## 4. Completion scorecard

Status: ✅ Complete · ◐ Partial · ◇ Stub · ❌ Missing

| Feature | Role | Status | Evidence |
|---|---|---|---|
| Multi-entry SPA | All | ✅ | `vite.config.ts:15-22`, `vercel.json:27-48` |
| Auth + role guard | All | ✅ | `App.tsx:80-148` + `AuthGate.tsx` (P0-2 FIXED) |
| Onboarding | All | ✅ | `apps/{teacher,student,parent}/%Onboarding.tsx` |
| Textbook upload + OCR | Teacher | ✅ | `UploadTextbook.tsx`, `extract-page` |
| **AIAnalysis progress UI** | Teacher | ✅ | real `generation_jobs` polling — P1-1 FIXED |
| AI enrichment | Teacher | ✅ | `enrich-unit` (but see P2-2) |
| Lesson/flow orchestration | Teacher | ✅ | `orchestrate-lesson` |
| Exercise generation | Teacher | ✅ | `generate-exercises` |
| Generation-job tracking | System | ✅ | `generation_jobs` (but no retry — P2-1) |
| **Unified Unit Studio** | Teacher | ◐ | wrapper not unification — P2-3 |
| Knowledge-graph editors | Teacher | ◐ | `UnitContentVault` + `AssetWorkshop` (separate routes) |
| Content review status | Teacher | ◐ | write-only — P2-5 |
| Lesson timeline / Plan composer | Teacher | ✅ | `PlanComposer.tsx` |
| Live session command bus | Teacher | ✅ | `SessionContext`, `LIVE_GAME_LIFECYCLE.md` |
| Board projector (18 templates) | Teacher | ✅ | `apps/board/templates/Board*.tsx` (BoardPoll removed — P1-6 FIXED) |
| Teacher remote (2nd device) | Teacher | ✅ | `TeacherRemote.tsx` (but see P3-10 dead buttons) |
| Live commander (desktop) | Teacher | ✅ | `LiveCommander.tsx` |
| Cross-tab realtime sync | Teacher | ✅ | 2 channels |
| Roster + cascade archive | Teacher | ✅ | `ClassManagement.tsx`, FIXPLAN C |
| Attendance | Teacher | ✅ | `AttendanceModal`, `AttendanceService` |
| Class points ledger | Teacher | ✅ | `point_transactions` writes |
| Spaced repetition (FSRS) | Student | ✅ | `services/fsrs.ts` + tests |
| Hearts/energy | Student | ✅ | `student_hearts`, `GamificationService` |
| Student exercise battery (12 types) | Student | ✅ | `apps/student/exercises/*` |
| Student home map / gamification | Student | ✅ | `HomeMap`, `GamificationService`, Shop/Quests/Leaderboard |
| **Pronunciation evaluation** | Student | ✅ | honest Levenshtein scoring (P1-3 FIXED — fabricated fields removed) |
| Student reading reader | Student | ✅ | `ReadingReader.tsx` |
| **Student dubbing studio** | Student | ◇ | mock UI — P1-5 flag-gated off (P2-8 still open) |
| **Parent dashboard** | Parent | ✅ | real charts via `parentAnalytics.ts` (P1-2 FIXED) |
| Parent reports | Parent | ✅ | `ParentReports.tsx` |
| Parent messaging | Parent | ✅ | `ParentMessages.tsx`, `TeacherMessages.tsx` |
| Parent↔student linking + approval | Parent | ✅ | `parent_links`, `decide_parent_roster_link` |
| District admin dashboard | Admin | ✅ | `DistrictAdminDashboard.tsx` (real aggregates) |
| Manager dashboard | Admin | ✅ | `ManagerDashboard.tsx` (P0-2 FIXED — AuthGate + AdminPortal routing) |
| School/member management | Admin | ✅ | `manage-school-members` (but see P1-9 invite-bypass) |
| Multi-tenancy isolation | System | ✅ | scoping migrations |
| Stripe checkout + portal | Teacher | ✅ | mechanics (but see P0-4) |
| Stripe webhook | System | ✅ | mechanics (but see P0-4) |
| Subscription status | Teacher | ✅ | display only |
| Billing plans UI | Teacher | ✅ | `BillingSettings.tsx` |
| **Billing enforcement / gating** | Teacher | ❌ | no tier gate — P0-1 |
| Reports / analytics (class mastery) | Teacher | ✅ | real FSRS mastery via `Engine.getClassMasteryCounts` |
| Assignments | Teacher | ✅ | `assignments` table |
| Resource library / vault | Teacher | ✅ | wired to `assets` (mock removed) |
| **Media picker** | Teacher | ◐ | built but invoked from ~1/5 promised fields — QODER_AUDIT |
| Character system | Teacher | ✅ | `characters`/`unit_characters`, `CharacterPickerModal` |
| TTS (ElevenLabs) | System | ✅ | `_shared/tts.ts`, on-demand |
| Image generation | System | ✅ | `_shared/imageGen.ts` (but see P1-7) |
| Error monitoring (Sentry) | System | ✅ | `errorReporting.ts` |
| Structured client logging | System | ◐ | not shipped to Sentry breadcrumbs — P3-7 |
| Perf monitoring | System | ✅ | `perfMonitor.ts` |
| PWA (prompt-mode SW) | System | ✅ | `UpdatePrompt` in every entry |
| i18n (en/es/zh) | All | ◐ | es locale incomplete — P3-5 |
| Accessibility (WCAG) | All | ◇ | effectively absent — P3-4 |
| Offline support | All | ◐ | PWA shell + workbox for fonts/dicebear; no offline data sync |
| Unit testing | Dev | ✅ | 34 vitest files |
| **E2E testing** | Dev | ◐ | smoke-level only — P3-3 |
| **CI** | Dev | ◐ | no lint step, no coverage gate — P3-1 |
| **Type safety** | Dev | ◐ | not strict, ~588 `any` — P3-2 |
| **Linting / formatting** | Dev | ❌ | none — P3-1 |

---

## 5. Coordination note (for parallel sessions)

- This roadmap is **non-overlapping by default** with the generation-pipeline work in progress in the other session. Shared files — anything under `supabase/migrations/`, `supabase/functions/_shared/`, and the `enrich-unit` / `orchestrate-lesson` / `generate-exercises` functions — **must be read before edit** to avoid conflicts.
- Before picking up any item, check `qoder_tasks/README.md` Batch 2+ so nothing is double-tracked.
- **P0-3 (RLS regression) and P2-1 (NULL-owner backfill)** are the two items most likely to overlap with pipeline work — coordinate explicitly if touching either.
- **P0-1 (billing), P0-2 (per-portal auth), P3-1/P3-2/P3-3/P3-4 (dev quality)** are cleanly isolated and safe to take without coordination.

### Execution tracks (2026-08-03) — detailed implementation plans

Four parallel-ready track plans have been written under `docs/track-plans/`. Each is self-contained (current-state facts, file boundaries, steps, verification, coordination notes, open questions) so a Qoder session can pick one up without re-deriving context. **File boundaries are exclusive** — no two tracks edit the same file by default.

| Track | Plan doc | Scope (roadmap IDs) | Files owned (exclusive) | Overlap risk |
|---|---|---|---|---|
| **1 — Security** | [`TRACK_1_SECURITY_2026-08-03.md`](track-plans/TRACK_1_SECURITY_2026-08-03.md) | P0-3, P1-9, P1-10, P1-11 | 4 new migration files only | Only if pipeline session writes RLS (coordinate timestamps) |
| ~~**2 — Billing**~~ | [`TRACK_2_BILLING_2026-08-03.md`](track-plans/TRACK_2_BILLING_2026-08-03.md) | ~~P0-1, P0-4~~ | — | **PARKED 2026-08-03** — billing policy undecided; may not use Stripe. Revisit when policy is set. |
| **3 — Auth** | [`TRACK_3_AUTH_2026-08-03.md`](track-plans/TRACK_3_AUTH_2026-08-03.md) | P0-2 | `components/shared/AuthGate.tsx` (new), 4× `*Entry.tsx` | None — fully isolated |
| **4 — Fabrication** | [`TRACK_4_FABRICATION_2026-08-03.md`](track-plans/TRACK_4_FABRICATION_2026-08-03.md) | P1-1, P1-2, P1-3, P1-4, P1-5, P1-6 | `AIAnalysis.tsx`, `ParentDashboard.tsx`, `BoardPoll.tsx`, `evaluate-pronunciation/index.ts`, `VoiceCommandModal.tsx`, `DubbingGallery/Studio.tsx` | `evaluate-pronunciation` — no longer contested now that Track 2 is parked |

**Recommended sequence:** Track 1 Step 1 (P0-3, the live answer-key leak) **solo first** — it's actively bleeding and is one migration. Then fan out Tracks 1/3/4 in parallel Qoder sessions (Track 2 Billing is **parked** — billing policy undecided, may not use Stripe). **P2 (pipeline) waits for the other session; P3 (dev quality) runs after feature freeze** (ESLint/strict-TS touch every file and conflict with everything).

---

## 6. How to use this doc

When a future session is asked to "fix something" or "continue the roadmap," the workflow is:
1. Read this doc + `docs/FIXPLAN_INDEX.md` + `LIVE_GAME_LIFECYCLE.md` at start.
2. Pick an item by ID (P0-x → P1-x → P2-x → P3-x in priority order, or as the user directs).
3. Read the cited `file:line` evidence in current source (don't trust this doc blindly — code may have moved since 2026-08-02).
4. Plan the fix, coordinate on shared files, implement, verify.
5. Mark the item done here (strike-through + commit ref) when landed.
