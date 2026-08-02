# Qoder Workflow — How We Collaborate

> This defines the operating model for the ZCode (me, architect/verifier) ↔ Qoder/Qwen3.8 (implementer) loop. Read once; reference often. Lives at `docs/brainstorming/QODER_WORKFLOW.md`. Task instructions live in `qoder_tasks/` at the repo root.

---

## The collaboration loop

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ME (ZCode)                    QODER (Qwen3.8)                  │
  │  ───────────                   ──────────────                   │
  │  1. Audit + diagnose                                            │
  │  2. Design the fix (architect)                                 │
  │  3. SPLIT work by complexity:                                  │
  │     - complex/architectural → I do it                          │
  │     - well-scoped/lifting   → write a QODER TASK file          │
  │  4. Commit my work + the task files                            │
  │     ───────────────────────────────────────────────►           │
  │                                  5. Owner gives Qoder the       │
  │                                     kickstart prompt            │
  │                                  6. Qoder works the task queue  │
  │                                  7. Qoder commits + fills in    │
  │                                     the STATUS section          │
  │     ◄───────────────────────────────────────────────           │
  │  8. I VERIFY against the Acceptance Criteria                   │
  │     - pass → mark DONE, move on                                │
  │     - fail → append a FAILBACK note to the task, loop 6→8      │
  │  9. Write the next batch of tasks                              │
  └─────────────────────────────────────────────────────────────────┘
```

**Roles:**
- **Me (ZCode):** diagnose, architect, do the complex/entangled pieces, verify Qoder's work against acceptance criteria, manage the queue.
- **Qoder:** implement well-scoped tasks exactly as specified. Each task is self-contained — Qoder should NOT need to ask questions to complete one.
- **Owner:** run the kickstart prompt in Qoder between batches, decide product trade-offs when flagged, test in the live app.

## The task-file contract (strict — this is what makes the loop work)

Every Qoder task is its own file in `qoder_tasks/`, named `NN_short_name.md` (zero-padded number = priority order). Each file has these sections in this order:

1. **`# Task NN — <title>`**
2. **Context** — 2-4 sentences. What this is, why it matters, where it sits in the bigger system. Qoder may not have read the audit; this orients it.
3. **Scope** — exactly what files to touch. **A task touches ONLY the files listed here.** If a fix needs to touch a file outside scope, STOP and flag it (don't expand scope silently).
4. **What to change** — numbered, concrete steps with `file:line` anchors. Not "improve X" — "replace X with Y because Z."
5. **Acceptance Criteria** — a checklist Qoder can self-verify against. **I verify against the SAME list.** If it says "typecheck clean" and typecheck fails, it's not done.
6. **Don't** — explicit anti-scope. Prevents over-engineering ("do NOT add a UI for this," "do NOT touch the migration").
7. **References** — pointers to the audit findings, advisor doc, plan, or relevant source.

Rules:
- **One task = one PR-sized change.** If it can't be done in one sitting, it's two tasks.
- **Self-contained.** Qoder should complete it without asking questions. If I can't write a task that's unambiguous, I do the work myself.
- **Verifiable.** Every task has machine-checkable acceptance criteria (typecheck, build, a DB count, a grep that should return X).
- **No re-architecture.** Tasks implement the DECIDED design (see `07_IMPLEMENTATION_PLAN.md` + `QODER_AUDIT.md`). Qoder flags disagreement in the STATUS section rather than redesigning.

## STATUS section (Qoder fills this in)

At the BOTTOM of each task file, Qoder appends:

```markdown
---

## STATUS

- [x] / [ ] each Acceptance Criterion
- **Commit:** <hash> (or "uncommitted")
- **Notes:** <what was tricky, what deviated, what to verify manually>
- **Questions for reviewer:** <anything ambiguous>
```

I read this before verifying.

## Conventions Qoder must follow (non-negotiable)

Carried from `QODER_ONBOARDING.md` §5 — these prevent real bugs:

1. **Region-safe AI only.** Moonshot/Qwen/DeepSeek. OpenAI/Google/Anthropic FORBIDDEN.
2. **Migrations:** `supabase/migrations/YYYYMMDDNNNNNN_snake.sql`, idempotent, RLS mirrors `objectives`/`pool_items` pattern (`teacher owns unit` + `is_teacher_or_admin()`). Next number: `20260802000001`.
3. **Edge functions:** use `_shared/assertOwnership.ts` for ownership. Strict (do not loosen). Apply via `supabase functions deploy <name> --no-verify-jwt`.
4. **Edge/client mirrors stay in sync:** `_shared/X.ts` ↔ `services/X.ts` or `types/X.ts`.
5. **Migrations deploy via Management API** with `--data-binary @<(python3 ...)` (NOT `-d`, which mangles SQL quotes). Empty `[]` = success. Register the version in `supabase_migrations.schema_migrations` after.
6. **Verify before claiming done.** Typecheck (`npx tsc --noEmit -p tsconfig.json`, ignoring Deno/esm noise), build (`npx vite build`), and — if the task touches the DB — query the cloud DB to confirm. Report real numbers.
7. **Commit per task** with a clear message. Don't bundle tasks.

## How I (ZCode) verify

After Qoder marks a task done, I:
1. Read the STATUS section.
2. Run the acceptance criteria myself (typecheck, build, DB query, targeted code read).
3. Cross-check against `QODER_AUDIT.md` to confirm the underlying finding is actually resolved (not papered over).
4. Either mark DONE in the queue or append a FAILBACK note explaining what's still wrong and send it back.

**Verification is rigorous on the first batch** — Qoder's prior commits overstate completion (see audit §4), so I verify against code, not commit messages.

## The queue index

`qoder_tasks/README.md` is the live index: task number, title, owner (QODER / ME / DONE), status. When I finish my pieces, I move them to DONE in the index and commit. Qoder works top-to-bottom through its owned tasks.

---

*Established 2026-08-02. This workflow is the source of truth for the collaboration; the task files are the source of truth for individual pieces of work.*
