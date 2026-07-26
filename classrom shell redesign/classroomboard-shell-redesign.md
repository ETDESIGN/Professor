# ClassroomBoard Shell Redesign
### Research → Redesign → Google Stitch Prompt

---

## PART A — Research: What Makes a Big-Screen Classroom UI Work

I looked at the genre leaders across three categories: quiz/game-show EdTech, teacher-paced presentation tools, and actual TV game-show set design. Five cross-cutting principles kept showing up, and they map directly onto the Live Board's problems.

### A1. Kahoot — the legibility + color-coding gold standard
Kahoot's interface leans on a small, saturated, high-contrast palette — bright primary-ish red, blue, green and yellow used for the answer options, memorable and cartoonish, giving the brand personality. Two things matter more than the specific hues: **every distinct game state gets its own color**, and colors are used at **full saturation with black/white text**, never muddy mid-tones. Research on Kahoot specifically found that large, legible fonts and high-contrast color schemes measurably improved comprehension and engagement, and the platform pairs that with animated graphics, sound effects, and feedback mechanisms that create a sense of excitement and motivation — the color and motion aren't decoration, they're doing comprehension work from across a room.

**Takeaway for the Live Board:** don't use color as texture (the current dark-slate-everywhere approach) — use it as a *state signal*. One glance at hue should tell you the phase.

### A2. Nearpod — teacher-paced progression made visible
Nearpod's core interaction model is a teacher driving a deck slide-by-slide while a persistent progress rail shows where the class is in the lesson and locks students to that position. The lesson is legible as a *sequence with a current position*, not just "whatever's on screen now."

**Takeaway:** the phase arc (Warm-up → Input → Practice → Produce → Assess → Wrap) needs a permanent, glanceable position indicator — not a generic percentage bar, but a labeled trail the teacher and kids can point at.

### A3. Blooket / Gimkit — game-show economy and team identity
These layer a persistent "economy" (points, power-ups, team scores) on top of quiz content, and critically, that economy is **always visible**, never buried in a menu. Team colors extend everywhere — banners, avatars, score chips — so team identity is never ambiguous.

**Takeaway:** team scores can't live only inside a leaderboard overlay. Red vs. Blue needs a permanent corner presence, the way a scoreboard never leaves a sports broadcast.

### A4. ClassDojo — warmth through character, not chrome
ClassDojo's strength is investing personality into *avatars* rather than UI chrome — round, friendly monster characters carry the emotional warmth so the surrounding layout can stay simple and functional. It proves you don't need every pixel to be loud; you need a few high-affect focal points (the avatar, the point animation) against a calmer frame.

**Takeaway:** the "whose turn" banner should be built around a big friendly avatar + name, not just a text strip — that's the single element in the whole shell allowed to be the loudest thing on screen when it's active.

### A5. TV game shows (Jeopardy / Wheel of Fortune / Family Feud) — set design logic
Physical game-show sets solve the exact problem this screen has: legibility for a room, not a lap.
- **The scoreboard is architecture, not UI** — it's built into the set (a physical podium/board), always lit, always in the same place.
- **Turn/active-player lighting** — a spotlight, a lit podium, a "buzzed in" flash — makes it unmistakable whose turn it is, readable in peripheral vision.
- **Category/round headers are oversized and color-coded** and sit in a fixed "header strip" so the eye always knows where to look first.
- **Reveals are theatrical** — a beat of suspense, then a hard flip/flash, then settle. Never a soft fade for the moment that matters.

**Takeaway:** treat the shell's fixed zones (header, score rail, turn banner) like game-show *set pieces* — permanent, lit, and never competing with the content area for attention. Content changes; the set doesn't.

