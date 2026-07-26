# Team Battle Screen (Team ASSESS Phase)
### Research → Redesign → Google Stitch Prompt

Sixth screen in the same shell (Prompt 01), following Vocabulary Presentation (02), Story Stage (03), Listen & Tap (04), and Speed Quiz (05). Same touch-tap distinction: answer tiles AND grid cells are physically tapped on the board by the answering student (or the teacher on their behalf); everything else on the frame is a passive readout. Teams are assumed already formed before this screen loads.

---

## PART A — Research: Team Competition, Strategy Layers, and Managed Social Pressure

### A1. Team Games Tournament — the model this screen is basically implementing
This screen is, structurally, a live version of the classic **Team Games Tournament (TGT)** model: <cite index="16-1">a type of cooperative learning that integrates competitive games into group learning activities, encouraging active student participation through structured tournaments and enhancing motivation and engagement.</cite> TGT's theoretical grounding matters for the design brief specifically because it emphasizes *structured* turns and *meaningful peer interaction* — a real-world classroom trial found <cite index="16-1">the model aligns with Piaget's cognitive constructivism, since learners at this developmental stage construct knowledge best through direct experience, manipulation of objects, and meaningful peer interaction</cite>, which is exactly why the strategy layer (choosing *which* cell to claim, discussing as a team) isn't just "fun" — it's the actual constructivist mechanism making this more effective than a plain quiz.

### A2. Team framing measurably reduces individual anxiety
This is the single most important research finding for this specific screen, because Team Battle is structurally the most publicly exposed screen in the whole app (a named kid, tapping in front of everyone, representing a group). The evidence is reassuring: <cite index="15-1">researchers have focused on collaborative and team-based games because they minimize self-pressure and stimulate a peer scaffold that aids motivation and anxiety alleviation</cite>. But competition itself isn't automatically anxiety-free — a study of adolescent EFL classes found that <cite index="18-1">emotional pressure reduced verbal engagement through hesitation or silence, and learners' participation became selective depending on their confidence, anxiety, and perceived classroom position</cite>, meaning the *design* of the competitive framing matters as much as the fact of teaming up.

**Design consequence:** the team framing needs to visibly carry the *whole team's* effort, not spotlight one kid's individual failure. The "steal" mechanic (wrong answer passes to the other team) is good pedagogically, but the losing student's moment needs the same gentle, quick-resolving treatment established across Listen & Tap and Speed Quiz — arguably gentler here, since a team is watching.

### A3. Leaderboard/competition design has a known failure mode to avoid
Research on team-based leaderboards found a specific caution: <cite index="20-1">leaderboards may facilitate collaboration, but the collaborative element of a competition doesn't automatically offset the negative effects of certain leaderboard designs — an "infinite" or open-ended leaderboard has real drawbacks</cite>, and the researchers suggest redesigning leaderboards for educational use to mitigate this. This maps directly onto Team Battle's win condition: because the game is bounded (a 3×3 grid, a fixed number of rounds) rather than an open-ended running score, it naturally avoids the "infinite leaderboard" failure mode — but the score readout on screen should stay similarly bounded/contextual (this round's grid state, this game's score), not a raw cumulative number that makes some kids feel perpetually behind.

### A4. Strategy as its own engagement layer, distinct from knowledge retrieval
Educational game-theory framing treats strategic choice (block vs. build) as a genuinely separate cognitive/social layer from the underlying content question — the "which cell" decision is a real, visible act of team reasoning that happens *after* the content question resolves, giving the team a second, distinct moment of shared agency beyond just "did we get the vocab right."

**Design consequence:** the "Choose your cell!" moment deserves its own clear visual beat, separate from the correct-answer celebration — it's not just a placement animation, it's the moment the team's strategic thinking becomes visible to the whole room (and to the opposing team, who can see and react to the choice).

### A5. Sports-broadcast victory design — MVP + team win, not either/or
Real sports broadcasts and game shows never resolve a team win with only a team scoreline — they always pair it with an individual standout moment (MVP, player of the match), because it lets the celebration operate at two emotionally distinct scales simultaneously: "we won together" and "you personally did something great." This dual-framing is why the brief's request for both a team-win banner and an MVP card is correct instinct, not redundant.

### Synthesis — five rules for the redesign
1. **The team carries the moment, not the individual.** Wins and losses read as team events first; individual contribution is celebrated *within* that frame (MVP), never isolated as individual blame.
2. **Steal-backs stay gentle.** A missed answer that hands the turn to the other team needs the calmest failure treatment in the whole app — the whole room is watching.
3. **Keep the score bounded and contextual.** This game's grid state, not a raw cumulative leaderboard number, is the primary score readout during play.
4. **Give strategy its own visual beat.** "Choose your cell!" is a distinct moment from "you got it right" — both deserve separate, deliberate framing.
5. **Pair team-win with MVP.** The victory screen operates at both scales at once, per A5.

