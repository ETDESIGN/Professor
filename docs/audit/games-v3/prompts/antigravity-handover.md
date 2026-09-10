# Anti-Gravity handover — run the games-v3 loop

Copy everything below the line to Anti-Gravity. It contains the constraints that live outside
the repo docs it has already read (deploy paths, known traps, do-not-touch files).

---

You now own the games-v3 implementation loop: implement the remaining Stitch designs, verify,
and fix the open defects (your own wave-1 validation findings + the §3 findings in each game
file). You implement; the owner + ZCode review and deploy. Work exactly like your Story Stage 2
build, which won the head-to-head — that calibration is the template.

## Scope (in priority order)
1. **Fix your own wave-1 validation findings first** (they block real classrooms):
   - Unscramble: word bank tray 100% below the screen edge at 700×320 — catastrophic.
   - Phonics Arena: duel tablets pushed off-screen at 700×320 — catastrophic.
   - Vocab Blitz: blank screen in choral mode (quickWheelWinner null at the confidence gate) — logic bug.
   - Listen & Tap: word labels visible during the listening phase (sight-reading leak) + missing-image fallback renders a blank block.
   - Listen & Tap / Flash Match / Vocab Blitz: header pill collisions at the phone floor.
   - Universal: add a `@media (max-height: 450px)` pass per game (compressed headers, smaller pads, no scrolling during play).
2. **Then implement the wave-2 designs one game at a time**, owner reviews each before the next: 03 Media Player, 13 I Say You Say, 17 Grammar Lab, 18 Word Detective, 19 Sound Lab, 20 Story Quest, 21 Sentence Lab, 23 Memory Lab, 24 Class Rally, 25 Fast Vocab, 27 Spelling Bee, 28 Comic Panels. Designs: `docs/audit/games-v3/stitch/<nn>-game>/*.html` (start FROM the HTML — colors, spacing, tree — strip only mock chrome). Logic fixes for these games are ALREADY deployed (commit bfd78ab) — don't re-fix, don't regress.
3. New-game audits you wrote (14/15/09/29): §5 Stitch prompts are ZCode's to submit — park those.

## Hard rules
- **One component file per game** (`apps/board/templates/Board*.tsx`). Never edit: `store/SessionContext.tsx`, `apps/board/BoardShell.tsx`, `supabase/functions/**`, anything under `services/`. If a fix seems to need those, note it in the game's §7 and stop — flag it for ZCode instead.
- **Do not touch these files** — they contain the owner's uncommitted work-in-progress and must not be modified or committed: `apps/board/templates/BoardClassRally.tsx`, `BoardGrammarLab.tsx`, `BoardStoryQuest.tsx`, `supabase/functions/rebuild-unit/index.ts`.
- **Lifecycle contract is sacred** (read `LIVE_GAME_LIFECYCLE.md` first): NEW_TURN reset, mistake refs, `addPoints`+`scoreForAttempt`, personalized messages. Your Story Stage 2 build preserved it perfectly — same discipline everywhere.
- **Gauntlet before you call anything done**: `npx tsc --noEmit -p tsconfig.json` (0 errors), `npx vitest run` (762 passing), `npm run build`. Run all three every time — no exceptions, no partial passes.
- **No git commands, no deploys.** You write code + docs; the owner/ZCode commit and deploy. When a game is gauntlet-green, append your implementation notes to that game's `§6`/`§7` section (what you built, every deviation from the Stitch HTML and why) so review is fast.
- **Design fidelity**: adopt the Stitch HTML's own palette/typography/spacing per game (each export declares its tokens). Strip only: teacher-sync pills, volume/settings/fullscreen clusters, duplicated student/score chrome (BoardShell owns those), SPACEBAR tags, response meters. Game headers start `pl-40 lg:pl-48` (the shell's phase pill owns the top-left ~180px). Cards on the stage are LANDSCAPE. No Chinese on challenge surfaces (L1 support chips are allowed where the audit specifies).
- **Responsive floor**: every game must fit 700×320 phone-landscape with zero page scroll during play. Test with the Playwright pattern in `scripts/testing/games-v3-*-shots.ts` if you can run it; otherwise state clearly in your notes that the floor is unverified.

## Known traps (read twice)
- The app is a PWA with `registerType: 'prompt'` — after a deploy, already-open tabs keep old code until the user accepts the Reload banner. Never diagnose a "still broken" bug without a hard refresh first.
- Edge functions do NOT auto-deploy on git push — but you're not deploying anyway.
- `supabase/functions/**` typechecks with Deno globals; the repo `tsc -p tsconfig.json` does not cover them.
- A backup of the whole project exists at `../professor-BACKUP-2026-09-11-pre-antigravity/` and git tag `backup-pre-antigravity-2026-09-11` is pushed — breakage is recoverable, but treat small, per-game changes as the real safety net.
