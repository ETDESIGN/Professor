# Student Dubbing v3 — implementation plan (owner-approved 2026-09-14)

Owner: "i validate the dubbing functionality and design, you can implement it after plannify all in details." Design set: 6 screens in Stitch project `6865954475041880496` (2 exported: Pick `1.html`, Watch `2.html`; Record-karaoke / Result-star / Gallery / Empty materializing — AG exports them before implementing). Spec: `docs/brainstorming/13_DUBBING_STUDENT_V3_BRAINSTORM.md` §5-§7.

## 1. Scope (files AG may edit)

- `apps/student/DubbingStudio.tsx` — all four phases reskinned + the two upgrades.
- `apps/student/ClassDubs.tsx` — gallery light reskin (hearts kept).
- `apps/student/dubbing/useDubRecorder.ts` — ADDITIVE ONLY: expose a per-window progress signal for the karaoke bar (e.g. `windowElapsedRatio`); timing semantics (windows, 1.5s lead, non-overlap enforcement, capture) byte-identical.
- `components/shared/DubPlayer.tsx` — light skin (parent app uses it too: keep changes presentational only).
- NEW files allowed under `apps/student/dubbing/` (e.g. a KaraokeLineDeck subcomponent).
- **Sanctioned surgical edit** — `apps/student/StudentApp.tsx`, exactly one change: the dubbing route's exit currently calls `handleLessonComplete({ xp: 5, accuracy: 95, time: '2:30' })` (fake stats → fake LessonComplete awards). Replace with a plain back-navigation (same as onBack) — the studio awards its own real XP.

FORBIDDEN: `services/DubbingService.ts` + all services/ (every call signature as-is), `supabase/**`, `store/`, `apps/board/**`, `apps/teacher/**` (teacher dubbing screens unchanged this round), `HomeMap.tsx`, all untracked files.

## 2. Behavioral changes (owner-approved decisions)

1. **Karaoke record UI** (screen 3): muted video on top; below — CURRENT line in large type + a draining window bar (from the recorder's new progress signal), NEXT line dimmed, mic FAB + waveform strip, instant band chips on capture (great=emerald / almost=amber / try=red + word-match %), per-line redo list at pass-done.
2. **Star-band result** (screen 4): DubPlayer hero; 3-star card (great=3★ / almost=2★ / try=1★) + word-match ring; per-line pills with redo; Try again + Share with class.
3. **Gem on great publish** (decision 7): after `publishDubbing` succeeds AND overall band === 'great' AND a per-take latch not yet fired → `GamificationService.awardGems(1)` — pattern-A exactly-once, mirroring the existing `xpGivenRef` latches. surfaced on the Share button as the design shows.
4. **Honest exit** (sanction above): no more fake xp/accuracy.
5. **Sounds**: `playCue('reveal')` on line capture; `correct`/`wrong` per band chip; `win` on result card entry; gallery heart tap = `correct`.
6. **Empty state + gallery** per screens 5-6 (no owl/animal mascot anywhere — standing owner rule).
7. **Score-pending path stays**: AI-down renders pending pills + "teacher can still hear your dub" — no invented scores.

## 3. Sacred / unchanged (verified in review)

Recorder timing math; `evaluateTake` per-line calls + payloads; exactly-once XP (10 private / 15 published) + DUBBING_TAKE quest; ONE dubbing row per take (savedDubbingIdRef); snapshot-flush invariant (finalBlobsRef); storage upload paths; retention; RLS; teacher-side flows; DubbingService API.

## 4. Steps

1. AG exports the 4 pending screens (`list_screens` poll → `get_screen` → `stitch/30-dubbing-studio/3-6.{html,png}`; dedupe the possible karaoke near-duplicate from the timed-out MCP attempt — newest by sessionId wins).
2. AG implements §1-§2 from the HTML exports (fidelity rules per the pack), fills §7 + flips file 30 → implemented.
3. ZCode review: scope diff, sacred-list check, gauntlet (tsc 0 new errors — owner's untracked planComposer excluded; vitest ≥826; build clean), commit (explicit paths), push.
4. **Flag flip (owner-approved decision 1)**: set `VITE_ENABLE_DUBBING=true` via Vercel REST API (project `prj_hOjuQO5tlDSTS0PGEDxOCTzFLcPg`, token in `.env.local`), trigger redeploy, verify per AGENTS §7 (last-modified + dubbing chunk present in sw.js precache). If the API refuses the env write, owner flips it in the dashboard (one click) — fallback documented.
5. Post-flip smoke: `/student` shows the dubbing entry chip; studio loads (clips list may be empty until teachers assign — the designed empty state covers it).
6. `_INDEX` close-out + report.

## 5. Risks / notes

- The 4 pending screens may take hours to materialize; AG polls before implementing. If any rejects/never lands, ZCode re-submits that one prompt verbatim (quota available).
- `VITE_ENABLE_DUBBING` also gates teacher + parent surfaces — flipping exposes the (unchanged, dark-themed) teacher dubbing screens too; acceptable per owner decision 1 (flag is all-or-nothing) — noted, teacher reskin can follow later if he wants.
- Mic permission prompts on first use — the designed empty/watch states must not auto-request the mic before the child taps record (current behavior preserved).
