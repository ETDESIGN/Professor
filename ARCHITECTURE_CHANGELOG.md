# Architecture Changelog

Living log of architectural changes to the Professor platform. Append-only.
Each entry references the audit finding it addresses (see
`DOWNSTREAM_PIPELINE_AUDIT.md` for the original P0/P1/P2 grading).

Canonical source-of-truth rules introduced here:
- **Edge function JSON parsing** → `supabase/functions/_shared/json.ts`
- **Board flow contract** → `supabase/functions/_shared/flowTypes.ts`
- **Speech-to-text** → `supabase/functions/_shared/stt.ts`
- **Image generation** → `supabase/functions/_shared/imageProvider.ts`
- **Live classroom session** → `classroom_sessions` table + Realtime

---

## 2026-06-23 — Hotfix: systemic edge-function 546 (unbounded AI fetches)

**Symptom:** after the orchestrate-lesson fix, the lesson builder then failed at
**enrich-unit** with the same 546. Root cause was systemic: EVERY AI-calling edge
function (`extract-page`, `generate-lesson`, `enrich-unit`) had **unbounded AI
fetches + `max_tokens: 25000`**. `enrich-unit` compounded it (3 models × 45 s =
135 s > wall-clock). Any slow/hung model stalled the function until the platform
killed it (546).

**Fix — bounded every AI fetch:**
- New shared helper `_shared/ai.ts` (`fetchChatCompletion` / `healJson`) with a
  built-in `AbortSignal.timeout` + capped `max_tokens` + model fallback.
  `extract-page` now routes through it.
- `enrich-unit`: per-model timeout 45 s → 25 s; `max_tokens` 25000 → 5000.
- `generate-lesson`: all 4 fetches (differentiate, core, 2 healers) bounded
  (25–30 s) + `max_tokens` capped to 3000–6000.
- (`orchestrate-lesson` was already bounded in the prior hotfix.)

**Result:** no AI-calling function can hang past the wall-clock limit. A slow or
unreachable model now times out and falls back to the next model / deterministic
path instead of 546-ing.

### Verification / deploy
- Redeployed `extract-page`, `generate-lesson`, `enrich-unit`. No new lint errors.

---

## 2026-06-23 — Hotfix: orchestrate-lesson 546 (AI call hang / timeout)

**Symptom:** building a lesson failed with "Edge Function returned a non-2xx
status code" / HTTP **546** from `orchestrate-lesson`.

**Root cause:** the function booted fine (401 without auth, identical to a
working function), and `serveEdgeFunction` catches all throws and returns 500 —
so a 546 meant the platform **killed the function (wall-clock timeout)**. The
AI call (`moonshotai/kimi-k2.6`, reasoning model) had `max_tokens: 25000` and
**no fetch timeout**, so a slow/hung model stalled the invocation until
Supabase's limit killed it. (Had the key been invalid it would have
fast-fallen-back to the transformer and succeeded, not 546'd.)

**Fix (`orchestrate-lesson`):**
- Bounded the AI + healer fetches with `AbortSignal.timeout(30000 / 25000)`. A
  slow/hung model now times out and falls back to the next model or the
  deterministic transformer instead of hanging.
- Reduced `max_tokens` 25000 → 6000 (a flow JSON is a few KB; the old cap made
  the model reason far too long).
- Defense-in-depth: wrapped flow generation (`transformManifestToFlow` +
  `validateAndNormalizeFlow`) in try/catch so an unexpected throw yields a
  minimal valid flow + a reported error rather than a crash.

**Result:** the function can no longer hang or 546 — if the AI is slow/down it
publishes a complete deterministic flow (INTRO + FOCUS/LISTEN/TEAM/FLASH/
SPEAK/SCRAMBLE/GRAMMAR/STORY/MEDIA) from the approved assets.

### Verification / deploy
- Redeployed `orchestrate-lesson`. Boot confirmed (401 without auth). No new
  lint errors.

---

## 2026-06-22 — Phase 6: Hygiene / cleanup (P2-1, P2-4, P2-9)