---

## PART B — Redesign: Team Battle Screen

### B0. Round sequence
```
PRE-GAME: rosters slide in, grid appears, "Battle Start!" countdown
        │
   SYSTEM PICKS STUDENT from active team (round-robin within team)
   Banner: "🔴 Red — Leo's turn!"        Waiting team sees: "🔵 Blue — you're up next!"
        │
   QUESTION + TIMER (15s) + 4 shaped tiles
        │
   Student answers ──► CORRECT ──► "Choose your cell!" (grid pulses, cells glow)
        │                              │
        │                       student taps a cell → stamp animation → check 3-in-a-row
        │                              │
        │                     3-in-a-row? ──► VICTORY SCREEN
        │                     no? ──► next round, turn passes to other team
        │
        └──► WRONG ──► "🔁 Blue Team — steal the chance!" (same question re-shown to other team)
                             │
                        correct? ──► that team claims a cell (same flow as above)
                        wrong too? ──► round ends, no claim, next round
```

### B1. Pre-game beat
- Team rosters slide in from the sides: Red from the left, Blue from the right — each roster shows member avatars + names in a vertical list, team color framing throughout.
- The empty 3×3 grid materializes center-stage between them.
- A dramatic "Battle Start!" countdown (3-2-1) plays, matching the shell's existing motion language for anticipatory beats (similar in spirit to Speed Quiz's "Ready?" pulse, but bigger, since this is the climactic team moment of the lesson).
- Starting scores (carried in from the leaderboard, per the brief) display briefly under each roster before settling into their persistent position.

### B2. Main battle layout
**Left column (~20% width): Team Red roster.** Member avatars + names stacked vertically, team-red color framing (border/glow), running score at the top of the column. When Red is the active team, the whole column pulses gently.

**Center (~60% width): the battle grid.** The clear visual focus of the screen — 3×3, large cells, generous gaps between them so claimed/empty states are unambiguous even from the back of the room. Empty cells sit in a neutral, softly shimmering state (inviting but not yet claimed by anyone); claimed cells fill solid with the claiming team's color plus a simple, friendly team-emoji watermark (rather than literal "flames/ice" iconography, which risks reading as aggressive — a simple star, paw print, or the team's mascot emoji keeps the tone playful per A2's anxiety-management goal).

**Right column (~20% width): Team Blue roster.** Mirror of Red.

**Above the grid: question + timer + answer tiles.** Same shape+color tile convention established in Speed Quiz (red triangle / blue diamond / yellow circle / green square) — deliberately reused, not reinvented, so the two ASSESS-phase screens feel like siblings. Timer ring uses the same green→amber→red logic, generously set to 15s per the brief (versus Speed Quiz's tighter 10s), reflecting that a team, not a lone student, is the unit under time pressure — teammates whispering hints is an intended, welcome behavior here.

**Bottom: progress + whose-turn banner + class-whisper cue.** "Round 5 of 9" alongside the shell's existing whose-turn banner styling (now team-color-tinted to match whichever team is active), plus the same gentle "whisper your answer" prompt used elsewhere — here it applies to the *whole room*, not just the active team, since anyone might want to root/whisper along.

### B3. "Choose your cell!" moment
Distinct from the correct-answer celebration itself (per A4): once the question resolves correctly, the answer tiles clear and the grid becomes the active focus — empty cells pulse with an inviting glow in the claiming team's color, a short prompt reads "Choose your cell! 选一个格子！", and the claiming student (physically at the board) taps their chosen cell. On tap: a satisfying "stamp" animation — a quick scale-in + settle, like a flag or seal being placed, filling the cell with the team's color and emoji watermark. The grid immediately checks for 3-in-a-row; if found, transitions directly into the Victory screen (B5); if not, control passes back to pre-game-style round setup for the next turn.

### B4. Steal mechanic
On a wrong answer: no tile shake-flood, no grid interaction yet — a clear, calm banner announcement takes over briefly: "🔁 Blue Team — steal the chance!" (team-colored to Blue), and the *same* question re-appears with fresh tiles for the stealing team's picked student. This reuses the existing question rather than generating a new one, which keeps the "steal" framing legible (the room understands it's the same challenge, now open to the other side) and avoids implying the first team's miss was uniquely punished with extra content — it's simply an open opportunity now, framed neutrally.

