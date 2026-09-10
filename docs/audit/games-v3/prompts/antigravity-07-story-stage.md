# Anti-Gravity implementation prompt — 07 Story Stage (head-to-head)

Copy everything below the line into Anti-Gravity.

---

## Task: implement the Story Stage board redesign (YOUR version — we will compare it head-to-head with ZCode's version)

**Goal.** Rebuild the READING state of `apps/board/templates/BoardStoryStage.tsx` from the approved Stitch design, starting FROM the design's actual HTML — keep its layout tree, colors, spacing and typography; do NOT re-author it from scratch in your own style.

**Design source (read these first):**
- `docs/audit/games-v3/stitch/07-story-stage/1-reading-theater.html` — the reading state (your main target)
- `docs/audit/games-v3/stitch/07-story-stage/2-comprehension.html` — the comprehension quiz state (secondary, if you have budget)
- The audit context: `docs/audit/games-v3/07-story-stage.md` (§2 owner comments, §3 code findings, §4 your own audit)

**Hard rules:**
1. **Work in a separate file**: copy the component to `apps/board/templates/BoardStoryStage.ag.tsx` and edit ONLY that copy (add `export default` at the end). Do not modify the original `BoardStoryStage.tsx`, the store, or any other file — we swap the boardMap import to compare versions.
2. **Preserve ALL logic verbatim**: state, effects, handlers, the comprehension scoring (`doDualWrite`, `logAttempt`), the `askedComprehensionItems` coordination, remote actions (`NEXT_PANEL`/`PREV_PANEL`/`REVEAL_HINT`/`MARK_CORRECT`/`RESET_GAME`/`SLIDE_COMPLETE`), and the `renderText` vocab highlighting. You are replacing the PRESENTATION of the story-page state only (`isPage && current && ...` block).
3. **Follow the design**: adopt its two-column 38/62 split, the speaker identity header (avatar halo + SPEAKING NOW + LINE n/N), the 44px dialogue blockquote, the sky REPLAY AUDIO LINE pill, the chunky 28px progress dots (done=emerald ✓ / active=pink pulse / upcoming=outline), the right-column UNCROPPED `object-contain` art card with ambient gradient, and the footer nav (secondary Back + hot-pink Next Line). Keep the design's exact color values (`#070C18/#0B132B/#111C3D/#16234D`, pink `#FF2E79`, sky `#38BDF8`, emerald `#10B981`) and its Fredoka/Sora/JetBrains Mono font roles.
4. **Strip only mock chrome**: the "TEACHER CONSOLE SYNCED" pill, the volume/settings/fullscreen icon cluster, the SPACEBAR kbd tag, the "Class Response Meter", the footer's projection/audio status text, and the Emphasis/Mood chips (no data for them). Student identity and scores already live in the BoardShell (whose-turn pill + rails) — do not duplicate them; the game header starts `pl-40 lg:pl-48` to clear the shell's phase pill at the top-left.
5. **Wire real data**: speaker = `current.speaker` with `getCharColor()`, avatar via `speakerPortrait` (fallback initial/emoji in the colored halo), text = `renderText(current.text)`, art = `current.imageUrl` (object-contain, NEVER object-cover — owner rule), progress = `pages.length`, chapter subtitle = `data.title`. Next/Back buttons call local `nextPanel()`/`prevPanel()` helpers with the same rules as the `NEXT_PANEL`/`PREV_PANEL` action cases.
6. **Responsive**: must fit a projected 16:9 board AND a 700×320 phone-landscape floor (reflow allowed, no scrolling during play). The design's 1280×1024 canvas values scale down responsively (clamp the blockquote to ~22px at the floor).
7. **Verify**: `npx tsc --noEmit -p tsconfig.json` must be clean; `npx vitest run` must stay 762 passing; `npm run build` must succeed. Do not run git commands.

**Deliverable**: the new `BoardStoryStage.ag.tsx` + a short note (in `docs/audit/games-v3/07-story-stage.md`, new section `## §7 Anti-Gravity implementation notes`) listing every deviation you made from the Stitch HTML and why.
