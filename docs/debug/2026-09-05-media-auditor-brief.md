# AUDITOR BRIEF — Live-board media player shows "empty media" despite a resolved video in the DB

> **Your role: AUDIT ONLY.** Read code, trace data flow, verify live state, and produce a ranked findings report. Do NOT edit code, do NOT deploy anything, do NOT run destructive commands. The implementation agent (ZCode) will apply fixes based on your findings.
>
> **Deliverable:** a markdown report with findings ranked by likelihood. For each finding: the evidence (file:line + live-data proof), the exact broken link in the chain, a suggested minimal fix, and how to verify it. End with the single most probable root cause for (a) the board symptom and (b) the student-app symptom.

---

## 1. Where everything lives

| What | Path (note: the path contains spaces/parens — always quote it) |
|---|---|
| Repo root (all commands run from here) | `/Users/ET/Documents/DEV/teacher app/professor-0.1 (1)/` |
| Operating manual (READ FIRST — stack, deploy runbook, verify procedures, known issues) | `/Users/ET/Documents/DEV/teacher app/AGENTS.md` |
| Design spec for the feature under test | `docs/superpowers/specs/2026-09-04-youtube-media-resolution-design.md` |
| Channel/catalog research | `docs/media/kids-song-channels-analysis.md` |
| Frontend stack | Vite + TypeScript + React multi-entry SPA (entries: teacher / student / parent / admin + `/board` projector + `/remote`), Tailwind, deployed to **Vercel** (auto-deploy on push to `master`, prod domain `professor-ruby.vercel.app`) |
| Backend | Supabase (project ref `xsdnzijketjnzhakqtit`): Postgres + Auth + Edge Functions (Deno). **Edge functions do NOT auto-deploy** — they are deployed manually via `npx supabase functions deploy <names> --project-ref xsdnzijketjnzhakqtit --no-verify-jwt` from the repo root. |
| Tests | `npx vitest run` (680 pass as of last commit). Build: `npm run build`. |
| Secrets | NOT included here. For live DB queries ask the owner to run them or to provide the service key from the Supabase dashboard (Management API → api-keys). Never commit secrets. |

## 2. The feature under audit — keyless YouTube warm-up resolution

Pipeline (who writes what, where):