If the stealing team also misses: the round closes without a claim, no dramatic loss framing for either team — just a calm transition to the next round, keeping the emotional stakes bounded per A3's caution against open-ended competitive pressure.

### B5. Victory screen
- **Winning line trace:** an animated line draws itself through the 3 winning cells (or, if the grid filled without a 3-in-a-row, the grid simply settles into its final state) — a clear, satisfying "there it is" visual moment before the full-screen celebration takes over.
- **Grid color burst:** the whole grid area bursts with the winning team's color, confetti in that color filling the stage.
- **Team win banner:** "🟥 Red Team Wins!" — the single largest text on the victory screen, since per A5 the team win is the primary framing.
- **MVP card:** a secondary, distinct card — "⭐ Leo — 3 cells claimed, 2 correct answers!" — clearly framed as *part of* the team celebration, not a competing headline (smaller than the team-win banner, positioned beneath or beside it).
- **Bonus animation:** small "+50" text floats up beside each winning-team member's name in their roster column, reinforcing that the whole team benefits, not just the MVP.
- **Score comparison:** updated Red vs Blue totals shown clearly but modestly — consistent with A3's "keep it bounded and contextual" principle, this is this game's final tally, not framed as an all-time leaderboard.
- **"Next →" prompt:** the same calm, non-interactive signpost style used at every other phase transition in the app, teacher-advanced from the Remote.

### B6. Team engagement for the waiting team
While the active team's student answers, the waiting team's roster column shows a clear, friendly "🔵 Blue — you're up next!" cue with a soft pulse, keeping their attention on the game rather than disengaging. Above their roster, a **strategy thought-bubble** cycles through short, fun pre-set phrases ("Block their diagonal!", "Go for the corner!", "We've got this!") — purely flavor/personality, not functional instruction, giving the waiting team something lighthearted to rally around rather than passive spectating.

### B7. Visual identity
Base wash inherits the shell's ASSESS red/orange intensity, but the screen is explicitly bisected by team color: Red's roster column and active-state glow use a warm red/amber tint, Blue's use a cool blue/cyan tint, while the grid itself stays visually neutral (dark, shimmering) until cells are claimed — the battleground is impartial; the sides are not. This bisection is what gives the screen its "sports match" identity distinct from Speed Quiz's more uniform red intensity.

