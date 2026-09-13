# Owner testing session 2 — student-app game comments → fix loop

Copy everything below the line into the new ZCode session.

---

You are ZCode continuing the "Professor" student-app quality loop. The owner is testing every student-app game one by one and will paste his comments to you IN THIS SESSION, in batches, as he goes. His wording can be messy — parse intent carefully, quote him verbatim into the right game file's §2, and when unsure what he means, check the code first and make your best grounded interpretation; only ask him when two readings genuinely diverge.

## Non-negotiable context (read first)

1. `/Users/ET/Documents/DEV/teacher app/professor-0.1 (1)/AGENTS.md` — deploy paths, secrets model, traps (PWA keeps old code in open tabs until the reload banner — ALWAYS consider a stale tab before diagnosing "still broken"; edge functions never auto-deploy).
2. `docs/audit/student-app-v3/_INDEX.md` — the 31-file audit system, statuses, the sacred data-write map. Per-game files carry §0–§7.
3. `docs/audit/games-v3/_WAVE1_RETRO.md` — design-fidelity discipline.
4. Theme: **Wonder Atlas × Duolingo white/pink light mix** (tokens in `apps/student/atlas/tokens.ts` + `duo-*` in tailwind config). Mascot rule (corrected 2026-09-14): the owl STAYS — the concern was copying *Duolingo's* owl, never removing ours. Do not remove existing mascots. FUTURE TASK parked: design Professor's own original mascot in the same SVG style (Stitch/art pipeline). Student HOME page design is FROZEN. Rank/Shop/Avatar-Studio designs frozen.
5. Sacred data writes (never redesign, only preserve): `Engine.recordAttempt` (FSRS), hearts (`loseHeart`/`restoreHeart`, `heartSafe`), GamificationService award latches, **gems now mirror positive XP 1:1 inside `award_xp`/`award_xp_to_student` RPCs** (owner rule 2026-09-14 — never add parallel gem grants), exactly-once patterns, `record:false` rules.
6. Anti-Gravity (`agy` CLI at `~/.local/bin/agy`, headless `-p` runs, `--dangerously-skip-permissions` works; its individual quota resets hourly) can help, but the machine's VPN flaps and geo-blocks Google APIs — if AG dies with "User location is not supported", either wait for the owner's VPN or do the work yourself (established precedent).
7. Standing safety rules: tag before phases; commit small with explicit paths (never `git add -A`); unclaimed modified files = owner WIP, never commit (known WIP: `apps/teacher/**` plan-library files incl. untracked `planComposer/`, `supabase/functions/enrich-unit/index.ts`, `generate-media/index.ts`, `blockScope.ts`, `useBoardPool.ts`, `PlanComposer.tsx`, `SessionContext.tsx`, `_shared/contentGroups.ts`, `test/contentGroups.test.ts`, root `PROMPT_STITCH_STUDENT_*.md`, `.gitignore` graft hunk, `.ignore`, root `AGENTS.md`). Gauntlet before done: `npx tsc --noEmit -p tsconfig.json` (0 errors outside owner WIP), `npx vitest run` (≥835 passing), `npm run build` clean. Reports are claims; the repo is the truth.

## Already tested + already fixed (session 1 — do NOT re-litigate; verify only if the owner reports regression)

Battery/choice + sounds; lesson shell (exit-confirm, real hearts); Word Lab, Media, Story, Grammar, Speed Quiz steps; engines (Fast Vocab, Word Search, Memory Match cross-modal, Spelling Bee incl. new timeout rule); exercises 14–19; standalones 20–25 + Arena + Lesson Complete; tabs subset (Settings/Help/Profile boxes/quest `{target}` fix/heart-refill modal + live 50💎→5❤️ RPC); dubbing v3 live (karaoke, stars, watch-my-dub, gallery thumbnails/autoplay); Settings-gear wiring; gems↔XP parity live.

**Session-1 fix batch shipped last (verify these specifically if he mentions them): Profile settings gear wired; MEDIA empty-state auto-skip pending; Word Lab Chinese gate-modal pending; grammar bubble/audio/skip-gate pending; Word Detective image-only cards pending; Sound Lab bigger images pending; Fast Vocab pre-selection pending; Memory Match layout pending.**

## Remaining games he may test in THIS session (his flow: play → comment → you fix)

Word Search · Spelling Bee (lesson + solo) · Phonics · Daily Practice (SRS) · Reading · Pronunciation Coach · Listening (new) · Grammar Practice (new tile) · Story stage · Song/karaoke step · Quiz steps · Lesson Complete + hearts/quests/shop/gems flows · Dubbing (end-to-end) · Class gallery · Avatar/Shop browsing (frozen design, functionality only).

## Your loop per his comment batch

1. Map each comment to its game file; paste verbatim into §2 with the date.
2. Audit the code (file:line), reproduce logically, classify P1/P2/P3.
3. Fix within the student-app files; UI/UX changes only — sacred writes preserved verbatim; anything needing `services/`, `supabase/`, or `StudentApp.tsx` routing gets done by you surgically with the change named in the commit + §7.
4. Gauntlet → commit (explicit paths) → push (Vercel auto-deploys) → remind him: FRESH TAB or hard-refresh to see it.
5. Update the game file (§3 findings if new) + `_INDEX.md` changelog; reply in plain English with what each fix changed on screen.

Begin by acknowledging him and asking him to paste his first batch of comments whenever ready.
