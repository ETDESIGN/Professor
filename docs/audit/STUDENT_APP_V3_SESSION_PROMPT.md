# New-session prompt — Student App games/exercises: audit + redesign (games-v3 playbook)

Paste everything below the line into the new ZCode session.

---

## Mission

Run the same game-by-game audit-and-redesign pipeline we just completed for the classroom BOARD (docs/audit/games-v3/ — read `_INDEX.md`, `_WAVE1_RETRO.md`, and one per-game file end-to-end before anything else), but this time for the **STUDENT app** (`apps/student/`, the `/student` portal, `student.html` entry — the personal-device app a single child uses at home or in solo study).

Role split this time (owner-decided):
- **You (ZCode): manager + auditor + design verifier + deployer.** You audit the code (§0–§3), you verify Anti-Gravity's Stitch designs inside Stitch itself, and you are the ONLY one who commits/deploys.
- **Anti-Gravity (AG): quality auditor (§4) + Stitch designer + implementer.** It audits, it generates designs through the Stitch MCP itself, and it implements the approved designs in code. You review and deploy its work.

**NEW HARD RULE — owner approval gate:** designs are shown to the owner for PERSONAL approval BEFORE any implementation begins. No implementation without his explicit go on that game's designs. The pipeline per game is: audit → AG §4 → AG generates Stitch designs → you verify + export + QA → **owner approves** → AG implements → you review + gauntlet + deploy. One game at a time.

## Non-negotiable context to load first

