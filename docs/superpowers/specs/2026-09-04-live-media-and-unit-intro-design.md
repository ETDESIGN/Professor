# Live-class media resolution + unit intro screen — design & implementation plan

Date: 2026-09-04 · Owner-reported issues, audited from source · Status: **Workstream A SHIPPED (commit `7e6d175`, Vercel + generate-class-flow/orchestrate-lesson deployed 2026-09-04, incl. approved task A4 Team-Splash block). Workstream B (media resolution) DEFERRED to a dedicated brainstorm session — owner wants an age/lesson-aware YouTube search architecture explored before implementing; the teacher-paste baseline (§2.1 Option A) remains the fallback floor.**

---

## 0. Owner decisions locked before this design

1. **The team splash screen ("English Class" + theme + Red/Blue trophies) is KEPT byte-for-byte.** It is intended for *team-game starts* (dedicated team games, or teacher-chosen team exercises in the lesson arc) — not as the unit intro. Where exactly it gets triggered is deliberately undecided for now; we register it under a new dormant type so it is reachable later without touching its code.
2. **The unit intro must show the unit's generated image** (illustration-v2 cover) with the unit title etc.
3. Region-safe constraints (AGENTS.md §5) apply: no YouTube Data API key exists or will be added; OpenRouter-only AI. Any media fix must work **keyless**.

---

## 1. Audit findings

### Issue 1 — "Video/music page: clicking play opens a YouTube *search* page"

Root-cause chain (all verified in source):

1. **Generation produces suggestions, not videos.** `enrich-unit` asks the AI for `song_suggestions` / `video_suggestions` with only a `search_query` (no URL) — `supabase/functions/enrich-unit/index.ts:661,956`.
2. **The orchestrator bakes a search URL into the lesson step.** `orchestrate-lesson` takes suggestion `[0]` and emits a `MEDIA_PLAYER` block with `youtubeUrl = https://www.youtube.com/results?search_query=…` and **no `videoUrl`/`audioUrl`** (`supabase/functions/orchestrate-lesson/index.ts:31-34, 58-79`). The comment states the reason: YouTube Data API is region-blocked / keyless.
3. **The board renders a full video-player UI regardless.** `BoardMediaPlayer` always shows the "Warm Up Song" chrome (progress timeline, play/pause/skip transport). When there is nothing playable, the big Play button runs `window.open(youtubeUrl)` → **a YouTube search-results page opens in a new tab** (`apps/board/templates/BoardMediaPlayer.tsx:59-71, 216-219`); there is also an explicit "Play on YouTube" link (`:176-183`). It *looks* like a broken player; it is actually an unresolved suggestion.
4. **The intended fix path already exists but is broken/hidden.** `UnitContentVault` (Media tab) can set a real `videoUrl` on the step (persisted into `units.flow`, after which ReactPlayer embeds and plays it on the board — `UnitContentVault.tsx:202-203, 386-395`). But its YouTube search calls `generate-media` action `youtube-search` expecting the **old YouTube Data API response shape** (`data.items[].id.videoId`), while the edge now returns only `{searchQuery, searchUrl, message}` (`generate-media/index.ts:203-213`, `UnitContentVault.tsx:340-368`) → the search silently shows **zero results** (no error). Teachers therefore never discover the picker, and every warm-up step ships as "search-link in a fake player".

Net effect: 100% of unresolved media steps (i.e., effectively all of them today) present the confusing fake-player → search-page experience. Once a `videoUrl` IS present, embedding/playback already works (react-player YouTube config is already wired in both board and solo players).

### Issue 2 — "Unit intro screen is the team/points screen"