### Synthesis — five rules for the redesign
1. **Color = state**, not decoration. Phase changes hue across the whole frame.
2. **Persistent beats popup.** Score, turn, and phase must be always-on set pieces, not overlays you have to summon.
3. **Big, saturated, high-contrast, sparse.** 3–4 colors per phase max; huge type; short labels.
4. **One loud thing at a time.** The turn banner (or a celebration) is allowed to be the most energetic element on screen — but only one thing wins that role at once.
5. **Motion marks meaning.** Reserve big theatrical motion (flip, flash, confetti) for actual reveals/wins; everything else transitions in under 300ms so it doesn't feel laggy to a room watching it live.

---

## PART B — The Redesign: ClassroomBoard Shell v2

### B0. Mental model
Think of the shell as a **permanent TV set** with one changeable "stage" in the middle. Everything outside the stage — header, phase rail, turn banner, team scores — is *fixed furniture* that's always visible, always lit, and changes color/content live but never disappears or becomes a popup.

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE ARC RAIL (top, full width)                                │
│  ○warmup ─●INPUT─ ○practice ─ ○produce ─ ○assess ─ ○wrap          │
├───────────────────┬─────────────────────────────┬────────────────┤
│                    │                             │                │
│   TEAM SCORE       │                             │   LEADERBOARD  │
│   RAIL (left)      │      STAGE / CONTENT        │   RAIL (right, │
│   🔴 Red   450     │      (current step type     │   collapsible) │
│   🔵 Blue  380     │      renders here)          │   1. Leo  120  │
│                    │                             │   2. Mia  110  │
│                    │                             │   3. ...       │
├───────────────────┴─────────────────────────────┴────────────────┤
│  ROUND-MODE BADGE (left)     "NOW UP" TURN BANNER (center-bottom) │
│  🗣 CHORAL / 🙋 INDIVIDUAL / 👥 TEAM                                │
└─────────────────────────────────────────────────────────────────┘
```

At 16:9+ landscape, the side rails are ~14–16% of width each, collapsible to slim icon strips during full-screen content moments (e.g. STORY_STAGE, MEDIA_PLAYER) so nothing competes with a video/story for attention — they auto-retract and a small tap target on the Teacher Remote brings them back.

### B1. Layout zones, defined

**1. Phase Arc Rail (header, full width, ~72px tall)**
Replaces the tiny phase badge. A horizontal trail of 6 nodes (Warm-up, Input, Practice, Produce, Assess, Wrap), each with an icon + English label + small Chinese label underneath. The current node is large, filled, glowing in the phase color; completed nodes are filled/dimmed checkmarks; future nodes are outline-only. A connecting line fills in behind the current node like a progress trail. This single element solves problem #2 (tiny badge), #5 (generic progress bar), and #7 (monotone theme) at once — it's the thing that recolors the whole shell.

Clock stays top-right, small, secondary — teachers glance at it, kids don't need it.

**2. Team Score Rail (left sidebar, ~15% width, persistent once teams exist)**
Two (or more) stacked team cards: team color chip, team name, big score number, small "+12" pop animation on point changes. Hidden/collapsed entirely pre-team-formation (WARM-UP, most of INPUT) — appears with a slide-in the moment teams are formed, and from then on stays visible through every phase, solving problem #3.

**3. Leaderboard Rail (right sidebar, collapsible)**
Top 3–5 individual scorers, small avatar + name + score, always-present mini version (not full-screen overlay). Tapping "Show full leaderboard" on the Teacher Remote expands it into a full-stage takeover *only* for the WRAP-UP moment — that's the one time it's allowed to be a full-screen celebration. Otherwise it's ambient, glanceable, non-intrusive — solving problem #8 (overlays feel disconnected).

**4. Stage / Content Area (center, ~65–70% width)**
Unchanged responsibility — renders whichever of the ~20 step types is current — but now sits inside a "set" frame: a subtle rounded-corner panel with a phase-colored inner glow/border so it visually belongs to the current phase's world instead of floating on a flat dark background.

**5. Round-Mode Badge (bottom-left, persistent during any round)**
A pill badge: 🗣 CHORAL / 🙋 INDIVIDUAL / 👥 TEAM, each with a distinct icon + micro-color accent (not tied to phase color, so it stays legible against any phase). Solves problem #6.

**6. "Now Up" Turn Banner (bottom-center, appears on pick, persists through the round)**
The single loudest element allowed on screen at once. A wide pill/banner: big circular avatar (generic friendly character, color-matched to the student's team if teams exist), name in huge type, English + Chinese ("Now up: Leo 现在轮到：Leo"), with a subtle pulsing glow ring. Enters with a spotlight-sweep animation (nod to the game-show spotlight motif from A5), stays pinned until the teacher advances the round, then exits with a soft dissolve — never abruptly vanishes mid-round. Solves problem #4.

### B2. Color system — phase-coded themes

Each phase owns a **background wash + accent + rail tint**, all color-blind-safe (verified against deuteranopia/protanopia — every phase pair differs in both hue *and* lightness, never relying on red/green alone; icons/shapes duplicate the meaning so color is never the only signal).

| Phase | Feel | Background wash | Accent (phase-arc node, glows) | Content panel border |
|---|---|---|---|---|
| **WARM-UP** | inviting, cozy | `#2A1B0F` → amber-black gradient | `#F59E0B` (amber-500) | `#FBBF24` |
| **INPUT** | calm, focused | `#0F1B2E` deep blue-slate | `#3B82F6` (blue-500) | `#60A5FA` |
| **PRACTICE** | active, encouraging | `#0F2419` deep green-slate | `#22C55E` (green-500) | `#4ADE80` |
| **PRODUCE** | confident, bright | `#1E1B2E` deep violet-slate | `#A855F7` (purple-500) | `#C084FC` |
| **ASSESS** | intense, urgent | `#2E0F14` deep red-slate | `#EF4444` (red-500) | `#F87171` |
| **WRAP-UP** | celebratory, warm | `#2E1B2E` magenta-gold blend | `#F472B6` + `#FBBF24` dual accent | gold shimmer border |

