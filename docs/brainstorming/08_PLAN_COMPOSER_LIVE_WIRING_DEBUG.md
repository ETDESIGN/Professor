# 08 — Plan Composer ↔ Live Session Wiring: Architecture & Debugging Guide

> **Purpose:** detailed record of how a lesson plan flows from the Unit Studio
> **Plan composer** into the **live classroom board**, the five bugs found while
> making the composer functional (2026-07-30), their fixes, and the diagnostic
> tooling to use if this chain breaks again. Read this before debugging "the plan
> I built doesn't show up in the live session" or "a board step renders blank."

---

## 1. The end-to-end data flow (the single most important diagram)

```
┌─────────────────────────┐   save (Engine.updateUnit)   ┌──────────────────┐
│ Unit Studio → Plan tab  │ ───────────────────────────▶ │  units.flow      │
│ (PlanComposer.tsx)      │   {id,type,title,duration,data} │  (JSONB array)  │
└─────────────────────────┘                               └────────┬─────────┘
        │ "Launch live"                                            │
        │  1. auto-save plan                                       │
        │  2. setActiveUnit(unitId)                                │
        ▼                                                          │
┌─────────────────────────┐   Engine.getUnitById (FRESH)           │
│ SessionContext          │ ◀──────────────────────────────────────┘
│  state.activeUnit.flow  │   (also: state.activeSlideData = flow[0],
│  state.currentStepIndex │          currentStepIndex = 0)
└────────────┬────────────┘
             │ reads state.activeUnit.flow
   ┌─────────┴───────────────────────────┐
   ▼                                     ▼
┌──────────────────────┐      ┌────────────────────────────┐
│ LiveCommander.tsx    │      │ ClassroomBoard.tsx         │
│  (teacher plan list) │      │  (projector, renders step) │
│  activeFlow =        │      │  currentStep =             │
│   activeUnit.flow    │      │   state.activeSlideData    │
│  shows step.title    │      │  switches on step.type →   │
│  (the "plans")       │      │   Board* template          │
└──────────────────────┘      └────────────────────────────┘
```

**Key invariant:** the live session reads `state.activeUnit.flow` **only**.
`activeUnit` is set by `setActiveUnit(unitId)` in `store/SessionContext.tsx`.
If a step isn't in `units.flow`, or `activeUnit` is stale, or the step's `type`
has no board template, or its `data` is empty — the step is missing or blank.

---

## 2. The contract: a flow step

Each element of `units.flow` is a step the board can render:

```ts
{
  id: string;
  type: string;        // must match a Board* template in ClassroomBoard.tsx
  title: string;       // shown in the LiveCommander plan list
  duration: number;    // SECONDS in units.flow (the composer edits in MINUTES, ×60 on save)
  phase?: string;      // WARMUP|INPUT|PRACTICE|OUTPUT|ASSESS|WRAPUP (drives board theming/order)
  data: object;        // type-specific payload the Board* template consumes
}
```

### Board step types → template → required `data` shape
(see `apps/board/ClassroomBoard.tsx` for the authoritative switch, ~line 131)

| `type` | Template | Required `data` |
|---|---|---|
| `INTRO_SPLASH` | BoardIntroSplash | `{ title, subtitle, description }` or `{ theme }` |
| `MEDIA_PLAYER` | BoardMediaPlayer | `{ title, kind, search_query, youtubeUrl, lyrics }` |
| `FOCUS_CARDS` | BoardFocusCards | `{ title, cards: [{front, back, image, phonetic}] }` (enriches from manifest vocab) |
| `STORY_STAGE` | BoardStoryStage | `{ title, setting, pages: [{text, speaker, imageUrl}], characters }` |
| `DIALOGUE_STAGE` | **BoardDialogueStage** (added 2026-07-30) | `{ title, lines: [{speaker, text, translation}] }` — **falls back to `manifest.enriched_content.dialogues` if `data.lines` is empty** |
| `GRAMMAR_SANDBOX` | BoardGrammarSandbox | `{ title, explanation, examples }` |
| `GRAMMAR_PRACTICE` | BoardGrammarPractice | `{ title, poolDriven: true }` (pulls pool_items at runtime) |
| `TEAM_BATTLE` | BoardTeamBattle | `{ topic, questions: [{id, text, image, options, correct}] }` |
| `GAME_ARENA` | BoardGameArena | (pool-driven) |
| `LISTEN_TAP` / `FLASH_MATCH` / `SCRAMBLE` / `SPEAKING` / `SPEED_QUIZ` / `MAGIC_EYES` / `WHATS_MISSING` / `STORY_SEQUENCING` / `I_SAY_YOU_SAY` / `UNSCRAMBLE` / `WHEEL_OF_DESTINY` / `POLL` | respective Board* | see each template |

