# Wheel of Destiny Screen (Student Picker)
### Research → Redesign → Google Stitch Prompt

Seventh screen in the same shell (Prompt 01) — but structurally different from the previous six: this is a **transitional device**, not a step tied to one phase. It can appear inside any phase whenever the teacher needs to pick a student. Same display-only rule as the phase-agnostic shell elements: the spin is triggered from the Remote; the board only shows the result.

---

## PART A — Research: Prize Wheels, Anticipation, and Where the Ethical Line Sits

### A1. The physical prize-wheel genre — what makes it feel real
The Price Is Right's Big Wheel is the reference point the brief itself names, and its power comes entirely from *physicality*: a heavy object with real momentum, a mechanical flapper that audibly clicks against each peg as it passes, and a deceleration governed by actual friction — the audience isn't watching a UI, they're watching physics they intuitively understand slowing toward a stop. Digital classroom randomizers (Wheel of Names, ClassDojo's randomizer, Blooket's spinner) succeed to the exact extent they successfully *simulate* that physicality — perspective tilt, rim lighting, a bouncing pointer — rather than just rotating a flat CSS circle.

**Takeaway:** every element the brief lists (3D tilt, LED rim, bouncing ticker) isn't decorative flourish — each one is doing specific work to sell "this is a real, heavy object with momentum," which is the entire source of the wheel's excitement.

### A2. Near-miss psychology — where the line actually is, and why this app must stay on the right side of it
Slot-machine research is unambiguous that <cite index="30-1">near misses activate the same reward pathways in the brain as actual wins, leading to increased arousal and a desire to continue playing</cite>, and that this effect is deliberately engineered: <cite index="28-1">reels are weighted not just by the symbols themselves but by where they land, so near misses happen more often than chance would predict, creating the illusion that a win is just a spin away</cite>. Critically, industry-side analysis itself flags this as an active ethical boundary, not a neutral technique: <cite index="26-1">the goal should be to build products that are exciting without being misleading, combining strong game design with transparent rules and thoughtful UX choices</cite>, and one source is blunt about where manipulation actually lives: <cite index="34-1">the math ensures complete unpredictability — what's not random is the presentation: how often you see a near-miss, how wins are displayed, how lights flash at the perfect moment. The manipulation lives in the experience, not the math.</cite>

**This is a hard design boundary for a children's classroom product, not a style choice.** The Wheel of Destiny's outcome is fair and pre-determined (round-robin), and the deceleration must be an honest representation of the wheel physically slowing toward its real, already-decided stopping point — not an engineered fake-out where the wheel appears to slow near an *incorrect* name before "surprising" the room by continuing on to the real winner. That specific pattern is precisely the manipulated-near-miss mechanic the research above describes, and it has no place in a tool used with children, regardless of how much extra excitement it might generate. The wheel is allowed to be genuinely suspenseful (nobody in the room, including the teacher, needs to see the outcome coming early) — it is not allowed to manufacture false suspense by pretending to almost-land on the wrong answer.

### A3. Variable-ratio reinforcement — also off-limits here, for a different reason
Related but distinct from near-misses, slot design also leans on <cite index="32-1">unpredictable frequency and unpredictable magnitude of reward, since predictable rewards are experienced as boring</cite> — i.e., the system deliberately withholds a knowable pattern to keep engagement compulsive. This doesn't apply to the Wheel of Destiny at all, and the design should make sure it doesn't accidentally start to: the underlying selection *should* be fully knowable and fair (round-robin, transparently shown via the fairness panel) even while the *animation* stays exciting. Predictability of the underlying system and excitement of the presentation are not in tension — that's the whole point of the "round-robin-with-spectacle" pattern the brief already names correctly.

### A4. Reveal design — zoom-from-source beats a disconnected modal
Broadcast and game-UI convention for revealing a result treats the reveal as **emerging from the mechanism that produced it** — a spun object's outcome zooms out of the object itself, a card flip's result appears on the card, rather than an unrelated pop-up appearing elsewhere on screen. This is exactly the fix the brief already diagnoses in the "current state" (the modal feels disconnected) — the winner's name/avatar needs to visually originate from the winning slice, not spawn independently over the wheel.

