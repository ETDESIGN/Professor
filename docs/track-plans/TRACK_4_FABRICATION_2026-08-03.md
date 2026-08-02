# TRACK 4 — Fabrication Fixes (P1-1, P1-2, P1-3, P1-6)

> **Status:** Implementation-ready · **Date:** 2026-08-03
> **Scope:** Replace fabricated/placeholder UIs with either real data or honest "unimplemented" treatment. **Per owner default (pending confirmation): remove/hide the 3 large features for v1; fix the 3 tractable ones with real data.**
> **Isolation:** Mostly specific `apps/**/*.tsx` files. One edge-function touch (`evaluate-pronunciation`). Minimal overlap with pipeline session.
> **Estimated effort:** 1.5–2.5 days · **Parent roadmap:** `docs/AUDIT_ROADMAP_2026-08-02.md` (P1-1/2/3/6)

---

## Goal

Kill the "fabricated success" pattern — the single biggest trust risk for an educational product. Six items split into two groups:

**Group A — Fix with real data (do these):**
- **P1-1** `AIAnalysis` — replace hardcoded string cycle with a real `generation_jobs` poll.
- **P1-2** `ParentDashboard` — back the weekly-activity + struggle-areas charts with real data.
- **P1-6** `BoardPoll` — wire actual voting (or remove the template if not in scope).

**Group B — Remove/hide for v1 (default, pending owner confirmation):**
- **P1-3** Pronunciation `emotionScore`/`emotionMatch`/`timing` — drop the fabricated fields; keep honest Levenshtein scoring.
- **P1-4** `VoiceCommandModal` — feature-flag off the UI (real STT is a separate larger project).
- **P1-5** `DubbingGallery`/`DubbingStudio` — feature-flag off (real dubbing pipeline is a separate project).

> ⚠️ **Group B is product-gated.** If the owner chooses "implement properly now," this track's scope changes significantly (real STT vendor selection, full dubbing pipeline, region-safe prosody provider — 2-4 weeks). This plan assumes the default "remove/hide." Confirm before starting Group B.

---

## Group A — Fix with real data

### A1. P1-1: `AIAnalysis` polls `generation_jobs` instead of cycling strings

**File:** `apps/teacher/AIAnalysis.tsx` (whole component, 96 lines).

**Current (verified):** `setInterval` cycles 4 hardcoded strings every 1.5s, then calls `onComplete` after the last. No awareness of the actual pipeline.

**The real signal exists:** `generation_jobs` table (migration `20260729000001`) has `unit_id`, `stage`, `status` (`pending`/`running`/`succeeded`/`failed`), `error`, `attempt`, `started_at`, `completed_at`. RLS lets the unit owner read their jobs.

**New behavior:**
1. `AIAnalysis` takes a `unitId` prop (currently it only takes `onCancel`/`onComplete` — the caller in `UploadTextbook` knows the unit id; pass it through).
2. Poll `generation_jobs` for that `unit_id` every ~2s (Supabase realtime `postgres_changes` on `generation_jobs` filtered by `unit_id` is even better — verify the channel pattern used in `SessionContext` and mirror it; fall back to polling if realtime is fiddly).
3. Map stages to the 4 existing step labels:
   - `extract-page` / upload → "Uploading High-Res Images…"
   - `enrich-unit` → "Extracting Text Layout (OCR)… " + "Identifying Vocabulary & Grammar…"
   - `generate-exercises` → "Generating Interactive Assets…"