> **Rule of thumb:** if a step type is NOT in the ClassroomBoard switch, it
> renders **blank** (no error). If a step's `data` lacks the fields its template
> reads, the template usually shows its own empty state (e.g. "No dialogue
> lines"). Always check both the type registration AND the data shape.

### Pool-driven vs. data-frozen steps
`orchestrate-lesson` tags some types `poolDriven: true` (LISTEN_TAP, FLASH_MATCH,
TEAM_BATTLE, SPEED_QUIZ, etc. — see `POOL_DRIVEN_TYPES` in
`supabase/functions/orchestrate-lesson/index.ts`). For those, the board pulls
`pool_items` at runtime by mastery/SRS; `data` is only a fallback. Presentation
types (FOCUS_CARDS, STORY_STAGE, DIALOGUE_STAGE, MEDIA_PLAYER) are data-frozen.

---

## 3. The five bugs found (2026-07-30) and their fixes

Symptom reported by the owner: *"the composer blocks are just mockups, not
connected to the system — when I click live teaching session, those are not in
the plans."*

### Bug 1 — Stale `activeUnit` (why saved steps weren't "in the plans")
- **Where:** `store/SessionContext.tsx`, `setActiveUnit`.
- **Cause:** it did `state.units.find(u => u.id === unitId)` first and only
  fetched from the DB if the unit was NOT cached. After the teacher edited the
  plan in the Studio and saved, the cached unit still held the **old** flow, so
  "Launch live" loaded the old flow.
- **Fix:** fetch fresh first, fall back to cache on failure:
  ```ts
  let unit = state.units.find(u => u.id === unitId);
  try { const fresh = await Engine.getUnitById(unitId); if (fresh) unit = fresh; }
  catch { /* keep cached unit (offline resilience) */ }
  ```
- **Note:** `Engine.updateUnit(id, {flow})` (without `manifest`) writes `flow`
  directly. If `manifest` is passed, `supabaseUpdateUnit` REGENERATES flow via
  `transformManifestToFlow` — so the composer must pass `{flow}` only.

### Bug 2 — No auto-save on "Launch live"
- **Where:** `apps/teacher/PlanComposer.tsx`, `launchLive`.
- **Cause:** launching didn't persist the in-editor plan; an unsaved plan never
  reached `units.flow`.
- **Fix:** `launchLive` now serializes (`buildDbFlow`) + `Engine.updateUnit`
  BEFORE `setActiveUnit` + navigate.

### Bug 3 — Library blocks had empty `data` (the "mockups")
- **Where:** `apps/teacher/PlanComposer.tsx`, `addFromLibrary`.
- **Cause:** library-added blocks used `data: {}` → board templates rendered
  blank.
- **Fix:** `buildBlockData(type, enriched_content)` builds the correct,
  board-renderable `data` from the unit's real content (vocab→cards,
  story→pages, dialogues→lines, vocab→quiz questions), mirroring the shapes in
  §2. Library now offers only types it can make functional: FOCUS_CARDS,
  STORY_STAGE, DIALOGUE_STAGE, TEAM_BATTLE.

### Bug 4 — Dialogue had no board template + was never generated
- **Where:** `apps/board/ClassroomBoard.tsx` (no `DIALOGUE_STAGE` case),
  `supabase/functions/orchestrate-lesson/index.ts` (never pushed DIALOGUE_STAGE).
- **Cause:** even a correct DIALOGUE_STAGE step rendered blank (no template),
  and orchestration never created one; composer-added dialogue steps had empty
  data.
- **Fix:**
  - Added `apps/board/templates/BoardDialogueStage.tsx` (speaker-attributed
    lines, remote NEXT_PANEL/PREV_PANEL/RESET_GAME, manifest fallback for empty
    `data.lines`), wired into ClassroomBoard + added to `FULL_BLEED_TYPES` in
    `BoardShell.tsx`.
  - `orchestrate-lesson` now pushes a `DIALOGUE_STAGE` step with real `data.lines`
    (flattened from `assets.dialogues[].lines`) and tags it phase `OUTPUT`.
    **Applies to newly orchestrated units only** (existing flows keep their steps
    until re-orchestrated).

### Bug 5 — Auto-build collapsed the plan to one intro slide
- **Where:** `apps/teacher/PlanComposer.tsx`, `autoBuild`.
- **Cause:** it called `transformManifestToFlow(manifest)`, which reads
  `manifest.timeline` — **empty for these units** (verified: `manifest.timeline`
  length 0 while `units.flow` had 6 server-generated steps). Result: a 1-step
  intro flow that would WIPE the good server-generated flow on save.