### A5. Transparency as its own trust-building UI pattern
Systems that make randomized-but-fair outcomes legible to their audience (e.g., a visible "queue" or "who's left" indicator) build trust precisely because the audience can verify fairness themselves rather than taking it on faith — this matters especially in a room of children who will absolutely notice, and complain, if the same three kids seem to get picked disproportionately. A persistent, glanceable fairness readout (checkmarks/dots) converts "trust me, it's fair" into "see for yourself."

### Synthesis — five rules for the redesign
1. **Sell physicality, not chance.** 3D depth, rim lights, and ticker bounce all exist to make the wheel feel like a real object with real momentum.
2. **Never fake a near-miss.** The deceleration is honest physics toward the real, already-determined outcome — suspense comes from not knowing yet, never from a manufactured false slow-down near a wrong name.
3. **Keep the underlying system boringly fair and the presentation excitingly alive.** These are separate layers and both matter.
4. **Reveal from the source.** The winner zooms out of the winning slice — no disconnected modal.
5. **Show your work.** The fairness panel is what lets the class trust the wheel is honest, not just fun.

---

## PART B — Redesign: Wheel of Destiny Screen

### B0. State sequence
```
IDLE (slow rotation, breathing LEDs, "Tap SPIN" prompt)
        │  (teacher triggers spin from Remote — outcome already determined server-side)
        ▼
SPIN — Phase 1: acceleration (~0.5s)
        ▼
SPIN — Phase 2: full speed / blur (~2s)
        ▼
SPIN — Phase 3: honest deceleration toward the real stopping point (~1.5s,
        final ~0.5s crawls past the last 2-3 slices at visibly slowing speed)
        ▼
LANDING — winning slice glows + scales, confetti bursts, name/avatar zoom
        FROM the slice to center-stage, "Your Turn!" badge stamps on
        ▼
HOLD (~2-3s) → fade → fairness panel briefly updates → exercise begins
```

### B1. The wheel (hero element)
- **3D presence:** a slight perspective tilt (as if viewed from just above and in front, not a flat top-down circle) with a soft drop shadow beneath it and subtle rim lighting along its edge — the wheel should read as an object sitting on the stage, not a flat graphic.
- **Slices:** one per active student, alternating from a vibrant, high-saturation palette (distinct from any phase-accent color, since the wheel is phase-agnostic per B5) — each slice carries the student's name plus a small emoji avatar, text oriented to follow the slice's angle so it's readable as the wheel rotates and settles.
- **LED rim:** small light dots ringing the wheel's circumference, chasing in sequence during the spin (faster during Phase 2, visibly slowing in sync with Phase 3) and gently "breathing" (slow pulse) during idle — this is the carnival-wheel signal that sells physicality per A1.
- **Center hub:** a simple decorative center — a star or the app's generic mascot glyph — with a soft glow, anchoring the wheel visually without introducing any branded IP.