1. **`supabase/functions/enrich-unit/index.ts`** — AI enrichment writes `units.manifest`. REAL manifest shape on production units is NOT flat: content lives under `manifest.enriched_content` (with `topic`, `gradeLevel`, `vocabulary`, `song_suggestions`, `video_suggestions`) plus `manifest.knowledge_graph`, `manifest.meta`. Book songs come from the textbook scan with verbatim lyrics.
2. **`supabase/functions/orchestrate-lesson/index.ts`** — builds `units.flow` (the lesson slide array). The warm-up slide is type `MEDIA_PLAYER`. After building/normalizing the flow it calls `resolveMediaForFlow()` (pre-save, 30s budget, non-fatal) which resolves blocks lacking `videoUrl`, then persists `units.flow` + `units.status='Active'`.
3. **`supabase/functions/_shared/mediaResolver.ts` + `mediaResolverCore.ts`** — the resolution ladder: catalog title match → suggestion-title match → topic/vocab/age match against a seeded catalog (189 songs in the `assets` table: `type='video'`, `kind='external_url'`, `unit_id IS NULL`, `owner_id IS NULL`, tags `topic:*`/`age:*`, `metadata.videoId`) → AI-guessed videoIds validated via the keyless oEmbed endpoint (title-similarity gate ≥ 0.5, channel allowlist) → teacher. Auto-apply policy: `autoApplyAllowed()` in `mediaResolverCore.ts`.
4. **`supabase/functions/generate-media/index.ts`** — actions `resolve-media` (heal an existing unit's unresolved blocks; also syncs `class_plans.flow` copies via `syncClassPlanFlows`) and `apply-media` (teacher paste: server oEmbed-validates, patches `units.flow` + `class_plans.flow`, records asset + `unit_media`).
5. **Flow block contract (the render truth)** — `MEDIA_PLAYER.data` fields: `title, kind, search_query, topic_relevance, youtubeUrl, lyrics, source, structure_id` + resolution fields `videoUrl, videoTitle, videoChannel, videoThumbnailUrl, resolvedVia, resolvedAt, ageBand, candidates[]`. `supabase/functions/_shared/flowTypes.ts → validateAndNormalizeFlow()` passes `data` through untouched (verified).
6. **Client render path (board/projector)** — `apps/board/templates/BoardMediaPlayer.tsx`: `hasContent = data.videoUrl || data.audioUrl || lyrics.length`; if no content AND no `youtubeUrl`/`search_query` → renders "No media content available for this step" (the symptom). With `videoUrl` it embeds via `react-player`. The slide data comes from `store/SessionContext.tsx` → `state.activeSlideData`.
7. **Client edit path (teacher)** — `apps/teacher/UnitContentVault.tsx` (Media tab: Find video / paste / library picker; saves via `Engine.updateUnit`) and `store/useUnitStudioStore.ts` (studio save — both had a data-wipe bug, fixed in commit `673388f` to MERGE into existing block data).
8. **Live convergence** — `SessionContext` broadcasts/handles `MEDIA_RESOLVED` → `refreshActiveFlow()` re-fetches the active unit (and class-plan flow when one drives the session) in place. Vault sends this broadcast too.

## 3. The bug report and the debugging history (do not re-derive — verify instead)

**Owner symptom (current):** live board warm-up slide still shows "No media content available for this step"; owner also reports the **student app** doesn't show the media properly. This survived multiple fix rounds.

**Round-trip history (all commits on `master`):**
- `e2f6576` — resolver core + resolve-media + orchestrate-lesson integration + 189-song catalog seeded to cloud.
- `5c43b1e` — teacher surfaces (board honest state + candidate chips, commander/remote `MediaResolvePanel`, vault Media tab rebuild, `MEDIA_RESOLVED` broadcast, backfill).
- `96d8b3b` — QA fixes: resolver now normalizes the manifest (`enriched_content`) instead of flat keys; orchestrate passes canonical `difficulty_cefr` for the age band; topic/title scoring tiebreak; vault Find-video broadcasts.
- `673388f` — the vault wipe fix: both save paths wrote `data: { ...(mediaStep||{}), title }` and `useUnitStudioStore.load()` resets `mediaStep` to null after a re-enrich, which reduced the block to a bare title. Now merges into `step.data`.

**Verified live evidence (2026-09-05 ~08:20 UTC):** the owner's unit "A Day at the Zoo" (`units.id = e432361f-b375-4dd3-8863-29d8c21a29e8`) has in `units.flow` a `MEDIA_PLAYER` block whose `data` contains `videoUrl: "https://www.youtube.com/watch?v=7MKmbyfhkkE"`, `videoTitle: "The Animals On The Farm (Remake)…"`, `videoChannel`, `resolvedVia: "catalog"`, `resolvedAt: "2026-09-05T08:17:47Z"`, `ageBand`, `search_query`, `source: "book"`. Flow length 15, block index 1. There are **0 class_plans rows for this unit**.

**DECISIVE re-check (2026-09-05 ~13:50 UTC, after the owner's latest failed test):**
- `units.last_updated` = 08:17:51 — the block has NOT been touched since the heal. `flow[1]` still type `MEDIA_PLAYER`, still carries `videoUrl` + all fields. **The database is correct.**
- `classroom_sessions` latest row: `unit_id = e432361f…` (the healed unit), `class_plan_id = NULL`, `current_index = 1` (the media slide), `status = IDLE`, `updated_at = 13:43` (the owner's test).
- Therefore: the board rendered slide 1 of the correct unit while the DB block at that index HAS a videoUrl — **the board is rendering a stale client-side copy of the block, not the DB's**. The screenshot's block title ("Animals and nature Warm Up") matches the DB title, but a title-only variant of that block (produed by the pre-`673388f` wipe bug during the 08:0X window) matches what the board shows exactly. Conclusion: some client path is serving a cached/pre-heal copy of the unit flow, and/or the board tab is running the pre-fix JS bundle (PWA waiting SW).

**Conclusion the audit must resolve:** the disconnect is between the correct `units.flow` in the DB and what the board (and student app) actually render. The resolver/writer side appears healthy; the suspects are in **hydration, session state, build staleness, or the student pipeline's separate flow source**.

## 4. Prime suspects (investigate in this order, with evidence)

1. **Board/projector hydration serves a CACHED unit instead of the DB's (TOP SUSPECT for the board).** Trace exactly how the `/board` projector tab obtains `activeSlideData`: `store/SessionContext.tsx` — `loadUnits()` (when does it run? what does `Engine.getUnits()` cache?), the mount-time session hydration, and especially `applySessionRow` (~lines 640–733) reacting to `classroom_sessions` realtime: when the projector follows a session, does it **fresh-fetch `units.flow`** (like the GO-LIVE tab's `setActiveUnit` does via `Engine.getUnitById`) or does it pick the unit from the `state.units` cache loaded at tab boot? A long-lived projector tab that booted during the 08:0X "wiped block" window would still render the title-only block forever — matching the screenshot exactly. Also check `services/SupabaseService.ts` (`Engine`) for any client-side caching/localStorage layer.
2. **PWA stale bundle (documented behavior — AGENTS.md §8.1).** Already-open tabs keep the OLD JavaScript until the user accepts the update banner; the OLD `BoardMediaPlayer` shows the same "No media content available" text AND ignores `MEDIA_RESOLVED`. Verify what build the board tab runs: compare precached chunk names in `https://professor-ruby.vercel.app/sw.js` against a fresh `npm run build`'s `dist/` output, and `last-modified` on `https://professor-ruby.vercel.app/teacher`. If the owner's projector tab predates commit `5c43b1e`/`673388f`, no server-side fix can reach it without a reload — and the report must say so explicitly.
3. **Field-name/shape mismatches between writers and the reader.** The board reads `data.videoUrl` (camelCase). Enumerate every writer that touches `MEDIA_PLAYER.data` (orchestrate-lesson, resolve-media, apply-media, UnitContentVault save, useUnitStudioStore save, PlanComposer, generate-class-flow/`_shared/classFlow.ts`, `services/LessonTransformer.ts`) and confirm none writes `video_url` or rebuilds the block from a suggestion (dropping resolution fields). Also confirm how `BOARD_MAP`/`BoardShell` pass `data` into `BoardMediaPlayer` (props: `{ data }`).
4. **Student app is a SEPARATE pipeline (TOP SUSPECT for the student symptom).** `apps/student/SoloLessonPlayer.tsx` (`renderMediaPlayer`) does not necessarily render `units.flow`: trace `services/LessonTransformer.ts` (~line 68 generates its own `MEDIA_PLAYER` blocks), `services/stageProgressService.ts`, and `apps/teacher/StudentPathComposer.tsx` (media key at ~line 196). If the student flow is synthesized per-student/per-stage WITHOUT copying `videoUrl` from the unit flow, resolution never reaches the student app. Determine the exact data source for the student's media step and whether it carries `videoUrl`; propose the minimal copy-point.
5. **ReactPlayer rendering itself.** With `data.videoUrl` present, `BoardMediaPlayer` renders the video as a background layer (150% scale, `opacity 0.8`, dark overlay + lyrics on top). Confirm there is no condition where `videoUrl` is present but the empty-state branch renders anyway (e.g. `lyrics` shape, block passed as `data={block}` vs `data={block.data}`).
6. **Any OTHER unit under test.** The owner may test a different unit than the healed one. The session row (13:43) points at the healed unit — but double-check for additional session rows / other recently-updated units with unresolved blocks ("Enriching…", "Countryside", "Vocabulary 1").

## 5. How to verify live state (no secrets needed for code reading; ask the owner for live queries)

- Dump the live block (owner runs with service key):
  `curl -s "https://xsdnzijketjnzhakqtit.supabase.co/rest/v1/units?select=id,title,last_updated,flow&id=eq.<unit-id>" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"`
- Session row: `.../rest/v1/classroom_sessions?select=*` (teacher-scoped).
- Function liveness: `POST .../functions/v1/generate-media` with just the anon `apikey` header → expect **401** (not 404). Use `/functions/v1/`, never `/functions/v2/` (returns empty 404 for all functions on this project).
- Frontend build identity: `curl -sI https://professor-ruby.vercel.app/teacher | grep last-modified` and inspect `sw.js` precache chunk names.
- Edge function logs: Supabase dashboard → Functions → logs (the resolver logs `media_resolution: N block(s) via <rungs>` on success and `media_resolution_failed: …` on swallow).

## 6. Constraints for your audit

- Region-safety: no OpenAI/Google/Anthropic model calls anywhere (OpenRouter only). No YouTube Data API key exists or will be added — keyless oEmbed only.
- Do not propose scraping YouTube from the product.
- The catalog lives in the `assets` table as described in §2.3 — 189 rows, verified.
- Recent commits to diff: `git log --oneline -8` and `git show 96d8b3b / 673388f`.
- Report ONLY. The implementation agent will fix.