- Every flow's slide 0 is guaranteed to be `INTRO_SPLASH` (`supabase/functions/_shared/flowTypes.ts:143-151`; emitted by `orchestrate-lesson/index.ts:53-56`, preserved by `classFlow.ts:65-68`, added by `PlanComposer.tsx:466`).
- `boardMap.tsx:54` maps `INTRO_SPLASH → BoardIntroSplash` — the screen with:
  - "English Class" — a **hardcoded fallback**; `data.class_name` is never written anywhere in the codebase (`BoardIntroSplash.tsx:29`);
  - a giant theme word — `data.theme`, only set by PlanComposer autoBuild; orchestrated flows carry `title/subtitle` instead, so this is often blank;
  - **Team Red vs Team Blue trophies with summed student points** — 0 : 0 in every session that hasn't run the remote's Team Builder (`BoardIntroSplash.tsx:10-16, 36-50`); teams exist (`assignTeams`, Phase A.3, remote "Teams" button) but are not part of unit start;
  - a decorative static "Ready for Teacher Connection…" footer (leftover; the board is connected when it renders this).
- **The desired intro material already exists and is already client-side**: `units.cover_image` (written by the illustration pipeline, `_shared/illustration.ts:171`), loaded as `activeUnit.coverImage` (`SupabaseService.ts:97`; `getUnitById` selects `*`). `UnitList` already renders covers. The board, commander preview and remote all share `SessionContext`, and `BoardRenderer`/`ClassroomBoard` render through the same `BOARD_MAP` — so one mapping change updates every surface.
- Known gap: ~107 legacy units have no cover (AGENTS.md §9 illustration row) → the new intro needs a graceful fallback.

---

## 2. Design

### 2.1 Issue 1 — teacher-resolved, keyless video resolution (recommended: Option A)

**Option A (recommended) — teacher-in-the-loop resolution + honest board UI.** No API keys, no ToS gray zones, works with existing storage/playback plumbing.

1. **Honest board state.** When a `MEDIA_PLAYER` step has no playable URL, stop rendering the dead transport (timeline / play-pause / skip). Keep the existing suggestion card (title, `topic_relevance`, "Play on YouTube ↗" as a deliberate secondary action) and add a short teacher hint ("Pick a video from the Commander to play it here"). Once `videoUrl`/`audioUrl` exists, behavior is unchanged (real player).
2. **Fix discovery in UnitContentVault (Media tab).** Replace the dead API-shape search with a keyless flow: list **all** `song_suggestions` + `video_suggestions` (today only `[0]` is ever used), each with "Open YouTube search ↗" (uses the suggestion's `search_query`); keep the paste-URL box as the primary resolution control.
3. **Keyless URL validation via YouTube oEmbed** (new pure helper + client fetch): `https://www.youtube.com/oembed?url=<watch-url>&format=json` requires **no key** and returns title + thumbnail → gives the teacher a real preview card ("✓ *Super Simple Songs — One Little Finger*") and blocks typos/hallucinated IDs. CORS on this endpoint is permissive; if the fetch fails (offline/firewall), accept the URL with a warning instead of blocking the teacher.
4. **Live quick-resolve (the important one).** New contextual controls in `LiveCommander` (and the phone `TeacherRemote`) when the current step is a `MEDIA_PLAYER` without playable content: paste-URL field (oEmbed-validated) + "Open YouTube search ↗" + **Apply**. Apply persists the resolved URL into the **active flow source** (`class_plans.flow` when a class plan drives the session, else `units.flow`) and nudges all tabs (see §2.3). This means a teacher mid-lesson fixes it in ~15 seconds without leaving the commander.

**Option B — AI-suggested concrete video IDs validated by oEmbed** (auto-resolution): the AI suggests specific well-known video IDs; each is validated keylessly before use. Likely low hit-rate (model knowledge of ESL-kids video IDs is weak; hallucinated IDs are common — validation just filters them out). **Rejected as the core path**; can layer onto A later as a convenience (pre-fill candidates in the vault picker).

**Option C — third-party YouTube search proxies (Invidious/Piped instances).** Public instances are flaky, and routing around YouTube's API is a ToS/maintenance liability for a paid product. **Rejected.**

### 2.2 Issue 2 — flip the mapping: `INTRO_SPLASH` becomes the unit intro; team splash moves to a dormant `TEAM_SPLASH`

**Option 1 (recommended) — repoint the existing type.**
- `INTRO_SPLASH` — the type that *every* generated and already-persisted flow already has at index 0 — is re-mapped in `boardMap.tsx` to a **new `BoardUnitIntro`** component: full-bleed unit cover (`activeUnit.coverImage`) with a gradient scrim, unit title (`data.title || activeUnit.title`), subtitle (`data.subtitle || data.theme || activeUnit.topic`), an optional theme chip, and the phase pill. Fallback art (gradient + first-letter monogram) when no cover exists.
- `BoardIntroSplash` (code untouched, visuals untouched) is registered under a **new type `TEAM_SPLASH`**, added to `SUPPORTED_FLOW_TYPES`, `PlanComposer`'s block palette and `BoardShell.FULL_BLEED_TYPES`. Nothing emits it automatically yet — it is dormant, exactly per the owner's "keep it, we'll decide where it lives" decision.
- **Zero DB migration**: existing `units.flow` / `class_plans.flow` rows instantly get the correct unit intro because they already carry `INTRO_SPLASH` at index 0; the cover is read at render time from `activeUnit` (so cover re-generation propagates without re-orchestration).

**Option 2 — new `UNIT_INTRO` type + JSONB backfill migration** across `units.flow` and `class_plans.flow`. Cleaner naming, but a data migration + dual-type handling for no additional user-visible benefit. Rejected.

**Option 3 — keep one type and render conditionally (teams assigned → team splash).** Implicit, state-dependent, and conflicts with "keep it for later". Rejected.

**Future triggers for `TEAM_SPLASH` (documented now, NOT wired):** (a) the opening slide of dedicated team games when they exist; (b) a teacher-inserted step in PlanComposer before team exercises in the lesson arc; (c) auto-interstitial when the remote's Team Builder assigns teams during an ASSESS step. When the owner picks one, only the emitting side changes — the component is already registered. (Optional quick win, flagged for approval: allow inserting a "Team Splash" block from PlanComposer's palette so the screen is reachable today.)

