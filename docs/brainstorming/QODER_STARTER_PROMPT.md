# Qoder Starter Prompt — copy this into your Qoder (Qwen3.8) session

> Paste everything below the line as your first message. Do not edit it — it's
> calibrated to give the model the complete, accurate context in the right order.

---

You are taking over an in-progress implementation of the "Professor" teacher app. A prior session (ZCode) built Phases 0, 1.1, and 1.2 of a multi-phase plan; those are DONE, deployed, and verified. Your job is to continue the plan — **do not re-plan, re-audit, or re-architect.** The architecture is decided.

## STEP 1 — Read these before writing any code (in this exact order)

1. `docs/brainstorming/QODER_ONBOARDING.md` — **read this FIRST and in full.** It is the complete handoff: project, stack, the 3-stage pipeline mental model, what's done, what's next, conventions, deploy, git state, and your first task.
2. `docs/brainstorming/07_IMPLEMENTATION_PLAN.md` — the active plan. ✅ markers show finished phases; §1.3 is your first task.
3. `AGENTS.md` (workspace root, one level up from the repo) — deploy runbook + the region-safe AI hard rule + known issues.
4. `docs/brainstorming/01_COMPREHENSIVE_AUDIT.md` and `02_FOUNDATION_DEEPDIVE.md` — the bug list (note: B2 was retracted — it was an audit error; B1b is real) and the two decided architecture forks.

Do not start coding until you've read the onboarding file completely and understand: the 3-stage pipeline, the `units → objectives → pool_items → srs_items` spine, that `objectives.type` already allows `'story'` and `'dialogue'`, and that edge/client modules are duplicated and must be kept in sync.

## STEP 2 — Know the critical facts

- **Region-safe AI ONLY** (Moonshot/Qwen/DeepSeek via OpenRouter). OpenAI/Google/Anthropic are FORBIDDEN. (`AGENTS.md` §5)
- **All Phase 0/1.1/1.2 work is UNCOMMITTED** on `master`. Do not `git reset`/`checkout` or you'll lose it. Before starting, ASK the owner whether to commit first. There is also a junk untracked file with a mangled name (`\\enriched_content...`) — safe to delete.
- **Deploy path:** migrations go via the Supabase Management API (`curl ... /database/query` with `--data-binary @<(python3 ...)` to avoid shell-escaping SQL quotes — this is a real gotcha, see onboarding §6); edge functions via `supabase functions deploy`; frontend via `npx vite build && vercel --prod --yes`. Direct Postgres has a TLS-EOF blocker.
- **Use the existing patterns exactly.** New tables mirror `story_pages`/`objectives` RLS. New functions use `_shared/assertOwnership.ts`. New exercise types go in BOTH `_shared/exerciseTypes.ts` AND `types/exercise.ts`.

## STEP 3 — Your first task: Phase 1.3 (`dialogue_lines`)

Follow `07_IMPLEMENTATION_PLAN.md` §1.3 + `ADVISOR_RECOMMENDATION.md` §2.3/§4. The pattern is established by Phase 1.2 (story) — mirror it:
1. Migration `20260730000001_dialogue_lines.sql`: table (unit_id, order_index, speaker_character_id→characters, text, translation, audio_asset_id→assets, speaker_override_name) + RLS.
2. Add `DIALOGUE_ROLEPLAY` + `WHO_SAID_IT` to BOTH exercise-type files.
3. `enrich-unit`: write dialogues relationally (resolve speakers → book characters via `_shared/characterLook.ts`); keep the manifest write for legacy consumers.
4. `generate-exercises`: emit the new types from the table.
5. Backfill legacy manifest dialogues.
6. Deploy + ask the owner to upload a test unit; verify the new pool items appear (query `pool_items` for the new `exercise_type`s).

## Working norms

- **Verify before claiming done.** After a deploy, query the DB (onboarding §10) to confirm the new exercise type actually lands in `pool_items`. Report real numbers.
- **Surface trade-offs, don't silently decide.** When the plan leaves a choice open (e.g. a flow type, an RLS nuance), state your call and the reason. The 4 locked decisions (onboarding §8) are NOT open.
- **Keep edge/client mirrors in sync.** `_shared/manifest.ts`↔`services/manifest.ts`, `_shared/exerciseTypes.ts`↔`types/exercise.ts`.
- **Don't fold in deferred work.** L2 (educational-AI level differentiation) is deferred — don't touch it. The Curriculum/Universe layers above `books` were declined.

Start by reading `QODER_ONBOARDING.md` now, then confirm your understanding of the 3-stage pipeline and the current data model before writing any code.