4. Drive the step indicator + progress bar from real `status` transitions (a stage = `succeeded` → check its step; a stage = `running` → spinner on its step).
5. **Failure path (the real win):** if any job is `status='failed'`, stop the spinner, show the `error` text + a "Retry" button (which re-invokes the failed stage — needs a small "retry generation job" capability; if that's not trivial, surface "Generation failed: <error>. Please re-publish from Unit Studio." and call `onComplete` so the teacher isn't stuck).
6. **Timeout guard:** if no status change for >120s, show "Taking longer than expected…" (don't auto-fail — image gen is genuinely slow).
7. `onComplete` fires when all expected stages for the unit are `succeeded` (query the unit's expected stage set; for v1 hardcode `['enrich-unit','generate-exercises']` + the upload/extract stage).

**Open:** confirm `UploadTextbook.tsx` calls `AIAnalysis` with the new `unitId` available at that point in the flow (the upload returns a unit id before enrichment kicks off — verify the handoff).

### A2. P1-2: `ParentDashboard` charts from real data

**File:** `apps/parent/ParentDashboard.tsx:61-76`.

**Current (verified):** weekly-activity AreaChart and "struggle areas" (Pronunciation/Past Tense/Vocabulary/Listening) are `xp / N` divisions — fabricated.

**Real data sources that exist:**
- **Weekly activity:** `point_transactions` (writes verified in `SessionContext.tsx:560,719`). Aggregate by `created_at::date` over the last 7 days for the linked student(s). This is the same kind of aggregation `Reports.tsx` does for the teacher.
- **Struggle areas / per-skill mastery:** `Engine.getClassMasteryCounts` is already used by teacher `Reports.tsx:36` for FSRS-based mastery. For a parent, scope it to their linked student(s). If `Engine` exposes a per-student variant, use it; otherwise query `srs_items` for the student and aggregate mastery by objective type/skill.

**New behavior:**
- Replace the `xp / N` chart with a real `point_transactions` daily-sum query (last 7 days), rendered into the existing AreaChart component. Loading + empty ("No activity this week") + error states required — do not silently render zeros (mirrors the `Reports.tsx` no-error-UI bug flagged in the audit; don't repeat it).
- Replace the struggle-areas card with real per-skill FSRS mastery buckets (e.g. "Needs work" = mastery < 0.6). If a skill has no data, hide that skill rather than fabricating.
- **If the data genuinely doesn't exist yet** (e.g. a brand-new student with no `srs_items`), show an honest empty state ("No mastery data yet — your child's progress will appear here after their first lesson"). Do NOT fall back to fabricated numbers.

**Likely new file:** `services/parentAnalytics.ts` — a thin data layer so `ParentDashboard` isn't doing direct `supabase.from(...)` calls (also addresses the P3-9 scattered-DB-calls issue for this file).

### A3. P1-6: `BoardPoll` — wire voting or remove

**File:** `apps/board/templates/BoardPoll.tsx:8-13, 104-160`.

**Current (verified):** `votes = {A:0,B:0,C:0,D:0}`, counts down a 30s timer, reveals — but **no handler increments `votes`**. Bars animate to 10%, percentages always 0%.

**Decision (product):** is live polling a v1 feature?
- **If YES:** wire voting. The cleanest path is realtime broadcast on the existing `classroom_live` channel (students send a `POLL_VOTE` action with their option; the board aggregates). This needs student-side UI (a voting panel in the student app) — non-trivial. Estimate: +1 day.
- **If NO (default):** remove `BoardPoll` from the template registry / board router so it can't be picked, and add a `// TODO(v2): live polling` note. One-line change in whichever file registers templates (verify in `ClassroomBoard.tsx`).

**Default:** remove for v1 (the audit found 0 wiring, suggesting it was never finished). Flag for owner.

---

## Group B — Remove/hide for v1 (default)

### B1. P1-3: drop fabricated pronunciation fields

**File:** `supabase/functions/evaluate-pronunciation/index.ts:96, 120, 135-136`.

**Current (verified):** `emotionScore = similarity*0.7 + confidence*0.3`; `emotionMatch`/`timing` derived from similarity thresholds. No prosody analysis exists. The Levenshtein similarity + confidence scoring itself is honest — keep that.

**Change:**
- Stop computing/returning `emotionScore`, `emotionMatch`, `timing` (lines 120, 135-136). Return only the honest fields: `score` (similarity), `confidence`, `transcript`, `target`, `feedback` (text based on similarity bands).
- Client-side: find every consumer of `emotionMatch`/`timing` (grep `apps/student/**`) and either remove those UI elements or replace with a single honest "Accuracy" meter driven by `score`.
- Add a comment in the function documenting *why* the fields were removed (cite this audit) so a future dev doesn't re-add them thinking they're missing.

**Alternative if owner wants to keep the UX:** label them clearly as estimates ("Estimated fluency") rather than measured values. Default = remove.

### B2. P1-4: feature-flag off `VoiceCommandModal`

**Files:** `apps/remote/VoiceCommandModal.tsx` (whole file) + its mount point in `TeacherRemote.tsx`.

**Current (verified):** no SpeechRecognition; `simulateSpeech()` types canned phrases; `processCommand` parses the fake transcript. Pure mock theater.

**Change:**
- Add a `VITE_ENABLE_VOICE_COMMANDS` env flag (default `false`).
- In `TeacherRemote.tsx`, only mount `<VoiceCommandModal/>` (and show its trigger button) when the flag is true. In production (flag unset), the voice button is gone — no mock UI presented as real.
- Leave the component file in place (so a future STT implementation can replace `simulateSpeech`), but add a prominent `// MOCK — do not ship enabled. Real STT is unimplemented (audit P1-4).` header.
- Document in `.env.example`: `VITE_ENABLE_VOICE_COMMANDS=false  # voice commands are a mock; leave off until STT is implemented`.

### B3. P1-5: feature-flag off Dubbing

**Files:** `apps/parent/DubbingGallery.tsx`, `apps/student/DubbingStudio.tsx` + their mount points / routes.

**Current (verified):** Download/More/Share buttons have no `onClick`; "player" is a 🎬 emoji with hardcoded `0:12 / 0:45`. Static mock UI presented as functional.

**Change:**
- Add `VITE_ENABLE_DUBBING` env flag (default `false`).
- Gate the routes/nav entries that lead to Dubbing behind the flag. When off, the feature is simply absent from the UI (no dead buttons, no mock player).
- Add the `// MOCK` header to both files.
- Document in `.env.example`.

---

## Files this track owns

```
apps/teacher/AIAnalysis.tsx                              ← A1 rewrite
apps/teacher/UploadTextbook.tsx                          ← A1 pass unitId (minor EDIT)
services/parentAnalytics.ts                              ← A2 NEW data layer
apps/parent/ParentDashboard.tsx                          ← A2 rewrite charts
apps/board/templates/BoardPoll.tsx                       ← A3 remove-from-registry OR wire-voting
apps/board/ClassroomBoard.tsx                            ← A3 registry edit (verify path)
supabase/functions/evaluate-pronunciation/index.ts       ← B1 drop fake fields (EDIT — light)
apps/student/** (pronunciation result consumers)         ← B1 drop fake UI (grep first)
apps/remote/VoiceCommandModal.tsx                        ← B2 add MOCK header
apps/remote/TeacherRemote.tsx                            ← B2 flag-gate mount
apps/parent/DubbingGallery.tsx                           ← B3 flag-gate / MOCK header
apps/student/DubbingStudio.tsx                           ← B3 flag-gate / MOCK header
.env.example                                             ← B2/B3 document flags
```

**Do NOT touch:** `enrich-unit`, `orchestrate-lesson`, `generate-exercises`, `_shared/ai.ts` (pipeline session). `evaluate-pronunciation` is lightly edited in B1 — coordinate if the pipeline session touches it (unlikely; it's not part of the generation pipeline).

---

## Verification

1. **A1:** upload a textbook → `AIAnalysis` reflects real `generation_jobs` stage transitions; force a failure (e.g. bad unit) → failure UI shows the real error.
2. **A2:** parent with a linked student who has `point_transactions` → chart shows real daily activity; parent of a brand-new student → honest empty state (not zeros).
3. **A3:** `BoardPoll` no longer pickable in the board selector (default) — OR votes actually increment (if wired).
4. **B1:** pronunciation attempt returns `score` + `confidence` + `transcript` only; UI shows an honest Accuracy meter.
5. **B2:** with flag off, no voice button in `TeacherRemote`; with flag on, the mock modal appears (clearly labeled).
6. **B3:** with flag off, no Dubbing entry in nav; with flag on, the mock appears (clearly labeled).

Run `/verify`.

---

## Coordination with other tracks

- **A2 depends on nothing** but is informed by Track 2 (billing adds `subscription_tier` to the profile — irrelevant to parent analytics).
- **B1 touches `evaluate-pronunciation`** — confirm the pipeline session isn't editing it (it shouldn't be; it's not a generation function). Read-before-edit.
- **A1's failure-retry** may overlap with Track 2's STEP 2 credit gate (a 402 during `generate-exercises` should show as "out of credits" not a generic failure). Coordinate the error-surfacing.

---

## Open questions (resolve before starting)

1. **Group B confirmation:** remove/hide (default) vs implement-properly-now? This determines whether B is 1 hour or 3 weeks.
2. **A3 BoardPoll:** wire-voting vs remove (default)?
3. **A1 retry:** is there a "retry generation job" path, or do we just surface the error + direct to Unit Studio?
4. **A2 per-student mastery:** does `Engine` expose a per-student (not per-class) mastery query, or do we aggregate `srs_items` directly? Verify before writing `parentAnalytics.ts`.

---

## Done =

- [ ] A1 `AIAnalysis` rewrites to poll `generation_jobs` (+ `unitId` plumbed)
- [ ] A2 `parentAnalytics.ts` + `ParentDashboard` real charts + honest empty states
- [ ] A3 `BoardPoll` removed from registry (default) OR voting wired
- [ ] B1 pronunciation fake fields dropped (server + client)
- [ ] B2 VoiceCommandModal flag-gated off by default
- [ ] B3 Dubbing flag-gated off by default
- [ ] All 6 verification cases pass
- [ ] Strike through P1-1, P1-2, P1-3, P1-4, P1-5, P1-6 in `AUDIT_ROADMAP_2026-08-02.md`