### P2-1 — Stray root `supabase/` directory
Deleted the orphaned `/teacher app/supabase/` (outside the git repo; held an
empty root-owned `functions/` dir and a 0-byte `remote_schema.sql`). The real
codebase lives in `professor-0.1 (1)/supabase/`. Local-only artifact; not part
of any deploy.

### P2-4 — Mock data in live UI paths
- `VoiceCommandModal`: it awarded points to a **phantom hardcoded student `'s1'`**
  (data corruption risk). Now awards to a real student in the session (or shows
  "no students" instead of fabricating).
- `StudentApp.getLessonPlaylist`: fixed the misleading "fall back to mock data"
  comment — it returns `[]` (no mock).
- `LessonEditor` (`/teacher/mobile-editor`): was a fully static mock (hardcoded
  "Unit 1: The Zoo" timeline, non-functional buttons). Replaced with an honest
  empty state that directs to Lesson Studio.
- Left in place (honestly labeled WIP / dead code, not silently masquerading):
  `ListenTap` 2s interaction timer, `ParentReports` "(Mock)" skills radar,
  `StudentOnboarding` (orphaned, unreachable).

### P2-9 — Duplicate client image-generation path
`LessonTransformer.transformManifestToFlow` previously fired **per-vocab AI image
generation** on every unit create/update (duplicate of the AssetWorkshop /
`generate-media` pipeline). Removed: it now only surfaces an already-generated
`image_url` if present, else a deterministic DiceBear placeholder. Image
generation is owned solely by the media pipeline.

### Verification / deploy
- `npm run lint`: 0 non-Deno errors. `npm test`: 225 passed | 1 skipped.
- Client-only changes → frontend redeploy.

---

## 2026-06-22 — Phase 5: Security — units tenant isolation + CSP (P2-2, P2-7)

### P2-2 — Tenant-isolate `units` SELECT
**Problem:** `units_select_policy` was `USING (true)` — every authenticated user
saw every unit across ALL teachers (a real multi-tenant data leak).

