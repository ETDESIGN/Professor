# Anti-Gravity prompt — the true final game: Grammar Lab (17)

Copy everything below the line to Anti-Gravity.

---

## Task: Grammar Lab (17) is the REAL last game — redesign `apps/board/templates/BoardGrammarLab.tsx`

Your "all 24 complete" report was wrong by one: Grammar Lab was never redesigned — the file carried the owner's unsaved changes and was on your do-not-touch list. Those changes are now committed (celebration polish), the file is clear to edit, and its Stitch designs are already exported. Close out the set for real this time.

**Design sources:**
- `docs/audit/games-v3/stitch/17-grammar-lab/1-building.html` — sentence-building state (color-coded syntax pills: blue SUBJECT / green VERB / purple OBJECT; numbered dashed runway slots; tactile word-bank blocks; amber "snapped" state)
- `docs/audit/games-v3/stitch/17-grammar-lab/2-warming.html` — the kid-friendly bilingual warming-up empty state (bubbling test tube, '语法实验准备中…' IS allowed here — it's a holding state, not a challenge)

**Audit:** `docs/audit/games-v3/17-grammar-lab.md` §3/§4. Resolve what's in your power:
- The jargon empty state → replace with the warming-up card from design #2.
- The washed-out construction stage → the design's full-canvas runway + 3D blocks (Unscramble's shipped "Syntax Workshop" and Sentence Lab are close cousins — consistent vocabulary is good, but follow THIS design's own colors/spacing).
- Error-spot prompts must clearly say what's being asked (find the wrong word vs pick the correction) — Grammar Forge already established the pattern; reuse the framing.

**Out of scope — do NOT touch (flag in §6 instead):**
- `supabase/functions/generate-exercises/**` (the ERROR_SPOT distractor quality issue lives there — edge functions are forbidden for you).
- `apps/board/BoardShell.tsx` (the leaderboard-rail retraction for choral/empty states).

**Rules (unchanged):** start FROM the design HTML; preserve ALL logic verbatim (state machine, dual-write scoring, remote actions, the owner's just-committed confetti + animated trophy completion); headers start `pl-40 lg:pl-48`; phone floor 700×320 zero scroll; no git, no deploys; gauntlet before done — `npx tsc --noEmit -p tsconfig.json` (0 errors), `npx vitest run` (798 passing), `npm run build`. Add a test suite in the style of your Story Quest / Class Rally ones. Update `17-grammar-lab.md` §6 + `_INDEX.md` row 17, and this time verify your completion claim against `_INDEX.md` before reporting — the owner tests live.
