# FIXPLAN H — Post-Audit Fix Batch (Design)

Date: 2026-08-28 · Source audit: `docs/audit/DEEP_AUDIT_2026-08-28.md` · Status: approved design, pre-implementation

## Scope decisions (owner-approved)

- **In scope**: gamification economy atomicity, security-critical fixes (AuthGate, edge-function authz, pronunciation client-grading), swallowed-errors sweep, dead-flow UI batch, teacher-portal P1 bugs, CI/test repair.
- **Out of scope / deferred**: all Stripe work (provider may change), unitization deploy (`propose-unitization`/`apply-unitization` — owned by a parallel implementation session), `.env` git-history handling.

## Sub-batches

Implementation ships as four independently verifiable batches, in order:

### H1 — Security-critical

1. **AuthGate public-path fix** (`components/shared/AuthGate.tsx`): replace `startsWith` matching against a list containing `'/'` with exact-match for `/`, `/login`, `/claim` plus a real prefix rule for `/onboarding/`. All other paths require a session; unauthenticated users redirect to `/login` (with return-to param).
2. **Edge-function authorization**:
   - `generate-media`, `generate-lesson`: require teacher role + `assertUnitOwnership` (or equivalent user-id check where no unit context exists) using the existing `_shared/assertOwnership.ts` helper.
   - `rebuild-unit`: remove the first-caller NULL-owner claim (`update ... eq('teacher_id', null)`); NULL-owner units require an admin/manager role to rebuild.
   - `evaluate-pronunciation`: when grading the client-supplied transcript (no STT provider), the response carries `client_graded: true`; callers stop granting XP/gems/quest credit from client-graded scores (practice-only).
3. Redeploy affected functions via `supabase functions deploy ... --project-ref xsdnzijketjnzhakqtit --no-verify-jwt`; verify per AGENTS.md §8 (`/functions/v1/` + apikey → expect 401).

### H2 — Economy atomicity

**New migration** adds RLS-respecting RPCs (plain `SECURITY INVOKER` functions; ownership enforced by `student_progress` RLS):

- `award_xp(p_student uuid, p_amount int)` / `award_gems(...)`: `INSERT ... ON CONFLICT DO NOTHING` on `student_progress` (self-heals missing rows — closes the swallowed-exception auto-create trigger gap), then `UPDATE ... SET xp = xp + p_amount`.
- `spend_gems(p_student uuid, p_amount int) RETURNS boolean`: `UPDATE ... SET gems = gems - p_amount WHERE gems >= p_amount`; returns false on insufficient funds; balance can never go negative.
- `update_quest_progress(p_student, p_quest, p_delta)`: atomic `progress = LEAST(progress + delta, target)`.
- `claim_quest_reward(p_student, p_quest) RETURNS jsonb`: single statement — `UPDATE ... SET claimed = true WHERE claimed = false AND progress >= target RETURNING xp_reward, gem_reward`. Null result = already claimed or incomplete (no reward). Rewards applied in the same transaction. Double-click safe by construction; UI additionally disables the button while pending.
- `buy_shop_item(p_student, p_item_id) RETURNS jsonb`: one transaction — validate item + balance, debit gems, upsert `student_inventory` with `quantity = student_inventory.quantity + 1` (stacking), return `{status: 'ok' | 'insufficient' | 'invalid_item'}`.

**Frontend** (`services/GamificationService.ts`): every method becomes a thin `supabase.rpc()` wrapper; all client-side read-modify-write removed. `fetchProgress` (`apps/student/StudentApp.tsx:83-115`) also loads `gems` so the header shows the real balance on login. `getHearts` (`services/learnerState.ts:274`) failures return an explicit error state instead of silently reporting full hearts.

### H3 — Error-handling sweep

Rule applied at all ~30 swallowed-error sites: never destructure away `error`. Missing data due to failure must be distinguishable from genuinely-empty:

- User-facing write failures → `sonner` toast (existing pattern across `apps/teacher`).
- Loaders → visible error/empty state with retry.
- Specific fixes: UnitStudio/ExtractionReview `try/finally` → add `catch` + `toast.error`; SpacedRepetition/PracticeMenu/Leaderboard stuck-spinner effects → catch + retry/empty state; Assignments creation failure → toast + modal stays open with message; UploadTextbook stale closure → read scan results from the call's return value, not the state snapshot, plus `.catch` on the unit rename; UnitList Plan/Launch handlers → try/catch/finally so loading can't stick; Shop/Quests handlers get rejection handling + pending disable.

### H4 — Dead flows + CI

- **Reports** (`apps/teacher/Reports.tsx`): timeframe dropdown filters stats client-side by date; per-student "Details"/"View Full Insights" navigate to a real per-student view built from existing report data; "Export Report" and "View All Students" removed (no backend) — no decorative controls remain. Fix the in-render `.sort()` mutation.
- **"Generate from Topic"**: CTA removed from the New Unit modal (single honest upload path).
- **Passports**: route the existing screen from ClassManagement as a "Login cards" action.
- **Parent connect**: route `ParentConnect` at `/parent/connect`; empty-state "Link Student Account" CTA works.
- **UnitizationEditor**: success-screen "Open" buttons navigate to `/teacher/unit/:id`.
- **teacherEntry**: unknown `/teacher/*` paths render a NotFound screen instead of a blank shell.
- **DashboardHome**: "View All" wired or removed; time-aware greeting; remove duplicate mobile nav item.
- **CI/tests**: `tsconfig.json` excludes `supabase/functions` (139 Deno errors gone); CI drops the grep filter; the 12 stale tests (BoardComponents ×7, DataService ×5) updated to current intended behavior. `tsc --noEmit` and `vitest run` must pass locally and in CI.

## Testing & verification

- Migration fixture test (following `scripts/testing` patterns): two concurrent `claim_quest_reward` calls → exactly one succeeds; `buy_shop_item` with insufficient gems → no debit; `spend_gems` never goes negative.
- Per batch: `npx tsc --noEmit` clean, `npx vitest run` green.
- H1 functions redeployed + probed via `/functions/v1/` with apikey (expect 401, not 404).
- Migration applied via Supabase MCP / Management API; recorded in `schema_migrations`.

## Non-goals

Stripe (deferred, provider may change) · unitization deploy (parallel session) · `.env` history (deferred by owner) · parent-app realtime messaging · avatar inventory equipping · FIXPLAN B/D live-board items.