1. Read `AGENTS.md` at the repo root — deploy paths, secrets model, known traps (edge functions do NOT auto-deploy on push; PWA `registerType:'prompt'` means open tabs keep old code until the user accepts the reload banner; verify functions via `/functions/v1/` + apikey → expect 401).
2. Read `docs/audit/games-v3/_INDEX.md` + `_WAVE1_RETRO.md` + `prompts/antigravity-handover.md` — that whole folder is the playbook: the per-game file template (§0 identity, §1 how it works, §2 owner comments, §3 your code findings, §4 AG's quality audit, §5 Stitch designs, §6/§7 implementation + fidelity logs), the follow-the-design rules, and the handover constraints that kept a second agent safe in this repo.
3. The board effort ended with ~803 tests green and a clean working tree on master — preserve both.

## Phase A — Inventory (your first deliverable)

Map every game/exercise surface the STUDENT app actually serves: `apps/student/SoloLessonPlayer.tsx`, `apps/student/SpellingBeeGame.tsx`, `apps/student/steps/*`, anything under `components/games/` the student entry mounts, and the student portal routes. For each: component path, flow/exercise types it consumes, data sources, scoring/data-write paths (student XP, FSRS via `services/boardLearner` / attempts log — the student-app equivalent of the board's lifecycle contract: whatever writes learning data is sacred and must be preserved verbatim through any redesign). Capture current-state screenshots (the games-v3 scripts in `scripts/testing/games-v3-*.ts` are reusable patterns; students don't need the fixture classroom — but check how student auth/data differs before faking anything). Create `docs/audit/student-app-v3/` with `_INDEX.md` + per-game files from the games-v3 `_TEMPLATE.md`, adapted: the classroom prelude (3-tab model, projector 16:9) is REPLACED by a student prelude — single child, personal phone/tablet, headphones possible, portrait AND landscape, small screens first, kid holds the device and taps directly.

**Design targets differ from the board:** no 8-meter legibility rule, no BoardShell phase-pill clearance (`pl-40`), no landscape-cards-on-stage rule; instead thumb-reachable controls, larger tap targets than the board, session length awareness (a kid alone), and the same v3 visual language where it fits (night navy `#070C18`, surfaces `#0B132B/#111C3D/#16234D`, single hot-pink `#FF2E79` accent, sky `#38BDF8` audio/time, emerald correct, amber hints, Fredoka/Sora/JetBrains Mono) — but let Stitch propose per-game personality like it did for the board, and judge per design.

## Phase B — Your audit (§0–§3 per game)

Same discipline as games-v3: verbatim mechanics with file:line refs, numbered findings with priorities. Audit for kid-alone failure modes: dead-ends when content is missing, unfair timeouts (the board effort's lesson: clocks cost nothing for 6–12 y/o), sight-reading leaks (answers readable when the skill being tested is listening/recall), stale-audio-vs-display-text desyncs, scoring that writes wrong data (this damages FSRS scheduling — the worst class of bug), phone-floor layout breaks.

## Phase C — The Anti-Gravity instruction pack (your second deliverable)

Write AG's prompt yourself (pattern: `prompts/antigravity-handover.md`). It must contain:

**1. Audit task (§4)** — same as games-v3: AG writes its quality audit INTO each per-game file's §4, structured, prioritized top-5, using your §0–§3. It audits markdown only, touches no code.

**2. Stitch MCP setup — full instructions, because AG must generate designs itself this time:**
- Stitch is reached through the official remote MCP via the `@_davideast/stitch-mcp` npm proxy. CLI form (works everywhere): `STITCH_API_KEY=<key> npx -y @_davideast/stitch-mcp tool <toolName> -d '<json>'`.
- The owner creates the key in Stitch → Settings → API key and pastes it to AG directly (never commit it anywhere).
- Health check first: `STITCH_API_KEY=… npx -y @_davideast/stitch-mcp doctor` (expect 200) and `tool list_projects`.
- Useful tools: `create_project` (deviceType MOBILE for student screens), `generate_screen_from_text`, `get_screen` (returns an HTML downloadUrl), `get_screen_image` (base64 PNG; call it with `{"projectId": "...", "screenId": "..."}`), `edit_screens` (revision pass), `list_screens`.
- **Known traps to tell AG:** generation calls through the MCP protocol time out at 30s — use the CLI; screens materialize ASYNCHRONOUSLY (10 minutes to hours — never conclude failure early, poll with `list_screens`); the `@google/stitch-mcp` package does NOT exist (SEO bait); Stitch is a Google Labs experiment — fine for design iteration, never a load-bearing dependency; quota is limited (~350/month reported) — batch sparingly, ~2 screens per game state that matters.
- Create ONE new Stitch project for the student app (MOBILE deviceType), and record its ID in `docs/audit/student-app-v3/_INDEX.md`.

**3. The "reusable code" design briefing (owner's explicit goal):** AG's Stitch prompts must give Stitch everything needed so the generated HTML is PORTED, not recreated. Every generation prompt must include: the real component's content fields (from your §1), the exact interactive states (idle/active/correct/wrong/reveal/complete), the actions available to the child, the real data variants (long words, missing images, empty pools), the v3 token block, and this instruction: "produce production-grade Tailwind HTML + a small `<style>` block, no lorem, no placeholder chrome like settings/fullscreen/sync pills — the code will be adapted into a React component nearly verbatim." Bad briefs produce pretty mocks that get rewritten from scratch — that was wave-1's mistake (read `_WAVE1_RETRO.md`).

**4. Boundaries for AG while implementing (same as the board handover):** one component file per game; never edit `store/SessionContext.tsx`, `apps/board/**`, `services/**`, `supabase/functions/**`; lifecycle/scoring preserved verbatim; no git, no deploys; gauntlet before "done" (`npx tsc --noEmit -p tsconfig.json`, `npx vitest run` — must stay green, currently 803; `npm run build`); fidelity log in §6 listing every deviation from the Stitch HTML; report every game it touched, verified against `_INDEX.md` (its board-era reports twice claimed completion while games were missing — always verify).

## Phase D — Your verification of AG's designs

When AG says designs are generated: `list_screens` on the student project, verify titles against the §5 briefs, export each to `docs/audit/student-app-v3/stitch/<nn>-game/1-*.html|png` (+`2-*`), and QA per screen: correct device frame (mobile), kid-readable type at phone size, tap targets ≥ 44px, all states represented, no Chinese on challenge surfaces (L1 support chips only where the audit allows), no clipped content, v3 palette respected or deliberately extended. Write verdicts into the game file's §5. **Then STOP and show the owner** — he approves or sends back to AG for an `edit_screens` revision pass. Only approved designs go to Phase F.

## Phase E/F — Implementation loop (per game, one at a time)

AG implements the approved design (Phase C boundaries). You review the diff (scoring/data writes verbatim, no forbidden files), re-run the gauntlet yourself, capture before/after screenshots, commit per game (explicit `git add` paths only — never `git add -A`), push (Vercel auto-deploys), redeploy any touched edge function by hand, verify per AGENTS.md §8, and update `_INDEX.md`. The owner tests live between games.

## Standing safety rules (from the board effort, all learned the hard way)

- Tag + note state before each phase: `git tag <name> && git push origin <name>`.
- Commit small, per game — a bad game is one revert away.
- If the working tree has files modified that nobody claims (owner WIP): do not commit them; ask the owner, exactly like BoardClassRally/BoardGrammarLab/BoardStoryQuest/rebuild-unit were handled.
- Reports are claims; the repo is the truth. Verify every "complete" against `_INDEX.md` and `git status`.
- Owner reads in plain English — keep summaries jargon-light.

Begin with Phase A now: inventory the student app's game surfaces and produce `docs/audit/student-app-v3/_INDEX.md`. Ask the owner for his student-app comments (if any) before writing per-game audits.
