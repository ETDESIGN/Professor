# Deep Audit — 2026-08-28

Full-app read-only audit (teacher UI, student/parent/admin apps, data layer, edge functions, live game system, build/CI/hygiene). No code was modified. Each section cites files/lines.

---

## Top critical findings (P0)

1. **AuthGate public-path check matches every URL** — `components/shared/AuthGate.tsx:8-12`: `PUBLIC_PATHS` includes `'/'` and the check is `startsWith`, so every path is "public". Unauthenticated users are never redirected to login; `/admin` renders its full shell to anonymous visitors (only RLS keeps it data-empty). The guard is decorative.

2. **Undeployed edge functions called by the frontend** — `apps/teacher/UnitizationEditor.tsx:51,132` invokes `propose-unitization` and `apply-unitization`; neither is in the deployed set. Every unitization call 404s in production. (This may be the other session's in-flight work — verify before "fixing".)

3. **Edge-function authorization gaps**:
   - `rebuild-unit/index.ts:85-91` — NULL-owner units are claimed by *whoever calls rebuild first* (any authenticated role, including student passports).
   - `evaluate-pronunciation/index.ts:82-121` — with no STT provider (the default), the client-supplied `transcript` fully determines the score → trivially cheated.
   - `generate-media/index.ts:89-131` and `generate-lesson/index.ts:26` — no ownership/role check at all; any authenticated user can burn OpenRouter/ElevenLabs credits.

4. **`.env` is committed to git** with a real Supabase URL + anon key (tracked since before the ignore rule). Remove from history and rotate if RLS confidence is low. `API_KEY_RESTORED.md` narrates past key handling — scan git history for old secrets.

5. **Unit test suite is red → CI on master is failing**: 12 failed / 461 passed. Stale tests: `test/BoardComponents.test.tsx` (7, expects removed UI text) and `test/DataService.test.ts` (5, mock schema drift). CI signal is currently dead noise.

6. **Dead/fake user flows (teacher)**: Reports page has 5 dead buttons incl. a decorative timeframe dropdown (`apps/teacher/Reports.tsx:87-217`); DashboardHome "View All" dead + hardcoded "Good Morning" + fake "Up Next" (`DashboardHome.tsx:32,167`); "Generate from Topic" CTA silently routes to the upload flow (`UnitList.tsx:950` → `TeacherDashboard.tsx:254`); the entire Passports feature (screen + cards + spec) is unreachable (`apps/teacher/Passports.tsx`).

7. **Parent "Link Student Account" navigates to a route that doesn't exist** — `ParentDashboard.tsx:123` → `/parent/connect`, unrouted (`ParentApp.tsx:65-74`); a parent with no children is in a permanent dead-end loop. `ParentConnect.tsx` exists but is routed nowhere.

---

## Bugs (P1)

### Teacher portal
- `UploadTextbook.tsx:121-138` — stale-closure: unit-title-from-book logic reads the pre-scan `pages` snapshot → silently no-ops; unhandled `.then()` on the unit rename.
- `UnitList.tsx:302-318` — Plan/Launch/EditEnrichment have no rejection handling; a failure inside the `setTimeout` leaves loading stuck for all cards at once.
- `UnitStudio.tsx:120-248`, `ExtractionReview.tsx:218-275` — `try/finally` without `catch`; generate/publish/crop/confirm failures give zero user feedback (buttons look dead).
- `Assignments.tsx:26-41` — failed assignment creation only `log.warn`s (no toast, modal stays open); due-date unvalidated; active/scheduled tab logic conflates states.
- `teacherEntry.tsx:42-48` — unknown `/teacher/*` URLs render a blank sidebar shell (no 404).
- `UnitizationEditor.tsx:162-175` — success-screen "Open" buttons don't open the units; everything navigates back to the list.
- `Reports.tsx:230` — in-render `.sort()` mutates state (StrictMode hazard).

### Student app
- **Gamification economy races**: `GamificationService.ts` awardXP/awardGems/spendGems/claimQuestReward are select-then-update with no RPC → lost updates and double-claimable quests (`Quests.tsx:141` has no pending-disable).
- **Shop money loss**: `GamificationService.ts:308-330` debits gems then upserts inventory; upsert failure = gems gone, no refund (the toast even claims otherwise). Plain upsert also resets `quantity` to 1 — buying 2 of an item leaves you with 1.
- **Gems counter never loads**: `StudentApp.tsx:83-115` fetches streak/xp/level but never gems — returning students see 💎0 until a lesson completes.
- Stuck spinners on data failure: `SpacedRepetition.tsx:23-33`, `PracticeMenu.tsx:19-26`, `Leaderboard.tsx:17-28` (no catch, no empty state).
- `AuthService.ts:66-90` — missing profile row is silently self-healed as `role: 'student'`, permanently locking out teachers/managers.
- Draft units leak to the student map (`SupabaseService.ts:75-107` — no status filter; only `Locked` is greyed).
- HomeMap "Daily Quests" card is fabricated from lifetime XP/lessons (`HomeMap.tsx:38-135`), contradicting the real `student_quests` data on the Quests tab.
- Shop cosmetics can never be equipped — `AvatarBuilder.tsx` doesn't reference inventory at all.

### Parent app
- Messaging dead-ends when no teacher resolves, always targets `students[0]`'s teacher, no polling/realtime (`ParentMessages.tsx:33-101`); all failures swallowed.
- Reports are cosmetic: skill radar = `xp ÷ magic-number`, "Teacher's Note" is a template attributed to the parent's own name, Share button never touches the clipboard, "Time Learned = xp/10" is invented (`ParentReports.tsx`, `ParentDashboard.tsx:216`).

### Edge functions / backend
- **Stripe webhook has no event-id idempotency** — replays duplicate `billing_history` rows; unknown price IDs silently downgrade to `'free'`; dead `customers.list` call; checkout trusts client `priceId` + `successUrl`/`cancelUrl` (open redirect) (`stripe-webhook/index.ts`, `create-checkout/index.ts:30-65`, `customer-portal/index.ts:41-44`).
- `enrich-unit/index.ts:1004-1299` — "atomic" manifest merge is read-modify-write (parallel category enrichments erase each other); story questions/dialogues are delete-then-insert with swallowed insert errors → permanent data loss reported as success.
- `scan-page/index.ts:111-131` — non-idempotent `book_pages` inserts; retries orphan duplicate rows.
- `_shared/edgeHandler.ts:104-107` — raw internal error messages returned to clients (can leak keys/SQL).
- CORS allow-list is dead code — everything returns `*` (`_shared/cors.ts`).
- `student-passports` — check-then-insert race can mint two users per roster row; `Math.random()` passwords instead of `crypto.getRandomValues()`.

### Data layer
- **~30 call sites destructure away Supabase `error`** — failures read as "empty". Worst: `getHearts` returns full hearts on error (`learnerState.ts:274`); media dedup failure causes duplicate paid generation (`MediaService.ts:62,105`).
- **Unowned units visible to all teachers**: `SupabaseService.ts:132-140` stamps `teacher_id` only if `getUser()` resolved, and the units SELECT policy deliberately exposes NULL-owner rows — a cold-load race creates a unit every teacher can see.
- Trash filtering (`deleted_at`) exists only in RLS and has regressed twice historically; RPC paths (`get_unit_bundle`, SECURITY DEFINER) keep their own checks and can still open trashed units by ID.
- Two pairs of migrations share identical timestamps (20260817000001, 20260819000001) — filesystem-dependent ordering.

---

## Live game system — in good shape

No P0 contract violations. Every scored game complies with the LIVE_GAME_LIFECYCLE 4 rules (NEW_TURN reset, mistake refs, addPoints+scoreForAttempt, personalized message), with two documented deviations (WordSearch keeps its grid across turns by design; TeamBattle has no per-individual message — spec text should be reconciled). Realtime channels are leak-free, timers cleaned, turn tokens prevent late/dupe application.

Remaining issues:
- **P1**: `ContextualControls.tsx:80-372` has no `TEAM_BATTLE` / `GRAMMAR_SANDBOX` cases — desktop commander shows a dead "Presenter Mode Active" panel during Team Battle (the mobile remote has the controls). Mirror `TeacherRemote.tsx:260/391`.
- **P2**: three grammar implementations registered (`GRAMMAR_LAB` new, `Forge`/`Sandbox` legacy); two overlapping wheel implementations (`BoardGameArena` vs `BoardWheelOfDestiny`); FIXPLAN B docs say "awaiting approval" but the code shows B landed — mark docs to prevent double-implementation.

---

## Build / CI / hygiene (P1–P2)

- CI type-check greps out 139 Deno errors instead of excluding `supabase/functions` from tsconfig — locally `npm run lint` can never pass. Fix: `exclude` in `tsconfig.json` or a separate edge tsconfig.
- Playwright starts a dead express server on 3000 while vite runs on 5173 (flag override masks a port collision with the hardcoded `server.port: 3000`).
- **106 .md files at repo root**, including ≥8 overlapping/contradictory audit docs and Gemini-era setup guides (`GOOGLE_API_SETUP.md`, `API_KEY_RESTORED.md`) describing a config that no longer exists. Consolidate into `docs/`, archive the rest.
- Committed junk: `tsconfig.tsbuildinfo`, `classrom shell redesign/` (typo dir with internal duplicate), `migrated_prompt_history/` (~1.9MB), `qoder_tasks/`.
- Empty (0-byte) icons in `public/` (`favicon.ico`, `apple-touch-icon.png`, `masked-icon.svg`) get copied to `dist/` and serve empty in production.
- Fake data rendered as real: hardcoded "Class 3B" on every unit card, "ROOM-304" in LiveCommander, fabricated Dashboard "Recent Activity", parent notification bell with permanent red dot.

---

## Recommended fix order

1. **Security batch**: AuthGate `startsWith` fix; edge-function authz (generate-media/generate-lesson/evaluate-pronunciation ownership, rebuild-unit NULL-owner guard); Stripe webhook idempotency + price/URL allow-lists; remove `.env` from git history + rotate.
2. **Deploy `propose-unitization` / `apply-unitization`** (or confirm the other session owns this).
3. **Dead-flow batch (user-visible wins)**: Reports/DashboardHome buttons, parent connect route, "Generate from Topic", Passports routing, UnitizationEditor "Open", Assignments toast.
4. **Economy integrity**: RPC-ify XP/gems/hearts increments + atomic quest claim + shop refund/quantity; load gems on fetch.
5. **Error-handling sweep**: the ~30 swallowed-error sites + try/finally-without-catch handlers.
6. **Green CI**: fix/rebase the 12 stale tests; tsconfig exclude for Deno; docs consolidation.
7. **Live polish**: ContextualControls TEAM_BATTLE/GRAMMAR_SANDBOX cases; grammar/wheel dedup (workstreams B-docs update, D).
