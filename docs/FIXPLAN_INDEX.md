# Fix Plan Index — Student Mgmt + Live Board + Live Commander

**Origin:** Deep audit performed 2026-07-26 (see full findings inline in each workstream doc).
**Status:** Plans drafted, awaiting execution approval. Each workstream is independently shippable.

---

## Workstreams (in recommended execution order)

| # | Workstream | Doc | Scope | Risk | Depends on |
|---|---|---|---|---|---|
| **A** | Capture untracked RPCs | [`FIXPLAN_A_RPCs.md`](./FIXPLAN_A_RPCs.md) | Codify 4 cloud-only RPCs into a versioned migration | 🟢 Low | — |
| **B** | Live Board scoring + dead buttons | [`FIXPLAN_B_LIVEBOARD.md`](./FIXPLAN_B_LIVEBOARD.md) | Wire `addPoints` into 7 game templates; fix dead board handlers; stop self-echo | 🟡 Medium | A (for clean baseline) |
| **C** | Student-mgmt data integrity | [`FIXPLAN_C_STUDENTMGMT.md`](./FIXPLAN_C_STUDENTMGMT.md) | Cascade archive; rebuild leaderboard/analytics over roster; parent-link bridge; 2-arg `is_school_manager` | 🟡 Medium | A |

**Deferred** (not in scope yet — best after A/B/C stabilize):
- **D** Architecture cleanup: discriminated action union, single `<Wheel>` component, Group Maker → `assignTeams` merge, remove decorative buttons. Tracked as a follow-up.

---

## Top-level findings these plans address

### Login bug (RESOLVED — confirmed robust)
The "Unable to verify user role" error fired from `services/AuthService.ts:53` because the `profiles` SELECT hit **RLS recursion**: `profiles_select_policy` called `is_teacher_or_admin()` → `is_role()` → read `profiles.role` while evaluating a policy on `profiles`. Fixed in `20260715000002_manager_role_helpers.sql` by making those functions `SECURITY DEFINER` (bypass RLS on the inner read). Login works for the right reason.

### Headline gaps the plans fix
1. **Four RPCs untracked in version control** — they exist on cloud only; a fresh `db push` would lose them. → Workstream A.
2. **Live board scoring is literally not connected** — games call `gradeStudent()` (cognitive capture, claimed-only) but never `addPoints()`. Leaderboard only moves on manual teacher taps. → Workstream B.
3. **~12 commander/remote buttons are dead** (soundboard, live snap, team-battle, grammar-practice, voice commands, group maker, AI co-pilot, decorative action button, etc.). → Workstream B.
4. **Self-echo double-processing** — `classroom_live` channel created without `broadcast: { self: false }`; every teacher action runs twice on their own tab. → Workstream B.
5. **Two parallel student models half-bridged** — board reads `roster_students` (incl. unclaimed); reports/leaderboard/analytics/parent app read `class_enrollments` (claimed only). Same class → different student counts on different screens. → Workstream C.
6. **`archiveRosterStudent` leaves orphans** — sets `is_archived=true` but doesn't unlink enrollments/parent links/points. Removed kids still appear in Reports/Dashboard/Messages. → Workstream C.
7. **`decide_parent_roster_link` calls a 1-arg function that was dropped** (`is_school_manager(uuid)` → replaced by 2-arg `is_school_manager(uuid, uuid)`). Manager-branch approvals will throw. → Workstream C.

---

## Execution conventions

- All SQL migrations land in `supabase/migrations/` with the next free `YYYYMMDDNNNNNN_` prefix, idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`), and deployed via Supabase MCP (`supabase_apply_migration`) or the pooler CLI path — never the direct `db.xsdnzijketjnzhakqtit.supabase.co` host (TLS-EOF blocker; see AGENTS.md §7/§9).
- Code changes are made file-by-file with `file:line` references in each workstream doc.
- Each workstream ships with a verification checklist — do not mark complete until green.
- Region-safe constraint (AGENTS.md §5) applies to any AI feature work; these plans do not introduce AI calls.

---

## How to proceed

1. Read `FIXPLAN_A_RPCs.md` first — it's the smallest, safest, and unblocks a clean `db push`.
2. Then `FIXPLAN_B_LIVEBOARD.md` for the user-facing "things aren't connected" fixes.
3. Then `FIXPLAN_C_STUDENTMGMT.md` for the data-integrity reconciliation.
4. D is deferred; revisit after B+C are stable in production.