### 2.3 Mid-session flow edit propagation (one mechanic to verify during implementation)

Slide *position* syncs across tabs via `classroom_sessions` realtime, but flow *content* is hydrated from DB at mount. After a live-resolve Apply: (1) persist to the flow source; (2) broadcast a lightweight action (e.g. `MEDIA_RESOLVED`) on the existing broadcast bus; (3) board/remote tabs handle it by re-fetching the unit/class-plan flow and recomputing the current slide data (the same hydrate path used at mount). Fallback if the broadcast proves unreliable in testing: the teacher taps the board tab once (reload) — the persisted URL still sticks for all future sessions. This is the only integration point needing live verification.

---

## 3. Implementation plan

Frontend-first; **no edge-function deploys are required** for the core fix (an optional sync edit to `_shared/flowTypes.ts` + `orchestrate-lesson`'s phase map is included as a small, separate step).

### Workstream A — Unit intro screen (frontend only)

| # | Task | Files |
|---|---|---|
| A1 | New `BoardUnitIntro` template: full-bleed cover + scrim + title/subtitle/theme chip + no-cover fallback | `apps/board/templates/BoardUnitIntro.tsx` (new) |
| A2 | Remap `INTRO_SPLASH → BoardUnitIntro`; register `TEAM_SPLASH → BoardIntroSplash` (component untouched); add both to `FULL_BLEED_TYPES` | `apps/board/templates/boardMap.tsx`, `apps/board/BoardShell.tsx` |
| A3 | Register `TEAM_SPLASH` in the shared allow-list + phase map (dormant; keeps the "source of truth" comment honest) | `supabase/functions/_shared/flowTypes.ts`, `orchestrate-lesson/index.ts` (PHASE_FOR_TYPE) — small edge deploy |
| A4 | PlanComposer: palette entry + icon/chip + phase default for `TEAM_SPLASH` (insertable block) — **flagged for owner approval** | `apps/teacher/PlanComposer.tsx` |
| A5 | LiveCommander contextual controls: none needed (intro is passive; teacher advances as today) | — |

Acceptance: start any live class → slide 0 shows the unit cover + title (fallback art when coverless); the team screen is no longer shown at unit start; `TEAM_SPLASH` inserted via PlanComposer (if A4 approved) renders the original screen verbatim.

### Workstream B — Media resolution (frontend only)

| # | Task | Files |
|---|---|---|
| B1 | Pure URL helper: parse `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `nocookie` forms → canonical watch URL + videoId; `youtubeSearchUrl(query)` (dedupe the 3 copies that exist today) | `services/youtubeUrl.ts` (new) + vitest |
| B2 | oEmbed validation helper (title + thumbnail, graceful offline fallback) | `services/youtubeUrl.ts` or `services/MediaService.ts` |
| B3 | `BoardMediaPlayer` unresolved state: hide dead transport; keep suggestion card + "Play on YouTube ↗" secondary + teacher hint | `apps/board/templates/BoardMediaPlayer.tsx` |
| B4 | UnitContentVault Media tab: list all suggestions with "Open search ↗"; remove dead `data.items` search grid; paste-URL + validated preview (save path already persists `videoUrl` into the flow) | `apps/teacher/UnitContentVault.tsx` |
| B5 | Live quick-resolve in commander contextual controls (paste + validate + open-search + Apply → persist to active flow source + broadcast refresh, §2.3); mirror a compact version on `TeacherRemote` | `apps/teacher/live/panels/ContextualControls.tsx`, `apps/remote/TeacherRemote.tsx`, `store/SessionContext.tsx` (broadcast handler + flow re-hydrate) |
| B6 | Reuse helper in `generate-media` callers if trivial; do NOT change the `youtube-search` action contract (still returns `searchUrl`) | — |

Acceptance: paste a real YouTube URL in the commander during a live class → video plays embedded on the board in the same session (or after one board reload if B5's broadcast needs the fallback); the URL persists (restarting the class keeps the video); unresolved steps show the honest suggestion card and never open a search tab from the Play button; `npm test` green (new vitest suite for B1/B2).

### Workstream C — docs & deployment

- Update `AGENTS.md` §9 (known-issues row: media resolution + intro remap) and a short note in `docs/FIXPLAN_INDEX.md` if it tracks this workstream.
- Deploy: push to `master` → Vercel auto-deploy; verify per AGENTS.md §7 (`last-modified` on `/teacher`, `sw.js` chunk grep for `BoardUnitIntro`). Optional edge deploy for A3 (`supabase functions deploy orchestrate-lesson`). PWA: already-open tabs get the update banner (§8.1) — expected, not a bug.

### Sequencing & estimates

A1→A2 are one commit (visible win, ~half day). B1/B2 pure helpers + tests (~half day). B3/B4 (~half day). B5 is the only nontrivial integration (~1 day incl. the §2.3 verification). A3/A4 + docs (~1 hour). Total ≈ 2.5–3 focused days.

### Risks / open questions

- **B5 propagation mechanic** (§2.3) is the only piece needing live two-tab verification; fallback documented.
- **Coverless units** (~107): fallback art ships in A1; the existing illustration backfill (`scripts/testing/illustration-backfill.ts`) closes the gap independently.
- **Network regions where youtube.com/oEmbed is blocked**: validation degrades to warn-and-accept (B2) — playback itself would fail there anyway, which is out of scope.
- **`data.class_name` dead field** on the old splash: left as-is (component untouched); wire it when `TEAM_SPLASH` gets its real trigger.

### Out of scope

Auto-resolution via AI video IDs (Option B) — revisit later as a vault enhancement. Student solo app intro restyle (it already has its own non-team intro). Karaoke lyrics sourcing. Any team-game mechanics.
