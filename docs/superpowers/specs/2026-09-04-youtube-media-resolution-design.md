# Keyless, age-aware YouTube song/video resolution — design

Date: 2026-09-04 · Follows `2026-09-04-live-media-and-unit-intro-design.md` (its Workstream B, deferred into this session) · Status: **APPROVED 2026-09-05 with amendments (§0.6–§0.8). W1 + W2 SHIPPED + DEPLOYED + LIVE-VERIFIED 2026-09-05: resolver core (30 vitest) + `resolve-media` action + orchestrate-lesson integration + enrich-unit prompt v2 deployed (generate-media / orchestrate-lesson / enrich-unit); catalog seeded to cloud (189 system asset rows, idempotent seed script); live e2e verified both entry paths (manifest-age and class-grade `ageBand`, suggestion-title rung → real Super Simple Songs URL persisted into units.flow + unit_media link). Remaining: W3 teacher surfaces (board honest state, vault picker, commander quick-resolve, class grade wiring) + W4 backfill script.**

---

## 0. Owner decisions & constraints locked before this design

1. **No YouTube Data API key — ever** (region-blocked history; AGENTS.md §5). Keyless solutions only.
2. **Region-safe AI only, via OpenRouter** (`moonshotai/kimi-k2.6` text, `deepseek/deepseek-chat` fallback). The account is currently restricted from closed-weight providers pending appeal, so anything that might route through Google/OpenAI/Anthropic is off the table.
3. **The system should resolve media by itself** — matching the students' AGE and the LESSON content — at generation time where possible. The teacher ALWAYS keeps a final override (paste their own link). A real search architecture, not a better paste box.
4. Playback is solved: react-player already embeds any real `videoUrl` on the board and student app. This design only has to **produce a good `videoUrl` (+ title/provenance)** and store it where the flow renderer reads it.
5. The fake-player UX on the board is removed regardless (prior spec B3 — folded into this design's Workstream C).
6. **(2026-09-05) Catalog-first, keyless.** The curated catalog is THE auto-resolution mechanism for v1. Owner-nominated channel base: Super Simple Songs, The Singing Walrus, and peers (see `docs/media/kids-song-channels-analysis.md`).
7. **(2026-09-05) Brave Search API is DEFERRED** — documented as a future web-search rung, candidate for **premium (Pro) users** (requires its own key, card on file, metered billing; see §8). Do not build in v1.
8. **(2026-09-05) Songs-only v1.** The video (non-song) catalog is a later wave using the same pipeline ("maybe do the same for video after that" — owner).

---

## 1. Audit (verified in source, 2026-09-04)

### 1.1 The broken chain — confirmed exactly as root-caused

1. **Generation emits suggestions, not videos.** `enrich-unit` asks the AI for `song_suggestions` / `video_suggestions` with only `{title, topic_relevance, search_query}` (`supabase/functions/enrich-unit/index.ts:661` classic mode, `:940-969` basket mode). Notably the AI is already asked for *real* titles ("Suggest REAL, existing children's educational media") — the titles are usually genuine; they are just never resolved to video IDs.
2. **The orchestrator bakes a search URL into the step.** `orchestrate-lesson` takes suggestion `[0]` (book songs first — see below) and emits a `MEDIA_PLAYER` block with `youtubeUrl = youtube.com/results?search_query=…` and **no `videoUrl`** (`supabase/functions/orchestrate-lesson/index.ts:28-34, 58-79`).
3. **The board fakes a player.** `BoardMediaPlayer` always renders full transport chrome (timeline, play/pause/skip); with nothing playable, Play runs `window.open(searchUrl)` → a YouTube search page opens in a new tab (`apps/board/templates/BoardMediaPlayer.tsx:59-71, 216-219`).
4. **The teacher override path exists and works, but its search UI is dead.** UnitContentVault (Media tab) persists `data.videoUrl` into `units.flow` (`UnitContentVault.tsx:202-203`), after which the board embeds and plays. But its YouTube search calls `generate-media` action `youtube-search` expecting the old Data-API shape `data.items[].id.videoId` while the edge returns only `{searchQuery, searchUrl}` (`generate-media/index.ts:203-213`, `UnitContentVault.tsx:340-368`) → zero results, silently.

### 1.2 Latent assets the design can harvest (things that already exist and work)

- **Book songs are captured verbatim.** For scanned textbooks, `buildBasketMedia` pushes the book's own songs ahead of AI suggestions with exact titles and transcribed lyrics (`source: 'book'`, `structure_id`, lyrics ride the manifest — `enrich-unit/index.ts:957-968`). A book song's exact title (+ the book's name) is a near-perfect resolution key.
- **The vault backbone is built and waiting.** `assets` already carries `owner_id`, `book_id`, `kind ('generated'|'uploaded'|'external_url')`, `source_url`, `tags TEXT[]`, `is_deleted` (migration `20260730000006`), plus the `unit_media` many-to-many (roles incl. `'song'`/`'video'`). That migration's own comment says songs/videos becoming media references "awaits a real media source (teacher-pasted URL / upload, Phase 3)". `recordVideoAsset` already writes `external_url` rows (`UnitContentVault.tsx:367-388`, today without `unit_media` links), and `ResourceLibrary` + `MediaPickerModal` already render them.
- **Sessions know the class.** `classroom_sessions` carries `class_id`, `unit_id` AND `class_plan_id`; `setActiveClass`/`setActiveUnit` persist all three (`store/SessionContext.tsx:1126-1181`). Full age context is joinable at live time.
- **`generate-class-flow` is deterministic** — it derives `class_plans.flow` from `units.flow` (`generate-class-flow/index.ts:81-97`). Anything resolved into the unit flow propagates to class flows on the next generate; no separate resolution path is needed there.
- **`_shared/ai.ts`** is a shared OpenRouter client any edge function can reuse.

### 1.3 Where AGE lives today (Question 1) — answer: nowhere usable

| Place | Reality |
|---|---|
| `classes.grade_level TEXT` | Column exists (`20260320000003`) but **no UI writes it**. Only `AdminService` reads it. `TeacherOnboarding` collects a Pre-K…4th-Grade/ESL-Beginner dropdown and **discards it** (dead UI — it navigates away without creating anything, `TeacherOnboarding.tsx:31`). The real create-class form (`ClassManagement.tsx:57-66`) sends name/subject/school only. |
| `units.level` | Hardcoded `'General'` at upload (`UploadTextbook.tsx:100`). Useless. |
| `manifest.gradeLevel` / `meta.difficulty_cefr` | AI-guessed CEFR-ish value from textbook content (`enrich-unit/index.ts:633`). A reasonable *fallback* signal, not a teacher-declared age. |
| `roster_students` | No age column (`metadata JSONB` only). `profiles` has none either. |
| enrich-unit prompts | Hardcode "children aged 6-12" (`enrich-unit/index.ts:646,652`). |

**Minimal addition (proposed):** no new columns. Wire the *existing* `classes.grade_level` into the create-class form + an inline edit on the class list (one `<select>`, same Pre-K…4th/ESL-Beginner options the onboarding already shows), and derive a **unit age band** from `manifest.gradeLevel` with a teacher override later if ever needed. Media selection is a *class-level* concern — per-student ages are YAGNI (a class is age-homogeneous for warm-up-song purposes; the teacher judges).

Age band model (shared const, `_shared/mediaResolver.ts`): `toddler (3-5)` · `early_primary (6-8)` · `upper_primary (9-12)` · `teen (13+)`, with a deterministic mapping from the grade strings + CEFR guesses.

---

## 2. Keyless building blocks — live-verified inventory (2026-09-04, curl from this machine)

| Mechanism | Keyless | What it gives | Verified | Verdict for us |
|---|---|---|---|---|
| **YouTube oEmbed** `youtube.com/oembed?url=<watch>&format=json` | ✅ | `title`, `author_name`, `author_url`, `thumbnail_url` for a KNOWN video. **404 on nonexistent/private IDs** (bogus-ID probe → 404). **CORS reflects any Origin** (probe with `Origin: professor-ruby.vercel.app` → `access-control-allow-origin` echoed) → usable from the teacher's browser AND from the edge. | ✅ live | **The validator.** Filters hallucinated IDs; powers preview cards. Rate-limit friendly with caching (429s reported in the wild). No duration field. |
| **suggestqueries** `suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=…` | ✅ | YouTube-scoped autocomplete strings. Queries, not videos. | ✅ live | Query refinement only (canonical phrasing, channel-name expansion). Minor utility. |
| **Channel RSS** `youtube.com/feeds/videos.xml?channel_id=…` | ✅ | Latest ~15 uploads per channel: videoIds + titles. | ✅ live | **Catalog freshness.** ToS-benign refresh mechanism for allowlisted kids channels. Not a search. |
| **Search-results HTML** (`/results?search_query=` → `ytInitialData`) | ✅ | Full structured results: videoId, title, author, length, views (parsed a real query successfully). | ✅ from a **residential IP only** | **Rejected as infrastructure** (§3-C): datacenter egress (Supabase ap-south-1) faces bot defense/consent walls; YouTube ToS prohibits automated access; maintenance treadmill. |
| **OpenRouter `:online` models** | ✅ (paid) | Web-grounded search appended to any model. | ⚠️ docs + community reports | Weak rung at best: open-weight models have documented "faking web results" reliability issues; interaction with the account's closed-weight restriction is unverified. Not recommended. |
| **Invidious / Piped public instances** | ✅ | REST search proxies. | — | Rejected (§3-C). |

---

## 3. Candidate architectures (Question 2) — honest evaluation

### A. AI proposes concrete video IDs at enrichment → oEmbed validates each

| Dimension | Assessment |
|---|---|
| Hit rate | **Low for exact IDs.** YouTube IDs are opaque 11-char strings; LLMs hallucinate them routinely. The ultra-famous kids canon (Baby Shark-class) is memorized; the long tail ≈ 0%. **But title/channel knowledge is strong** — the asymmetry matters (see B). |
| Hallucination risk | High per-candidate, **fully filtered** by oEmbed (404) + title-similarity check against the claimed title. Failures become clean misses, not wrong videos. |
| ToS | Clean. |
| Cost | ~1 extra AI field + 3-6 keyless HTTP probes per unit. Negligible. |
| Failure mode | Usually "no resolution" → falls through to the next rung. |

**Verdict: keep as the cheapest automatic rung (a lottery ticket that costs nothing), NOT the core.**

### B. Reusable curated library — seed catalog + teacher-resolves-once flywheel ⭐ RECOMMENDED CORE

The kids warm-up song universe is small and famous (Super Simple Songs, CoComelon, Steve and Maggie, Dream English Kids, ELF Kids, Bounce Patrol, Pinkfong, Little Baby Bum, Sesame Street…). A seeded catalog of ~150-300 verified entries covers the bulk of primary-ESL topics (greetings, colors, numbers, family, body, animals, weather, food, clothes, transport, school, feelings, actions, holidays…). Resolution = match lesson (book-song title → suggestion title → topic/vocab/age tags) against the catalog. Every teacher resolution is recorded back (extend existing `recordVideoAsset`) with tags → the library grows and re-suggests itself.

| Dimension | Assessment |
|---|---|
| Hit rate | **High for warm-up songs** (that's what warm-up steps are). Medium for arbitrary textbook-video topics → falls through. |
| Hallucination risk | None — every catalog entry is oEmbed-verified at seed time and re-verifiable via RSS. |
| ToS | Fully clean. |
| Cost | ~zero per resolution (SQL + at most one cheap AI-ranking call). |
| Maintenance | One-time seed curation (reviewable data file the owner approves) + optional RSS refresh; flywheel thereafter. |
| Infrastructure | **Already built** — `assets` (kind/tags/source_url) + `unit_media` + ResourceLibrary/MediaPickerModal are the vault backbone, currently empty and explicitly awaiting exactly this. |

### C. Third-party search proxies & scraping (Invidious/Piped, InnerTube, results-page HTML) — REJECTED, as expected

- **Public Invidious/Piped instances**: chronically flaky, rate-limited, die under YouTube's blocking of them; routing a **paid product** through volunteer proxies is an operational liability.
- **InnerTube (`youtubei/v1/search`)**: undocumented internal API; increasingly gated by PO-token bot defense from datacenter IPs; using it means impersonating a YouTube client — the same ToS problem, worse stealth requirements.
- **Results-page scraping**: *technically works today* (verified §2) but (1) YouTube ToS explicitly prohibits automated access outside official interfaces — real exposure for a Stripe-billed product; (2) Supabase edge egress is datacenter IP space where consent walls/bot checks are common — my residential probe proves parsing, not edge viability; (3) `ytInitialData` shape drifts — a permanent maintenance treadmill.

Documented and rejected. If the owner ever explicitly accepts the ToS gray zone, the constrained variant would be a *teacher-triggered, low-volume* edge scrape behind a flag — not built without sign-off (§8).

### D. Other keyless avenues found (the brainstorm core)

- **D1 — Title→ID harvesting via the catalog** (the key insight): the AI already names *real songs by title*; book scans give *exact* song titles. Neither needs "search" if the title exists in a verified catalog. This converts Option A's weakness (ID recall) into a strength (title recall) and is folded into B.
- **D2 — suggestqueries autocomplete**: query canonicalization only (§2). Folded in as a minor refinement.
- **D3 — Channel RSS**: catalog freshness without any key (§2). Folded into B's maintenance.
- **D4 — OpenRouter `:online`**: listed for completeness (§2); reliability and restriction concerns — not in the ladder.
- **D5 — Teacher's browser as the fetcher**: the browser can *reach* youtube.com but CORS blocks *reading* cross-origin responses, and no JSONP endpoint returns search results. Only oEmbed (which reflects Origin) is browser-readable. No avenue here beyond oEmbed validation.

---

## 4. Recommended design — a five-rung resolution ladder

**One resolver module, three entry points, two stores.** Nothing in the ladder can block or fail the generation pipeline; every rung is deadline-bounded and best-effort.

### 4.1 The ladder (`_shared/mediaResolver.ts`, new)

Input context per MEDIA_PLAYER block: `{ unitId, blockTitle, kind (song|video), searchQuery, topic, vocab[], ageBand, bookSongTitle? }`.

| Rung | Mechanism | Auto-applies? |
|---|---|---|
| 1. **Book-song match** | Exact/normalized book-song title (+book name) → catalog title lookup; miss → AI-ID lottery (rung 4) | ✅ if catalog hit |
| 2. **Suggestion-title match** | AI suggestion's *real* title → fuzzy catalog title match | ✅ if hit |
| 3. **Topic/age tag match** | Catalog `tags` overlap on (topic, vocab words, age band), ranked; optional single AI call to pick among top candidates with judgment | ✅ top hit above confidence threshold |
| 4. **AI-ID lottery + oEmbed validation** | One AI call proposes up to 5 `{videoId, title, channel}` candidates; each oEmbed-validated (404 drops; title-similarity gate: normalized token overlap ≥ 0.5 between the oEmbed title and the AI's claimed title) | ⚠️ **only if channel ∈ allowlist AND title matches**; otherwise becomes a one-click candidate chip |
| 5. **Teacher** | Paste URL (oEmbed-validated preview) · catalog picker · "Open YouTube search ↗" | Teacher = truth |

Channel allowlist (~15 famous kids channels) lives beside the resolver; auto-apply outside the allowlist never happens. oEmbed probes run in parallel with a ~4s deadline; catalog lookups are plain SQL.

**Deferred future rung (owner decision 2026-09-05, do NOT build in v1): web-search resolution via Brave Search API** — dedicated video endpoint (`api.search.brave.com/res/v1/videos/search`) returning urls + duration + thumbnails across platforms; would slot between rung 4 and the teacher as a **premium (Pro) feature** (own API key, card-on-file, ~$5/1k queries, possible "Powered by Brave" attribution). Documented in §8.

### 4.2 Where resolution runs (Question 3)

| Stage | Role | Age context |
|---|---|---|
| `enrich-unit` | **Emit richer suggestions, don't resolve.** Extend the media prompt to also return `channel_name` + optional `video_id` guesses (feeds rung 4 later) and replace the hardcoded "6-12" with the unit's age band | manifest-derived band |
| `orchestrate-lesson` | **Resolve.** After building the flow, for each `MEDIA_PLAYER` block without `videoUrl`, run the ladder (fire-and-forget inside the same invocation, hard timeout, never fails orchestration) and merge the result into the block before saving `units.flow` | manifest-derived band (unit-scoped truth: the textbook fixes the age) |
| `generate-class-flow` | **No change** — deterministically inherits resolved blocks from `units.flow` | — |
| `generate-media` action `resolve-media` (new, thin) | **On-demand entry**: vault "Find video", commander "Resolve now", backfill script. Accepts optional `classId` | `classes.grade_level` when a class is bound (live session), else unit band |
| Live session | Commander/remote quick-resolve UI (paste + preview + catalog picker + Apply) → persists to the **active flow source** (`units.flow` or `class_plans.flow`) and broadcasts `MEDIA_RESOLVED` so tabs re-hydrate (same mechanic as prior spec §2.3) | session's class |

`resolve-media` reuses `generate-media`'s existing auth/rate-limit plumbing rather than adding a whole new deployable function; `orchestrate-lesson` imports the resolver directly (no edge-to-edge HTTP).

### 4.3 Where results are stored (Question 3) — both, with clear roles

- **Flow block data = the render truth** for this lesson step (the board must render synchronously; the block stays self-contained). New fields, all optional/backward-compatible (absence = today's unresolved state):
  `videoUrl`, `videoTitle`, `videoChannel`, `videoThumbnailUrl`, `resolvedVia ('catalog'|'book'|'ai'|'teacher'|'rss')`, `resolvedAt`, `ageBand`, plus `candidates[]` (top 3 unapplied, for the UI chips).
- **`assets` + `unit_media` = the media-item truth** (reusable, taggable, already rendered by the vault UI). The system catalog = `assets` rows with `owner_id IS NULL`, `unit_id IS NULL`, `type='video'`, `kind='external_url'`, tagged `topic:*`, `vocab:*`, `age:*`, `source:seed|teacher`, `metadata {videoId, channelId, durationSec, verifiedAt}`. No new table — one media store, per the vault backbone's own design intent. Teacher resolutions keep flowing through `recordVideoAsset` (now also writing `unit_media` + tags so they re-suggest).

### 4.4 Age-safety (Question 4)

1. **Construction-safe default**: catalog + allowlisted channels only for auto-apply; seeded entries are oEmbed-verified with sane durations (songs 1-6 min, videos ≤ ~15 min, recorded at seed time).
2. **Screening signals available keylessly**: oEmbed `title` + `author_name` (title keyword blocklist for obvious red flags; author must be allowlisted for rung-4 auto-apply). oEmbed has no duration/age-rating field; watch-page `isFamilySafe` would require scraping — rejected with §3-C.
3. **Transparency**: every auto-resolved block shows provenance on the board suggestion state and in the vault ("Auto-picked: *One Little Finger* — Super Simple Songs · Change"). Teachers see what chose what.
4. **Teacher supremacy**: paste/picker/search-link always available pre- and mid-lesson; a teacher override marks the asset `source:teacher` and wins every future re-resolution for that unit.

### 4.5 Fallback ladder on the board (Question 5)

1. `videoUrl` present → real embedded player (unchanged).
2. Unapplied `candidates[]` → suggestion card + candidate chips with thumbnails (teacher applies from commander, one click).
3. Nothing resolved → **honest suggestion card**: title, `topic_relevance`, "Open YouTube search ↗" as a deliberate secondary action, teacher hint ("Pick a video from the Commander"), **no fake transport chrome** (prior spec B3 folded in here).

---

## 5. Healing already-generated units (no full re-orchestration)

- **Targeted flow patch**: the resolver/backfill updates only the `MEDIA_PLAYER` block's `data` inside `units.flow` (read-modify-write of the JSONB) — never regenerates the lesson.
- **Backfill script** `scripts/media/seed-catalog.ts` + `scripts/media/backfill-media.ts` (`--unit <id> | --all`, dry-run default, mirrors `illustration-backfill.ts` conventions): walks units, finds unresolved blocks, runs the ladder, reports a hit-rate table.
- **On-demand**: vault "Find video" and commander "Resolve now" heal single units any time.

---

## 6. Implementation plan (workstreams; estimates assume approval)

| # | Task | Files | Est. |
|---|---|---|---|
| **W1 — Resolver core (edge)** | | | |
| W1.1 | `_shared/mediaResolver.ts`: age-band mapping, allowlist, catalog lookup (SQL tag/title scoring), AI-candidate call via `_shared/ai.ts`, oEmbed validator w/ deadline + title-similarity gate, ladder orchestration; vitest for the pure parts | `supabase/functions/_shared/mediaResolver.ts` (new) + `tests/` | 1 d |
| W1.2 | `resolve-media` action on `generate-media` (thin wrapper: auth → resolver → write-back + asset/unit_media upsert) | `supabase/functions/generate-media/index.ts` | 0.5 d |
| W1.3 | `orchestrate-lesson`: resolve MEDIA_PLAYER blocks pre-save (deadline-bounded, non-fatal) | `supabase/functions/orchestrate-lesson/index.ts` | 0.5 d |
| W1.4 | `enrich-unit`: media prompt v2 — emit `channel_name` + `video_id` guesses + age band in prompts (replace hardcoded 6-12) | `supabase/functions/enrich-unit/index.ts` | 0.5 d |
| **W2 — Catalog** | | | |
| W2.1 | ~~Seed data file~~ **DONE 2026-09-05 (v0, 189 entries / 33 topics / 17 channels)** — every entry live-resolved + oEmbed-verified + title-reviewed. Channel analysis: `docs/media/kids-song-channels-analysis.md`. **Owner review of `scripts/media/catalog-seed.json` still required before seeding** | `scripts/media/catalog-seed.json` ✓, `scripts/media/harvest-catalog.mjs` ✓ | done |
| W2.2 | `seed-catalog.ts`: oEmbed-verify every entry at seed time (skip+log failures), insert as system `assets`; optional RSS refresh mode | `scripts/media/seed-catalog.ts` (new) | 0.5 d |
| **W3 — Teacher surfaces (frontend)** | | | |
| W3.1 | URL/oEmbed helpers (`services/youtubeUrl.ts`: parse watch/youtu.be/shorts/embed/nocookie → canonical URL + videoId; oEmbed fetch w/ graceful offline fallback) + vitest | `services/youtubeUrl.ts` (new) | 0.5 d |
| W3.2 | `BoardMediaPlayer` honest unresolved state + candidate chips (fold of prior B3) | `apps/board/templates/BoardMediaPlayer.tsx` | 0.5 d |
| W3.3 | UnitContentVault Media tab: fix dead search → suggestion list w/ "Open search ↗", catalog picker (MediaPickerModal), paste w/ validated preview, "Find video" (resolve-media), provenance badges | `apps/teacher/UnitContentVault.tsx` | 1 d |
| W3.4 | Commander/remote quick-resolve (paste + preview + picker + Apply → persist to active flow source + `MEDIA_RESOLVED` broadcast re-hydrate; fold of prior B5) | `apps/teacher/live/panels/ContextualControls.tsx`, `apps/remote/TeacherRemote.tsx`, `store/SessionContext.tsx` | 1 d |
| W3.5 | Age wiring: grade select in create-class form + inline class edit (persist `classes.grade_level`); onboarding dead dropdown wired or removed | `apps/teacher/ClassManagement.tsx`, `TeacherOnboarding.tsx` | 0.5 d |
| **W4 — Backfill & docs** | | | |
| W4.1 | `backfill-media.ts` (dry-run default) + run report | `scripts/media/backfill-media.ts` (new) | 0.5 d |
| W4.2 | AGENTS.md §9 row + spec status flip | `AGENTS.md`, this file | 0.25 d |

**Sequencing:** W1.1+W1.2 first (resolver + action → immediately usable by W3.3), then W2 (catalog makes auto-resolution real), W1.3/W1.4 (pipeline integration + edge deploys), W3 (surfaces), W4 last. Total ≈ 6-7 focused days.

**Deploys:** `generate-media`, `orchestrate-lesson`, `enrich-unit` (manual `supabase functions deploy` — they do NOT auto-deploy, AGENTS.md §7). Frontend via push-to-master. No DB migration required (§4.3 reuses existing schema).

**Acceptance:** for a set of ≥10 freshly scanned units whose topics are covered by the seed catalog, ≥60% get a playable warm-up song with zero teacher action, and no unresolved step ever shows fake-player chrome; a pasted URL heals a live class in one click and persists; every auto-picked video is from an allowlisted channel with a validated title; the backfill report shows per-rung hit rates; `npm test` green (resolver + URL helpers).

---

## 7. Risks & open questions

- **Catalog coverage is the hit rate.** The seed list's quality decides everything; topics outside it fall to the AI lottery or the teacher. Mitigation: the flywheel + a periodic review of backfill miss-reports (which topics failed → curate them next).
- **AI-ID lottery may resolve to a *valid but wrong* video** (oEmbed title check catches most; allowlist catches the rest). Residual risk accepted for auto-apply only within allowlisted channels.
- **oEmbed rate limiting / regional blocks**: mitigate with caching (`resolvedAt` + asset reuse); the teacher browser fallback validates via reflected CORS.
- **`MEDIA_RESOLVED` broadcast re-hydrate** is the only integration needing live two-tab verification (prior spec §2.3 fallback documented: persisted URL still sticks after a board reload).
- **Open question (owner)**: seed catalog size/scope — start songs-only (~150) or include videos (~+100)? Recommendation: songs-only v1; warm-up songs are the actual product surface today.
- **Open question (owner)**: treat `manifest.gradeLevel` (AI guess) as the unit age band silently, or surface it in UnitStudio for teacher confirmation? Recommendation: silently v1, surface later if misses look age-mismatched.

## 8. Explicitly rejected / deferred

- Third-party proxies & scraping in any automatic role (§3-C). Teacher-triggered edge scrape behind a flag: only if the owner explicitly accepts the ToS gray zone.
- OpenRouter `:online` search (D4) — unreliable grounding + account-restriction unknowns.
- **Brave Search API rung — DEFERRED (owner 2026-09-05)**, candidate premium(Pro)-user feature. Verified feasible 2026-09-04: dedicated video endpoint `GET api.search.brave.com/res/v1/videos/search` (url + duration + thumbnails, `safesearch=strict`, `site:` support); free tier is gone (Feb 2025) → $5 monthly credits + card on file + metered $5/1k; ToS may require "Powered by Brave" attribution. Discovery via an official SERP API + oEmbed validation + iframe playback = all sanctioned surfaces. When built: slot after rung 4, behind the Pro flag, spend-capped; probe Brave's video-index ranking for kids-ESL queries with ~10 real unit queries first.
- Per-student ages, CEFR-certification flows, karaoke lyric sync beyond the existing `lyrics` field.
- Student solo app changes (it renders `videoUrl` already when present; unresolved student-side states are a separate UX question).

## 9. Follow-ups queued (not this design)

- RSS-driven catalog freshness job (pg_cron or on-demand script mode).
- "Age band" surfacing in UnitStudio; per-class plan overrides when the same unit is taught to differently-aged classes (today: teacher override covers it).
- Video (non-song) catalog expansion once songs prove the flywheel.