### B2. The ticker/pointer
A stylized flapper fixed at the top (12 o'clock) of the wheel, rendered with enough dimensionality to look like a small physical tab. It bounces (a quick downward flex + spring-back) each time a slice boundary passes beneath it — fast, tiny bounces during full-speed spin, growing visibly larger and slower as Phase 3's deceleration proceeds, matching the "ticker gets bigger/louder as it slows" cue the brief calls for. This is the single element doing the most work to make the spin feel mechanically real rather than purely animated.

### B3. Spin phases
- **Phase 1 (acceleration, ~0.5s):** wheel ramps from idle to full rotational speed; LED chase accelerates in step; ticker bounces begin fast and light.
- **Phase 2 (full speed, ~2s):** names blur into color streaks; LED rim reads as a continuous chasing ring rather than individual dots; ticker bounces blur into a near-continuous flutter. This is the "the class sees colors flashing, can't track a name" beat.
- **Phase 3 (honest deceleration, ~1.5s):** speed drops smoothly (no artificial stutter or fake slow-near-miss per A2) toward the wheel's real, predetermined stopping point. In the final ~0.5s, the wheel visibly crawls past its last 2-3 slices at clearly readable speed — this is naturally where the room's anticipation peaks and kids start calling out names, because they can finally read what's approaching, not because the design tricked them into thinking the wrong name was about to win.

### B4. Landing / reveal
- The winning slice **glows** — a radial light burst originating from that slice specifically (not a generic full-wheel flash).
- The slice **scales up slightly**, popping forward off the wheel's plane.
- **Confetti** bursts from the wheel's center, colored to match the winning slice.
- The winner's **name + avatar animate outward from the winning slice itself** toward center-stage, scaling up into the hero-sized reveal ("🎉 LEO! 🦁") — per A4, this must visibly *originate* from the wheel, not appear as a separate overlay.
- A **"Your Turn!"** badge stamps on beneath the name (English + Chinese, "轮到你了！").
- **Hold (~2-3s)** on this state before fading into the next screen, giving the room a beat to react/cheer before the pace moves on.

### B5. Idle state
- The wheel rotates barely perceptibly (a "lazy Susan" idle, not fully static — it should read as alive/waiting, per the brief).
- LED rim "breathes" — a slow, gentle pulse rather than the fast chase used during an actual spin, visually distinguishing "waiting" from "spinning" at a glance.
- A prompt beneath or beside the wheel: "👆 Teacher: tap SPIN to pick a student! · 老师：点击"抽取"" — informational, matching the display-only convention (the actual tap happens on the Remote).

### B6. Fairness panel
A slim strip (bottom or side, depending on available space alongside the wheel's 60-70% footprint) showing the full roster with a checkmark (✓, had a turn this exercise) or an open dot (○, waiting) beside each name — plus a short summary line, "Round-robin: 3/8 had a turn this exercise." This panel is present in both idle and post-landing states (briefly emphasized/updated right after a landing, per B0), giving the class a constant, verifiable answer to "is this actually fair," per A5. It's a read-only display — the teacher can still manually override via the Remote, but nothing here is tappable on the board.

### B7. Visual identity — phase-agnostic
Because the wheel can appear inside any phase, it deliberately does **not** inherit a phase-accent color the way other screens do. Instead it uses a consistent, neutral-but-energetic identity of its own: a dark background (for maximum contrast against the vibrant slice colors) with warm gold accents on the ticker, rim highlights, and "Your Turn!" badge — evoking "carnival/game-show spectacle" as its own recognizable visual signature across the whole app, regardless of which phase it's momentarily interrupting.

### B8. Alternate pickers (style variants, same underlying action)
- **Quick-pick:** a fast slot-machine-style flash of names cycling rapidly before landing — shares the "honest deceleration toward the real outcome" rule from A2/B3, just compressed into ~1-1.5s total, for moments the teacher wants pace over spectacle.
- **Manual:** the teacher selects directly from the roster via the Remote; the board simply reflects the resulting "Now up" state (reusing the shell's existing whose-turn banner) with no wheel/spin visual at all.
Both variants write to the same underlying picked-student state and trigger the same landing/reveal treatment where applicable — they're presentation choices, not different selection logic.

### B9. Motion / animation language summary
- Idle: near-static, breathing LED pulse (slow, ~2-3s cycle).
- Spin: three-phase acceleration → blur → honest deceleration, ~4s total, ticker bounce scaling with speed throughout.
- Landing: slice glow-burst + scale-pop + center-originating name/avatar zoom + confetti, badge stamp-on, ~2-3s hold before fade.
- Quick-pick variant: same phase structure compressed to ~1-1.5s, smaller-scale celebration on landing (appropriate to its "utility, not spectacle" role).

---

## PART C — Google Stitch Prompt

Same display-only convention as the shell: the spin is teacher-triggered from a separate Remote; the board only displays the wheel's state. Nothing on this screen is tappable by students.

```
Design a high-fidelity UI mockup for the "Wheel of Destiny" — a student-
picker spectacle screen rendering inside a classroom projector display
(ClassroomBoard), usable during any phase of an English lesson for
Chinese-speaking K-12 students. Landscape 16:9, 1920x1080 reference
canvas, viewed from 5-10 meters away. Show THREE separate views/frames
within the same design: (1) Idle state, (2) Mid-spin, (3) Landing reveal —
laid out as three distinct screens/panels.

CRITICAL — DISPLAY-ONLY: this is a passive projector surface. The spin is
triggered by the teacher from a separate remote device — there is no
visible "SPIN" button on this screen itself, no clickable chrome anywhere.
The wheel's outcome is fair and pre-determined by a round-robin system;
the animation exists purely to make that fair outcome feel exciting, never
to fake suspense.

BACKGROUND (all views): a dark, neutral, high-contrast background (deep
near-black slate, approx #0A0A12) with warm gold accent lighting — this
screen has its own carnival/game-show visual identity independent of any
lesson-phase color, since it can appear during any phase.

VIEW 1 — IDLE STATE:
- A large circular prize wheel, occupying roughly 60-65% of the screen,
  rendered with a slight 3D perspective tilt (as if viewed from just above
  and in front) and a soft drop shadow beneath it, giving it real
  physical presence rather than looking like a flat circle.
- The wheel is divided into 8 colorful slices (alternating vibrant colors:
  coral, teal, gold, violet, green, blue, orange, pink), each showing a
  student's name and a small animal-emoji avatar: Leo 🦁, Mia 🦊, Ben 🐻,
  Jenny 🦋, Sam 🐧, Ada 🦉, Tom 🐯, Zoe 🦓.
- Small LED-style light dots ring the wheel's outer edge, rendered with a
  soft golden glow (breathing/pulsing effect, not a fast chase, since this
  is the idle state).
- A stylized pointer/flapper sits fixed at the top (12 o'clock) of the
  wheel, styled with slight dimensionality (like a small physical tab),
  resting still.
- A decorative center hub on the wheel featuring a simple glowing star
  icon.
- Beneath or beside the wheel, a prompt: "👆 Teacher: tap SPIN to pick a
  student! · 老师：点击"抽取"" in friendly rounded text.
- A slim fairness panel (bottom strip) listing all 8 student names with
  small checkmark icons beside 3 of them (Leo, Mia, Ben — already had a
  turn) and small open-dot icons beside the other 5 (Jenny, Sam, Ada, Tom,
  Zoe — waiting), plus a summary line: "Round-robin: 3/8 had a turn this
  exercise."

VIEW 2 — MID-SPIN:
- The same wheel, now rendered with strong motion blur suggesting fast
  rotation — the slice colors streak together into blurred bands of color
  rather than showing distinct readable names, conveying high speed.
- The LED rim lights show a bright chasing/streaking trail effect around
  the circumference (rather than individual breathing dots), reinforcing
  the sense of fast motion.
- The pointer/flapper is rendered mid-bounce, flexed downward as if just
  struck by a passing slice edge.
- The fairness panel remains visible at the bottom but is visually
  secondary during this high-energy moment.

VIEW 3 — LANDING REVEAL:
- The wheel has stopped, tilted at rest. One slice — the "Leo 🦁" slice —
  glows brightly with a radial burst of golden light emanating from it,
  and appears slightly popped/scaled forward off the wheel's surface.
- Confetti particles in that slice's color burst outward from the wheel's
  center across the stage.
- A large, dramatic reveal is shown mid-animation: Leo's name and lion
  avatar rendered huge at center-stage, visually connected by a motion
  trail/glow back to the winning slice (suggesting the reveal is
  "emerging from" the wheel, not a separate popup) — text reads "🎉 LEO!
  🦁" in massive bold rounded font.
- Beneath the name, a stamped badge reads "Your Turn! · 轮到你了！" in a
  bold, celebratory style.
- The fairness panel at the bottom now shows Leo's dot updated to a
  checkmark (4/8 had a turn).

TYPOGRAPHY: student names on the wheel large enough to read at a glance
even before the final deceleration; the landing reveal's name is the
single largest text element across all three views; fairness panel text
small but clearly legible.

STYLE: carnival/prize-wheel spectacle — warm gold accents, vibrant
saturated slice colors, soft glows and light trails rather than harsh
flat shading, a genuine sense of a real spinning object with weight and
momentum. Playful and exciting without resembling gambling/casino
branding — this is a classroom tool for children, not a betting game, so
avoid any dollar signs, chips, cards, or jackpot-style imagery; keep the
visual language closer to a carnival fair-game wheel or a TV game-show
prize wheel. No third-party logos, no branded IP, no button/tab/menu
chrome anywhere.
```

---

If useful, I can also draft a Stitch prompt for the compressed Quick-pick slot-style variant, or the Manual-pick "Now up" banner state that skips the wheel entirely.