**Change (migration `20260622000001_units_tenant_isolation.sql`):**
- Added `SECURITY DEFINER` helper `student_class_teacher_ids()` (returns the
  teacher ids of a student's enrolled classes) so the lookup bypasses
  class_enrollments/classes RLS (no recursion).
- New `units_select_policy`:
  - **admin** → all units
  - **teacher** → own units (`teacher_id = auth.uid()`); legacy NULL-teacher
    units stay visible to teachers/admins (nothing hidden)
  - **student** → units owned by the teachers of any class they're enrolled in
    (class-teacher model; does not depend on the assignments table, so enrolled
    students keep seeing their teacher's catalog)
  - parents get no direct unit SELECT (revisit if reports need it)

**Behavior change / verification:** students now see only their teachers' units
(not the whole platform). Verify by logging in as a teacher (own units) and a
student (their teacher's units). Reversible: `DROP POLICY units_select_policy`
and recreate `USING (true)`.

### P2-7 — Remove CSP `script-src 'unsafe-inline'`
**Problem:** `script-src 'self' 'unsafe-inline' blob:` weakened XSS protection.

**Change (`vercel.json`):** removed `'unsafe-inline'` from `script-src` →
`'self' blob:`. Verified the production build has **no inline scripts** (the
PWA registers via external `/registerSW.js`; the entry is external; React uses
no inline HTML handlers). `style-src 'unsafe-inline'` is retained (required for
React inline styles).

### Verification / deploy
- Migration applied to live (policy + helper confirmed via schema dump).
- `npm run lint`: 0 non-Deno errors. `npm test`: 225 passed | 1 skipped.
- Frontend redeploy for the CSP header change.

---

## 2026-06-22 — Phase 4: Media pipeline (fixes P1-6, P2-6)

### P1-6 — Parallelize `generate-media` batch
**Problem:** the `batch` action sequentially self-`fetch(req.url)`-ed this same
endpoint once per item, re-running auth + rate-limit each time and stalling on
slow image models.

**Change:** extracted `generateImage` / `generateAudio` as in-branch helpers and
run the batch through `mapWithConcurrency` (image cap 4, audio cap 3) via
`Promise.all` workers. No more self-fetch; one authenticated request; parallel
with a bounded concurrency to avoid provider rate limits.

### P2-6 — Wire `MEDIA_PLAYER` to song/video suggestions
**Problem:** `MEDIA_PLAYER` flow blocks were generated without any playable URL,
so `BoardMediaPlayer` always showed "No media content available". The
`youtube-search` action returned an empty stub (YouTube Data API is
region-blocked).

**Change:**
- `generate-media` `youtube-search` now returns a usable YouTube **search URL**
  instead of an empty list (region-safe, no API/embed).
- `orchestrate-lesson` transformer now leads with a warm-up `MEDIA_PLAYER` built
  from the first song/video suggestion, carrying `title`, `kind`,
  `search_query`, `topic_relevance`, and `youtubeUrl`. (`toFlowAssets` now
  includes the suggestion arrays.)
- `LessonTransformer` MEDIA_PLAYER case carries the same suggestion fields
  (plus optional `videoUrl` for a teacher-pasted direct link).
- `BoardMediaPlayer`: when there is no directly playable `videoUrl`/`audioUrl`
  but a suggestion exists, it renders a "Recommended Media" card with an
  **"Play on YouTube"** action (opens in a new tab). The play button opens
  YouTube when no in-board media is available. Direct playback via
  `react-player` still works when a real URL is provided.

### Verification / deploy
- `npm run lint`: 0 non-Deno errors. `npm test`: 225 passed | 1 skipped.
- Redeploy edge functions: `generate-media`, `orchestrate-lesson`.
- Frontend redeploy (BoardMediaPlayer + LessonTransformer).

---

## 2026-06-22 — Phase 3: SRS correctness (fixes P0-3 remainder)

### Problem
`ensureStudentSRSItems` cloned a unit's SRS templates into a student's deck
**only when the student had zero items** for that unit. So when a teacher
re-orchestrated a unit (adding/changing vocabulary), every student who had
already started was stuck with the **stale deck forever** — new words never
propagated. Separately, `GenerateLessonModal` held a second, divergent
template-insertion path (it turned out to be orphaned dead code, never
imported).

### Change
- `ensureStudentSRSItems` (`services/SupabaseService.ts`) now **reconciles**:
  it diffs the unit's templates (student_id IS NULL) against the student's
  existing words and inserts only the **missing** ones, preserving each
  existing item's SM-2 interval/repetition/efactor. Non-destructive (never
  deletes or resets). This fixes re-orchestration propagation.
- Extracted the pure diff into `services/srs.ts` (`diffMissingSRSWords`,
  `SRS_DEFAULTS`) so the core logic is unit-tested.
- Deleted the orphaned `apps/teacher/GenerateLessonModal.tsx`, making
  `orchestrate-lesson` the **single** SRS template-insertion path (it was
  already the only *live* one; the dead duplicate is now gone).
- Added `test/srs.test.ts` (6 cases). 225 tests pass; lint fully clean.

### Verification / deploy
- `npm run lint`: 0 non-Deno errors. `npm test`: 225 passed | 1 skipped.
- Client-only change → frontend redeploy (no edge function change).

---

## 2026-06-22 — Phase 2: Unified manifest data contract (fixes P1-1, P1-2)

### Problem
`units.manifest` was written in **three different shapes** by different
producers (`{meta, knowledge_graph}`, `{meta, enriched_content}`, and the flat
`approvedAssets` payload), plus units with no manifest at all. Consumers each
read different keys, and the client `LessonTransformer.transformManifestToFlow`
**required** `manifest.knowledge_graph.vocabulary` with no null-guard — so any
unit produced via `enrich-unit` (which writes only `enriched_content`) crashed
on create/update. `SoloLessonPlayer` also only checked `knowledge_graph`.

### Change
- Added a canonical normalizer, **mirrored** in client (`services/manifest.ts`)
  and edge (`supabase/functions/_shared/manifest.ts`) — they cannot share a
  module root (bundler vs Deno) and are documented as intentionally synced.
  `normalizeManifest(raw)` accepts any shape (or null) and returns one flat
  `CanonicalManifest` (meta, vocabulary, grammar, characters, story, media,
  dialogues, timeline), deriving missing parts and normalizing field aliases
  (`example_sentence || context_sentence`, `examples || world_examples`).
- Client `LessonTransformer.transformManifestToFlow` now normalizes at entry →
  **crash-proof** on any manifest shape (P1-2).
- `SoloLessonPlayer` preloads vocab via `getVocabulary()` (tolerant of any shape).
- `orchestrate-lesson` normalizes the incoming `approvedAssets` and **falls back
  to the unit's stored `manifest`** when the payload is empty (single contract).
  Both the AI prompt and the deterministic transformer now consume the canonical
  `assetsForFlow` shape (P1-1).
- Added `test/manifest.test.ts` (6 cases covering all three shapes, null, and
  field normalization). 219 tests pass; lint fully clean.

### Note on transformManifestToFlow consolidation
The two `transformManifestToFlow` implementations are **not merged**: they serve
different inputs (the client maps an existing `timeline` to flow blocks for the
Lesson Studio editor; the edge derives a flow from canonical content). Both now
share the canonical schema via the normalizer, which removes the divergence that
mattered (the unshared, crash-prone input contract). Merging them would be a
high-risk refactor with marginal benefit and is intentionally deferred.

### Verification
- `npm run lint`: 0 non-Deno errors. `npm test`: 219 passed | 1 skipped.
- Redeploy edge function: `orchestrate-lesson` (consumes `_shared/manifest.ts`).
- Frontend redeploy recommended (LessonTransformer + SoloLessonPlayer changes).

---

## 2026-06-19 — Phase 0 + Phase 1 + Image Provider Abstraction

### Phase 0.1 — Pronunciation evaluator (fixes P0-2)
**Problem:** `evaluate-pronunciation` called the region-blocked OpenAI Whisper
API directly, and its "fallback" asked an LLM to score audio it never received
(fabricated scores).

**Change:**
- Removed the OpenAI Whisper branch entirely.
- Added `supabase/functions/_shared/stt.ts` — a region-safe STT provider
  abstraction. No provider is wired by default; the function relies on the
  client-side Web Speech transcript (region-free) + Levenshtein similarity.
  A future region-safe STT (e.g. an OpenRouter audio model or self-hosted
  Whisper) plugs in via `STT_PROVIDER` without touching call sites.
- The function now accepts an optional `transcript` and returns an honest
  "could not capture" result instead of fabricating when no transcript exists.
- Wired the Dubbing Studio (`apps/student/DubbingStudio.tsx`) to capture a Web
  Speech transcript during recording via `SpeechService.captureTranscript` and
  send it alongside the audio, so dubbing scoring works region-free today.
- `AIService.evaluatePronunciation` forwards an optional `transcript`.

**New env (optional):** `STT_PROVIDER` (`openrouter-audio`), `STT_AUDIO_MODEL`.
**Removed dependency:** `OPENAI_API_KEY` is no longer used by this function.

### Phase 0.2 — Orchestration correctness (fixes P0-3 partial, P1-4, P1-5, P1-6, P2-3, P2-8)
**Problem:** `orchestrate-lesson` persisted unvalidated AI flow, used N+1
per-row SRS inserts, read mismatched field names, and the think-tag stripping
was inconsistent across functions.

**Change:**
- Added `supabase/functions/_shared/json.ts` (`stripReasoning`,
  `extractJsonObject`, `parseJsonLenient`) — now used by `orchestrate-lesson`,
  `generate-lesson`, and `extract-page` for consistent reasoning-tag + fence
  stripping (P2-8).
- Added `supabase/functions/_shared/flowTypes.ts` with `SUPPORTED_FLOW_TYPES`
  (source of truth = `apps/board/ClassroomBoard.tsx` render switch) and
  `validateAndNormalizeFlow`. `orchestrate-lesson` now validates/normalizes the
  flow (supported types, `data` object, INTRO_SPLASH at index 0) before
  persisting, and returns `{ source, droppedBlocks }` (P1-6).
- `orchestrate-lesson` SRS templates are now inserted in a single batch
  instead of an N+1 loop (P1-5).
- Fixed field-name mismatches in the deterministic transformer: story pages
  read `speaker` (not only `character_name`); vocab example reads
  `example_sentence || context_sentence`; grammar reads
  `examples || world_examples` (P1-4).
- Removed the fabricated, never-persisted `timelineId` from the response (P2-3).

### Phase 1 — Classroom Board realtime sync (fixes P0-1)
**Problem:** The Live Commander (`/teacher/live`, `teacher.html`) and the
Projector Board (`/board`, `index.html`) are separate React roots with isolated
in-memory state. Slide navigation only called `setState` and never broadcast, so
the projector could never follow the teacher.

**Change:**
- Added migration `20260619000000_classroom_sessions.sql` creating
  `public.classroom_sessions` (one row per teacher; RLS-scoped to the owning
  teacher + admins; added to the `supabase_realtime` publication).
- Refactored `store/SessionContext.tsx` to make session state
  **authoritative-from-DB**: `setActiveUnit`/`goToSlide`/`startSession`/
  `endSession` now persist `unit_id`/`current_index`/`status` to
  `classroom_sessions`. A new Realtime `postgres_changes` subscription applies
  incoming session rows to local state, so the Board, Remote and Commander
  converge across tabs/devices.
- All persistence is best-effort (fail-safe): local state still updates if
  Supabase/auth is unavailable.
- Ephemeral effects (points, drawings, overlays, confetti) still use the
  existing broadcast channel — unchanged.

**Open assumption:** the projector/remote sign in as the same teacher account
as the commander (one session row per teacher). Multi-teacher / class-code
support is a documented future enhancement.

### Image Provider Abstraction (fixes P1-3, addresses user directive)
**Problem:** Image generation was hard-wired to a Black Forest Labs flux model
and parsed images via a fragile markdown-URL regex that almost always fell back
to DiceBear; even successful external URLs were blocked by CSP `img-src`.

**Change:**
- Added `supabase/functions/_shared/imageProvider.ts` — a pluggable
  `ImageProvider` interface selected via `IMAGE_PROVIDER` (default
  `openrouter`). The OpenRouter provider reads its model from `IMAGE_GEN_MODEL`
  so it can be swapped to any OpenRouter image model — or a future
  better-adapted solution — without code changes. **No vendor lock-in.**
- Robust image extraction: tries markdown link, bare image URL, base64 data
  URL, and structured `image_url` envelopes.
- `generate-media` now downloads the generated image and re-uploads it to the
  `generated-media` Supabase Storage bucket, returning a `*.supabase.co` public
  URL so the browser CSP `img-src` is always satisfied.

**New env (optional):** `IMAGE_PROVIDER` (default `openrouter`);
`IMAGE_GEN_MODEL` (default `black-forest-labs/flux-schnell`, swappable).

### Verification
- `npm run lint` (`tsc --noEmit`): no new client type errors (the only non-edge
  error, `AssetWorkshop.tsx:99`, pre-dates this work and is unrelated).
- `npm test`: 213 passed | 1 skipped (added 3 Phase 1 persistence tests;
  SessionContext test mock extended with `auth`/`from`).
- Edge-function changes are Deno modules (not covered by the client `tsc`);
  verify locally with `npx supabase functions serve`.

### Deployment notes
- Apply migration: `supabase db push --project-ref xsdnzijketjnzhakqtit`
  (or run `20260619000000_classroom_sessions.sql`).
- Redeploy changed edge functions:
  `evaluate-pronunciation`, `orchestrate-lesson`, `generate-lesson`,
  `extract-page`, `generate-media`.
- The new `_shared/*.ts` modules are imported by the above functions and
  deploy automatically with them (no separate deploy).
- Set optional secrets only if using the new providers:
  `STT_PROVIDER`, `STT_AUDIO_MODEL`, `IMAGE_PROVIDER`, `IMAGE_GEN_MODEL`.

### Remaining (deferred phases, not in this pass)
All audit phases (0–6) are now complete. Remaining work is incremental product
features (e.g. real YouTube playback when an embeddable source is available,
parent unit access, multi-teacher classroom-session codes) rather than the
P0–P2 defects from the original audit.