### B8. Bilingual design
Same convention as Speed Quiz: question text English-primary with the target word emphasized, answer tiles carry the Chinese meaning options as primary content (since that's literally the task), roster names stay in English/pinyin as elsewhere in the app for consistency.

### B9. Motion / animation language
- Pre-game: rosters slide in from sides (~500ms), grid materializes center, countdown pulses 3-2-1 (bigger/more dramatic than Speed Quiz's "Ready?" beat, matching this screen's climactic role).
- Cell claim stamp: quick scale-in + settle (~300ms), satisfying "placed" feel, not a slow reveal.
- "Choose your cell!" pulse: gentle looping glow on empty cells until one is tapped, distinct in tempo from the correct-answer celebration that precedes it.
- Steal transition: calm banner slide, no shake/flash — deliberately the gentlest transition in the whole screen, per A2/B4.
- Winning line trace: the line draws itself across the 3 cells over ~400-600ms before the full celebration bursts, giving the room a beat to see it forming rather than an instant flash.
- Victory burst: biggest celebration moment in the ASSESS phase family (bigger than Speed Quiz's results screen, though still smaller than WRAP-UP's full lesson-ending celebration) — full-grid color wash, confetti, staggered entrance of team-banner → MVP card → bonus animations → score comparison, giving the finale its own unhurried ritual pacing.

---

## PART C — Google Stitch Prompt

Same touch-tap note as prior ASSESS screens: the 4 answer tiles AND the grid cells are physically tapped on the board by the answering/claiming student, so both should read as tactile, pressable objects; rosters, banners, timer, and the score readouts remain passive displays.

```
Design a high-fidelity UI mockup for the "Team Battle" screen — a
competitive team tic-tac-toe game rendering inside a classroom projector
display (ClassroomBoard), during the team-based ASSESS phase of an English
lesson for Chinese-speaking K-12 students. Landscape 16:9, 1920x1080
reference canvas, viewed from 5-10 meters away. Show THREE separate
views/frames within the same design: (1) Main Battle view, (2) "Choose
your cell!" moment, (3) Victory view — laid out as three distinct
screens/panels.

CRITICAL — TOUCH VS DISPLAY: the 4 answer tiles (view 1) and the grid
cells (view 2) ARE physically tapped on the board by a student, so style
them as clearly tactile, pressable objects (soft shadow/elevation,
rounded, satisfying "big button" feel). Team rosters, the timer ring, the
whose-turn banner, and score readouts are passive, non-interactive
displays — the teacher controls pacing and grading from a separate remote
device.

BACKGROUND (all views): deep red-orange ASSESS-phase wash, approx
#2E0F14 to #1A0A0C, but visually bisected by team color: the left third of
the screen carries a warm red/amber tint bleeding in from the edge, the
right third carries a cool blue/cyan tint bleeding in from its edge, and
the center stays closer to the neutral dark ASSESS base — evoking a
"battleground between two sides" feel.

VIEW 1 — MAIN BATTLE:
- Left column (~20% width): "Team Red" roster — a vertical list of 4
  small circular avatars with names beneath (e.g. Leo, Mia, Ken, Ana),
  framed in a warm red glow, with "Red: 320" as a bold score readout at
  the top of the column. The whole column has a gentle red pulse
  indicating Red is the currently active team.
- Right column (~20% width): "Team Blue" roster, mirrored — 4 avatars/
  names, blue glow framing, "Blue: 180" score at top, resting (non-active)
  state, slightly dimmer than the Red column.
- Center (~60% width): a 3x3 tic-tac-toe grid, large cells with generous
  gaps. 4 cells already claimed: 3 filled solid red with a small star
  watermark icon, 1 filled solid blue with a small star watermark icon,
  the remaining 5 cells empty/neutral with a soft dark shimmer.
- Above the grid: a question area showing "What does giraffe mean?" in
  large bold English text with the word "giraffe" emphasized, small
  Chinese gloss beneath, a circular countdown timer ring nearby showing
  "12" and colored green-to-amber (12 of 15 seconds remaining), and below
  the question 4 large shaped/colored answer tiles: red triangle-framed
  tile with "长颈鹿", blue diamond-framed tile with "斑马", yellow
  circle-framed tile with "大象", green square-framed tile with "老虎" —
  each tile with a soft shadow suggesting it's pressable.
- Bottom-center: a glowing whose-turn banner tinted red, reading "🔴 Red —
  Mia's turn!" with a small circular avatar, plus small text "Round 5 of
  9" nearby.

VIEW 2 — "CHOOSE YOUR CELL!":
- Same layout as View 1, but the question/timer/tiles area has cleared
  and been replaced by a prompt: "Choose your cell! 选一个格子！" in large
  friendly text.
- The grid's 5 previously-empty cells now show a soft inviting red glow
  pulse (since Red just answered correctly and is choosing where to
  claim), while the 4 already-claimed cells (3 red, 1 blue) stay as they
  were.
- Team Red's roster column pulses more intensely, indicating it's their
  moment to act.
- A small strategy thought-bubble appears above Team Blue's (waiting)
  roster reading "Block their diagonal! 🤔" in a playful speech-bubble
  style, adding personality while Blue waits.

VIEW 3 — VICTORY:
- Full-stage celebratory takeover: the grid's winning diagonal line (3
  red cells) glows brightly with an animated trace line drawn through
  them, the whole grid area bursts with red confetti and a warm red color
  wash.
- Large centered text: "🟥 Red Team Wins!" as the single biggest element
  on screen.
- Beneath it, a smaller distinct card: "⭐ Leo — 3 cells claimed, 2
  correct answers!" (MVP callout, clearly secondary to the team-win
  banner).
- Small "+50" floating text animations beside each Red team member's name
  in the left roster column, indicating a bonus.
- A modest score comparison line: "Red 470 · Blue 180" beneath the main
  celebration.
- Near the bottom, a calm, clearly non-interactive signpost/plaque
  reading "Next →" — an informational readout, not a button.

TYPOGRAPHY: question text and the team-win banner extremely large and
bold; roster names and scores clearly legible but secondary in scale;
Chinese answer-tile text large (primary content on this screen, same
convention as Speed Quiz); MVP and bonus text medium-sized but still well
above normal UI body-text size given the 5-10m viewing distance.

STYLE: high-energy, competitive "sports match meets game show" mood —
dramatic team-vs-team framing via the red/blue color bisection, tactile
game-piece feel on the grid cells and answer tiles, friendly (not
aggressive) team iconography (stars/emoji, not flames or weapons).
Rounded corners, soft glows, bilingual typography throughout, no
third-party logos, no branded IP, no button/tab/menu chrome anywhere
beyond the explicitly tactile tiles and cells called out above.
```

---

If useful, I can also draft a standalone Stitch prompt for the "steal" moment (the calm banner transition when the turn passes to the other team) as its own scene.
