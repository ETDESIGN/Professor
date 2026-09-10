# Wave-1 Retro — how closely did we follow Stitch, and what changes now

**Owner verdict (2026-09-11, verbatim intent):** the work is good and the Stitch→app direction is right, BUT the Stitch designs were followed too little. They were produced from OUR instructions, so their layout, colors and spacing are already what we want — the code can often be used nearly as-is. Only the top/bottom chrome (teacher-sync pills, system icon clusters, duplicated student/score info) doesn't belong. Some pages also ended up carrying too much unneeded information and feel crowded. **Process change: one game at a time, deeper design fidelity, and a head-to-head against Anti-Gravity on the same game before continuing by batch.**

## What I actually did in wave 1 (honest accounting)

Looking at the five shipped games against their Stitch exports, my deviations fall into four patterns — the first two were mistakes, the last two were partly justified but taken too far:

### 1. Palette/typography "translation" instead of adoption ✗
Every design's own colors were remapped onto my generic v3 tokens: Listen & Tap's electric cyan `#00ffcc` became sky `#38BDF8`; Sora/Inter/Space Grotesk became Fredoka/JetBrains Mono everywhere; each game's bespoke accent system was flattened to the same look. Result: five games that read as one template instead of five designs. **New rule: adopt the design's own colors, spacing and type scale per game.** The exported HTML contains the exact values — use them.

### 2. Re-authoring instead of starting from the Stitch HTML ✗
I rewrote every screen from scratch in idiomatic Tailwind, keeping only the structural idea. That's why proportions, paddings, and details drift: I approximated what the design specified exactly. **New rule: the implementation STARTS from the Stitch HTML** (it's plain Tailwind + a small style block). Keep its DOM tree and classes; strip chrome; wire React state into it. Where the game needs states the mock doesn't show (wrong-answer, teaching reveal), extend in the design's own vocabulary — same tokens, same spacing rhythm.

### 3. Dropped elements ∼ half-right
**Right to strip** (fake mock chrome): "Teacher Pad Synced / Console Synced" pills, volume/settings/fullscreen icon clusters, class-bank/score chips (BoardShell owns those), student avatar chips (whose-turn pill owns that), hover-only transport bars.
**Wrong to drop or shrink** (real design content): Unscramble's landscape photo card (skipped entirely — needs a content-model substitution, not deletion), Phonics' phoneme-highlight typography and IPA tags, Vocab Blitz's pod feature pills, Listen & Tap's footer HUD proportions and card label plates. These carried the designs' character.

### 4. Added noise ∼ sometimes
A few surfaces ended up busier than the design (extra chips, counters, hints stacked in headers). The mocks are already generous — porting them *plus* my additions crowds the board. **New rule: what the design doesn't show doesn't get added** unless a gameplay need demands it, and then it replaces something, not stacks on it.

## Per-game fidelity debt (candidate restore list — AFTER the head-to-head)
- **10 Listen & Tap:** adopt its cyan accent system + card proportions + banner styling verbatim; restore the label-plate layout exactly.
- **12 Unscramble:** design's split (photo card + task frame) — needs a data substitution for the photo (use the objective's `word_images` asset); restore workshop proportions.
- **22 Phonics:** restore tablet corner decals at design scale, phoneme-span highlighting where content permits (fall back gracefully), amber/tertiary accent as designed.
- **32 Vocab Blitz:** restore pod feature pills and the design's gate composition.
- **11 Flash Match:** closest to its (revised) design — mostly fine; verify proportions against the export again.

## The new loop (one game at a time)
1. Stitch export lands → QA (landscape cards, no Chinese on challenges, nothing clipped, top-left 200px clear).
2. Implement **starting from the exported HTML**: strip chrome, substitute real data, wire the game engine + lifecycle contract.
3. Side-by-side (design PNG vs board screenshot) BEFORE moving on; owner reviews.
4. Head-to-head with Anti-Gravity on the same game; compare; the winner's approach becomes the template.

## Owner's observed small design bugs
Collected here one by one as reported (2026-09-11: none named yet — to be filled in during the one-by-one passes).