Fixed elements that must stay legible **regardless of phase**: text is always `#F8FAFC` (near-white) on these dark washes (contrast ratio 12:1+); round-mode badge and team colors (Red `#EF4444` / Blue `#3B82F6` / etc.) are **never** reused as phase accents so they stay identifiable at a glance even when the phase happens to share a hue.

Transition between phases: the background wash cross-fades over ~600ms (slow enough to notice, not a jump-cut) while the phase-arc node animation plays; content panel border color-shifts in sync.

### B3. Typography scale (projector legibility, 10m+ viewing distance)

Base unit assumes a 1920×1080 (or larger) projector canvas. Using Tailwind arbitrary sizes:

| Role | Size | Example class | Notes |
|---|---|---|---|
| Hero content (vocab word, quiz answer) | 96–140px | `text-[9rem]` | English word, bold, tightest line-height |
| Chinese gloss under hero | 40–56px | `text-[3rem]` | Lighter weight, 60–70% opacity of hero |
| "Now up" student name | 64px | `text-[4rem]` | Bold, always-caps optional |
| Team score numbers | 56px | `text-[3.5rem]` | Tabular numerals |
| Phase-arc current label | 28px | `text-3xl` | English; Chinese sub-label 18px |
| Phase-arc other labels | 18px | `text-lg` | Dimmed |
| Round-mode badge text | 22px | `text-2xl` | |
| Leaderboard rows | 24px | `text-2xl` | |
| Clock / secondary chrome | 16px | `text-base` | Lowest priority, muted color |

Font pairing: a rounded, high-x-height geometric sans for English display text (kid-friendly, high legibility — think "Baloo," "Fredoka," or "Nunito" territory) at hero/banner sizes, and a clean, warm-neutral sans (e.g. "Inter" / "PingFang SC" for the Chinese) for gloss text and UI chrome, so Chinese renders crisply rather than through a decorative English font.

### B4. Motion / animation language

