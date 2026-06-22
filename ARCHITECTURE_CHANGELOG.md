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
- **Phase 3** — SRS correctness: single template-insertion path; upsert
  per-student items on re-orchestration (P0-3 remainder).
- **Phase 4** — media: parallelize the `generate-media` `batch` action (P1-6);
  wire `MEDIA_PLAYER` to song/video suggestions (P2-6).
- **Phase 5** — scope `units` SELECT by teacher/enrollment (P2-2); CSP
  hardening (P2-7).
- **Phase 6** — hygiene: delete stray root `supabase/` dir (P2-1); remove
  remaining mock data (P2-4); collapse duplicate client image-gen path (P2-9).