- **Fix:** auto-build now constructs intro→vocab→story→dialogue→review directly
  from `enriched_content` via `buildBlockData` (synchronous, no edge call).

---

## 4. Where the flow comes from (two producers — don't confuse them)

1. **Server: `orchestrate-lesson`** (the real, full flow). Runs during the
   generation pipeline. Builds INTRO_SPLASH, MEDIA_PLAYER, FOCUS_CARDS,
   LISTEN_TAP, TEAM_BATTLE, FLASH_MATCH, SPEAKING, SCRAMBLE, GRAMMAR_SANDBOX,
   GRAMMAR_PRACTICE, STORY_STAGE, **DIALOGUE_STAGE** (new), tags phases, sorts
   into the teaching arc, writes `units.flow`. This is why a freshly orchestrated
   unit has a rich flow even though `manifest.timeline` is empty.
2. **Client: `transformManifestToFlow`** (`services/LessonTransformer.ts`). Reads
   `manifest.timeline` (usually empty) → produces a minimal flow. **Do not use it
   to (re)build a unit's plan** — it collapses to intro. It's a legacy path.

The **Plan composer** edits `units.flow` directly (read on open, write on save),
independent of both producers.

---

## 5. Diagnostic playbook (if this breaks again)

### 5.1 Is the step in the DB flow?
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/xsdnzijketjnzhakqtit/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -A "supabase-cli/2.78.1" \
  -d '{"query":"SELECT jsonb_array_length(COALESCE(flow,'\''[]'\''::jsonb)) AS flow_len, (SELECT jsonb_agg(elem->>'\''type'\'') FROM jsonb_array_elements(COALESCE(flow,'\''[]'\''::jsonb)) elem) AS types FROM units WHERE id='\''<UNIT_ID>'\'';"}'
```

### 5.2 Does a step have real data?
```sql
SELECT elem->>'type' AS type, jsonb_pretty(elem->'data') AS data
FROM units, jsonb_array_elements(COALESCE(flow,'[]'::jsonb)) elem
WHERE units.id = '<UNIT_ID>' AND elem->>'type' = '<STEP_TYPE>' LIMIT 1;
```
Empty `data` (`{}`) → the step renders blank. Check the producer (composer
`buildBlockData` or orchestrate-lesson).

### 5.3 Is the type registered on the board?
Grep `apps/board/ClassroomBoard.tsx` for `currentStep.type === '<TYPE>'`. No
match → blank render (add a template + a case).

### 5.4 Is `activeUnit` fresh in the live session?
`setActiveUnit` now fetches fresh (Bug 1 fix). If still stale, check
`Engine.getUnitById` returns the latest `flow` and that the save actually
persisted (5.1). In the browser, inspect `SessionContext` state
(`state.activeUnit.flow`, `state.currentStepIndex`).

### 5.5 Telemetry for enrichment/generation
`llm_telemetry` has `function_name`, `model_used`, `duration_ms` (added for the
vocab/grammar timeout work). `outcome:<category>:<ok|ai_error>` rows record
enrich-unit outcomes + durations. `generation_jobs` tracks orchestrate-lesson /
generate-exercises status per unit.

### 5.6 Edge-function logs
The Management API `edge_logs` endpoint only stores HTTP request lines, NOT
function console output. For function-level errors, rely on `llm_telemetry` /
`generation_jobs` DB rows, or add targeted telemetry inserts.

---

## 6. Related known constraints
- **Edge function wall-clock ≈ 150s** — vocab enrichment (AI + ~16 TTS clips) is
  the timeout risk; mitigated by 45s per-model AI timeout + TTS time-budget guard
  (skip TTS if AI used >80s) + TTS concurrency 5. See enrich-unit comments.
- **`units.flow` shape is load-bearing** — the live session depends on it; the
  plan's §2.2 "retire the drifted flow shapes" is deferred until the live session
  is reworked to read a new contract (e.g. `get_unit_bundle`).
- **`get_unit_bundle(unit_id)`** RPC (Phase 1.6) exists as the future read
  contract (joins objectives/pool_items/story/dialogue/grammar/characters) but is
  not yet consumed by the board/student app.

---

*Last updated 2026-07-30 after making the Plan composer functional. Files touched:
`store/SessionContext.tsx`, `apps/teacher/PlanComposer.tsx`,
`apps/board/templates/BoardDialogueStage.tsx`, `apps/board/ClassroomBoard.tsx`,
`apps/board/BoardShell.tsx`, `supabase/functions/orchestrate-lesson/index.ts`.*