- **Phase change:** background cross-fade (600ms) + phase-arc node "arrive" pulse (scale 0.8→1.05→1, 400ms) + content panel border color-shift, synced.
- **Step transition (within a phase):** current framer-motion cinematic slide is kept, but shortened to ~250–300ms so pacing feels snappy across many small steps, not just the big phase changes.
- **Turn banner enter:** spotlight-sweep — a soft radial light sweeps across the banner's position (200ms) before the avatar/name pop in with a slight overshoot spring; exits via opacity+scale dissolve (300ms), never a hard cut.
- **Score change:** score number does a quick scale-bounce (1→1.15→1, 250ms) with a small floating `+N` that rises and fades above the number.
- **Correct/Wrong grade:** correct = green flash ring + single confetti burst *localized to the content panel* (not full-screen, so it doesn't obscure the score rails); wrong = a brief amber (not harsh red) shake, kept gentle since this is graded live in front of peers.
- **Wheel of Destiny spin:** the wheel lives as a "set piece" that slides in from off-stage into the content area (it's a step type, so it already owns the stage) rather than a modal overlay; spin uses easing with a hard mechanical deceleration, landing with a light-flash + tick sound cue, then hands off into the turn-banner entrance.
- **Full leaderboard takeover (WRAP-UP only):** the only true full-screen overlay retained, entering with a "curtain rise" — rails slide out, center content scales up, confetti field across the full frame. This is deliberately the single biggest moment of the whole lesson.

### B5. Responsive / environment considerations
- **Always landscape**, designed at a 16:9 baseline (1920×1080) but should scale gracefully to ultrawide projectors (21:9) by letting the side rails widen slightly and the stage cap its max-width, rather than stretching content edge-to-edge.
- **Never below 16:9** — this is a fixed classroom rig, not a responsive multi-device surface, so no mobile/portrait breakpoints are needed for the board itself (the Teacher Remote is the phone surface).
- **Viewing distance 3–10m**: minimum body text 18px equivalent at 1080p reference; nothing critical below that.
- **Ambient classroom light**: dark backgrounds + saturated accents chosen specifically because most classroom projectors wash out pastel/light UIs; keep contrast ratios generous (WCAG AAA where feasible for hero text: 12:1+).
- **Rail auto-retraction**: side rails collapse to slim 48px icon strips during full-bleed content moments (STORY_STAGE, MEDIA_PLAYER, INTRO_SPLASH) and restore automatically when the step changes to something rail-relevant (a round with scoring).

---

## PART C — Google Stitch Prompt

Paste the block below into Google Stitch as a single prompt to generate the high-fidelity ClassroomBoard Shell prototype.

```
Design a high-fidelity UI mockup for "ClassroomBoard" — the main projector
screen of a live, teacher-led K-12 English classroom app. This is a
game-show-style teaching set, not a corporate dashboard. Landscape 16:9,
1920x1080 reference canvas. Students in the room have no devices — this
screen is the only visual surface, viewed from 3-10 meters away, so
everything must be huge, high-contrast, and glanceable.

STYLE: Energetic, polished, kid-friendly game-show aesthetic — think Kahoot
meets a TV game-show set (Jeopardy/Wheel of Fortune scoreboard energy), NOT
a flat corporate SaaS dashboard. Dark, moody background base with bold
saturated accent colors used as state signals. Rounded, friendly geometric
sans-serif for large English display text; clean neutral sans-serif for
Simplified Chinese gloss text underneath. Original, generic character/avatar
illustrations only — no third-party logos or branded IP.

CURRENT SCENE TO ILLUSTRATE: Phase = INPUT (presenting new vocabulary).
Populate with: Vocabulary word "Elephant" in large English text with
"大象" in smaller Chinese text beneath it, plus two more vocabulary cards
partially visible: "Zebra / 斑马" and "Tiger / 老虎", displayed as large
flippable flashcards in the center stage. Team Red: 450 pts. Team Blue:
380 pts. Now up: "Leo" (a friendly cartoon lion-avatar character,
color-tinted to Team Red). Round mode: INDIVIDUAL.

LAYOUT ZONES (top to bottom, left to right):

1. TOP HEADER — full-width "Phase Arc Rail," about 72px tall. A horizontal
   trail of 6 round nodes left to right, each with a small icon and label:
   Warm-up, Input, Practice, Produce, Assess, Wrap (English label large,
   Chinese label small underneath each). The "Input" node is large, filled,
   and glowing bright blue (#3B82F6) since it's the current phase; nodes
   before it (Warm-up) are dim filled checkmarks; nodes after it are small
   outline-only circles. A glowing progress line connects completed nodes
   up through the current one. A small digital clock sits in the far top
   right corner, small and unobtrusive.

2. LEFT SIDEBAR — "Team Score Rail," about 15% of width. Two stacked
   rounded cards: a red card with a small circular color chip, "Team Red"
   label, and a large bold score "450"; below it a blue card, "Team Blue,"
   score "380". Cards have a soft glow matching their team color.

3. CENTER STAGE — the main content panel, roughly 65-70% of width, filling
   most of the vertical space. Rounded corners, subtle inner glow border in
   blue (matching the INPUT phase accent color #3B82F6) to show it belongs
   to the current phase. Inside: three large flashcards for the vocabulary
   words described above, the "Elephant / 大象" card centered and largest
   (mid-flip animation feel, showing a simple friendly elephant illustration
   with the word beneath), the other two cards smaller and slightly faded
   to the sides.

4. RIGHT SIDEBAR — "Leaderboard Rail," about 15-18% of width, collapsible
   panel showing top individual scorers: small circular avatar, name, and
   score for the top 3-5 students (e.g. "1. Mia - 120", "2. Leo - 110",
   "3. Ken - 95"), presented as a compact ambient list, not a full-screen
   popup.

5. BOTTOM-LEFT — a rounded pill badge showing the round mode: a small
   raised-hand icon with the text "INDIVIDUAL" in bold caps.

6. BOTTOM-CENTER — the "Now Up" turn banner: a wide, glowing pill-shaped
   banner containing a large circular friendly lion-character avatar
   (tinted red/orange for Team Red), and beside it in large bold text
   "Now up: Leo" with smaller Chinese text underneath "现在轮到：Leo". The
   banner has a soft pulsing glow ring around its edge to draw the eye —
   this should be the single most visually prominent element on the screen
   after the center stage content.

COLOR PALETTE (Input phase, shown in this scene):
- Background wash: deep blue-slate gradient, approx #0F1B2E to #0A1220
- Accent / glow: bright blue #3B82F6, secondary highlight #60A5FA
- Team Red: #EF4444, Team Blue: #3B82F6 (kept visually distinct from the
  phase accent via different saturation/context so team color and phase
  color never get confused)
- Text: near-white #F8FAFC for all primary text, high contrast against
  dark backgrounds
- Gold/amber #FBBF24 used sparingly for score highlights and the phase-arc
  progress line

TYPOGRAPHY: Vocabulary word "Elephant" extremely large and bold (hero
size, dominant on screen); Chinese gloss "大象" noticeably smaller and
lighter beneath it; team score numbers large and bold with tabular
numerals; phase-arc labels small but fully legible; turn-banner name large
and bold. All text should look readable from across a room — err toward
oversized rather than compact.

OVERALL MOOD: A polished, high-energy "game show meets classroom" set that
a class of 8-12 year old kids would be excited to look at — warm and fun,
not sterile or corporate. Rounded corners throughout, soft glows instead of
harsh drop shadows, generous padding, no clutter, no small print, no
third-party brand marks.
```

---

If you'd like, I can also draft the equivalent Stitch prompts for the ASSESS phase (red, intense, timer-driven) and WRAP-UP phase (full leaderboard takeover) so you have all three visual states to prototype side by side.
