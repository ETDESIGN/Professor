# Anti-Gravity prompt — finish the last two games

Copy everything below the line to Anti-Gravity.

---

## Task: implement the FINAL two games — Story Quest (20) and Class Rally (24) — and close out games-v3

Both files are now clear to edit (the owner's WIP is committed). Implement each from its Stitch export, verify, and report — after this, all 24 games are done.

### Game 1: Story Quest — `apps/board/templates/BoardStoryQuest.tsx`
**Design sources:** `docs/audit/games-v3/stitch/20-story-quest/1-storybook.html` (storybook dialogue state) and `2-choice.html` (choice moment state).
**Audit:** `docs/audit/games-v3/20-story-quest.md` §3/§4. Key defects to resolve:
- Story art is destructively cropped (`h-64 object-cover`) — the design and owner rule demand UNCROPPED `object-contain` in a proper card (Story Stage 07 shipped exactly this pattern; reuse it).
- Wall-of-text dialogue → structure as speaker turns: bubble cards with speaker name chips in their theme color, active turn highlighted (see the design's left column).
- The game now runs full-bleed (I added STORY_QUEST to the rails-retract set — deploy 802cf5e). Keep the owner's just-committed ending-card celebration animation (the animated 📚 trophy on the end card).
- Keep panel navigation, scoring, remote actions, and the comprehension items logic verbatim.

### Game 2: Class Rally — `apps/board/templates/BoardClassRally.tsx`
**Design sources:** `docs/audit/games-v3/stitch/24-class-rally/1-rally.html` (collective rally state) and `2-milestone.html` (milestone celebration state).
**Audit:** `docs/audit/games-v3/24-class-rally.md` §3/§4. Key defects to resolve:
- The rally bar is the hero: make it BIG and energetic (thick, gradient, flame riding the fill, big n/12 counter) per the design.
- Remove the double-nested white card structure — flat dark surfaces.
- Keep the choral "ALL ANSWER" mode with clear board cues (the big ✓ CLASS NAILED IT / ✗ TRY AGAIN buttons from the design).
- Keep the owner's just-committed RALLY COMPLETE celebration animation (the big animated 🏆).
- Do NOT change the TARGET_CORRECT=12 mechanic or scoring logic — presentation only.
- The board badge should read PRACTICE (phase mapping already fixed).

### Rules (same as your handover brief — unchanged)
- Start FROM the design HTML: adopt its layout tree, colors, spacing, typography; strip only mock chrome (sync pills, system icon clusters, duplicated student/score info); headers start `pl-40 lg:pl-48`.
- One component file per game. Never edit `store/SessionContext.tsx`, `apps/board/BoardShell.tsx`, `supabase/functions/**`, `services/**`. If a fix needs them, note it in the game's §6 and stop.
- Lifecycle contract sacred (NEW_TURN reset, mistake refs, addPoints+scoreForAttempt, personalized messages).
- Phone floor 700×320, zero scroll during play, `@media (max-height: 450px)` pass.
- No git, no deploys. Gauntlet before done: `npx tsc --noEmit -p tsconfig.json` (0 errors), `npx vitest run` (789 passing), `npm run build`.
- Update each game's §6 (implementation notes + every deviation from the Stitch HTML and why) and `_INDEX.md`. Report BOTH games when done — the owner is testing live, so accurate status matters.
