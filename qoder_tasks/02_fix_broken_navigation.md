# Task 02 — Fix the 3 broken navigation flows (B-EXIT, B-MOBILE, orphaned routes)

## Context
Three navigation paths land on wrong/dead surfaces. Two are user-facing dead ends; one is the canonical "end of class" landing on a half-retired editor. Found in `docs/brainstorming/QODER_AUDIT.md` §1 (B-EXIT, B-MOBILE) and §3 (orphaned routes). These are small route repoints — high impact, low risk.

## Scope
- `App.tsx` (post-live-exit destination)
- `apps/teacher/teacherEntry.tsx` (post-live-exit destination, production entry)
- `apps/teacher/TeacherDashboard.tsx` (mobile Plan nav target + remove orphaned routes)
- `apps/teacher/LessonEditor.tsx` (DELETE this file — it's a stub)
- `apps/teacher/LessonStudio.tsx` (DELETE this file — superseded by Unit Studio; its KG toggle was already retired internally)

**Confirm before deleting:** grep the codebase to confirm nothing else imports `LessonEditor` or `LessonStudio` other than the routes you're removing. If something else does, STOP and flag it.

## What to change

### Fix 1 — Post-live-exit → Unit Studio (not old LessonStudio)
- `App.tsx:201`: `LiveCommander onExit={() => navigate('/teacher/studio')}` → navigate to the Unit Studio for the just-taught unit. The active unit id is in the session: use the same pattern the rest of the app uses to read it. The destination is `/teacher/unit/${unitId}` (the Unit Studio route). Read the active unit id from wherever App.tsx has access (likely `useSession()` — check how other components read `state.activeUnit.id`). If no active unit, fall back to `/teacher/units`.
- `apps/teacher/teacherEntry.tsx:52`: same change (`onExit={() => navigate(...)}`). **This is the production entry — it matters more than App.tsx.**

### Fix 2 — Mobile "Plan Lesson" → Unit Studio (not the stub)
- `apps/teacher/TeacherDashboard.tsx:108`: the mobile sidebar "Plan Lesson" button currently `handleNav('/teacher/mobile-editor')`. But there's no active unit selected at this point, so we can't deep-link a unit. Repoint it to `/teacher/units` (the curriculum list) so the teacher picks a unit, whose Plan button (already fixed in Phase 0C) routes to the Studio. **Rationale:** on mobile you can't Plan without first choosing a unit; sending them to the unit list is the honest path. (The Unit Studio itself already renders Content-only on mobile via Phase 2.4, so once they pick a unit, mobile works.)
- Update the comment at `TeacherDashboard.tsx:59` that currently says "dead-end mobile-editor stub" — it's no longer pointing there.

### Fix 3 — Remove the orphaned/superseded routes + the stub files
In `apps/teacher/TeacherDashboard.tsx` routes section (~line 245-258):
- Remove the `mobile-editor` Route (line ~249) — the file is being deleted.
- Remove the `unit-vault/:unitId` Route (line ~248) — zero callers (orphaned alias of Unit Studio).
- Keep the `studio` route IF `App.tsx`/`teacherEntry.tsx` still reference `/teacher/studio` after Fix 1 — but they shouldn't. If Fix 1 removes all `/teacher/studio` references, the `studio` route can also go. **Verify with grep first.**

Then delete:
- `apps/teacher/LessonEditor.tsx` (stub)
- `apps/teacher/LessonStudio.tsx` (superseded — Unit Studio is the replacement)

Also remove their `lazy(() => import(...))` lines in `TeacherDashboard.tsx` / `App.tsx` / `teacherEntry.tsx` (grep for the imports).

## Acceptance Criteria
- [ ] `App.tsx` and `teacherEntry.tsx` post-live-exit navigate to `/teacher/unit/:id` (or `/teacher/units` fallback) — confirmed by grep showing NO `'/teacher/studio'` navigation targets remain
- [ ] Mobile "Plan Lesson" nav → `/teacher/units` (confirmed by grep)
- [ ] `LessonEditor.tsx` and `LessonStudio.tsx` files DELETED
- [ ] No imports of the deleted files remain anywhere (grep clean)
- [ ] No orphaned routes in `TeacherDashboard.tsx` (`mobile-editor`, `unit-vault`, `studio` if unused)
- [ ] `npx tsc --noEmit -p tsconfig.json` clean
- [ ] `npx vite build` succeeds

## Don't
- Do NOT change the Unit Studio itself, UnitContentVault, or PlanComposer.
- Do NOT touch the live session (`LiveCommander`) beyond the `onExit` prop.
- Do NOT add new routes.
- Do NOT delete `AssetWorkshop` — it's still used for Review (separate task later).

## References
- `docs/brainstorming/QODER_AUDIT.md` §1 (B-EXIT, B-MOBILE), §3 (orphaned routes)
- `App.tsx:201`, `apps/teacher/teacherEntry.tsx:52`, `apps/teacher/TeacherDashboard.tsx:108,248,249`

---

## STATUS

- [x] `App.tsx` and `teacherEntry.tsx` post-live-exit navigate to `/teacher/unit/:id` (or `/teacher/units` fallback) — confirmed by grep showing NO `'/teacher/studio'` navigation targets remain
- [x] Mobile "Plan Lesson" nav → `/teacher/units` (confirmed by grep)
- [x] `LessonEditor.tsx` and `LessonStudio.tsx` files DELETED
- [x] No imports of the deleted files remain anywhere (grep clean)
- [x] No orphaned routes in `TeacherDashboard.tsx` (`mobile-editor`, `unit-vault`, `studio` all removed)
- [x] `npx tsc --noEmit -p tsconfig.json` clean (only Deno/esm noise)
- [x] `npx vite build` succeeds
- **Commit:** `9ee6c1c`
- **Notes:** One out-of-scope reference remains: `e2e/teacher.spec.ts:155` still navigates to `/teacher/studio` in a Playwright test. This is a test file not listed in scope — flagging for reviewer. In App.tsx, a small `LiveCommanderRoute` wrapper component was added (inside SessionProvider) to access `useSession()` for the active unit id, since App itself is above the provider. In teacherEntry.tsx (basename `/teacher`), the exit navigates to `/unit/:id` (relative to basename).
- **Questions for reviewer:** Should the e2e test (`e2e/teacher.spec.ts:155`) be updated in a follow-up?
