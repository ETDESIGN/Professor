# Class Rally (co-op) — v3 Quality Audit (`CLASS_RALLY`)

> **Status:** **implemented** — Rebuilt from Stitch designs `1-rally.html` and `2-milestone.html`. Hero rally bar with flame glyph, image-only cards on IMAGE_SELECT, choral sub-mode, and owner celebration. Tests passing.
> **Screenshots:** `screenshots/24-class-rally-idle.png`.

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — a teacher-facing ESL/EFL tool for **live, in-classroom** English instruction to children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options).

**Classroom model (hard constraint — never propose student-device interaction).** A live class runs on three browser tabs converging via Supabase Realtime; students have **no devices**:

| Tab | Route | Who | Role |
|---|---|---|---|
| **Commander** | `/teacher/live` | Teacher, desktop | Control room: lesson roadmap, roster chips, the per-game buttons, sidebar (wheel/teams/analytics) |
| **Remote Baton** | `/remote` | Teacher, phone | Handheld remote: spin/pick, correct–wrong, next student |
| **Board** | `/board` | **Projected 16:9** — the only screen kids see | Renders the current game/slide |

The teacher performs **all input**. Kids answer orally, point, or come to the front.

**Live loop.** Pick a student (wheel) → play a turn → score → next. `quickWheelWinner = null` means choral/practice mode (no individual scoring).

**Unified scoring model.** `scoreForAttempt(mistakes, difficulty)`: difficulty 1/2/3 (receptive / constrained / free-production) → 1–3 base points; −1 live per mistake; streak bonus (+1 at streak 3, +2 at streak 5); cap 5, floor 1 on success. Every scored event triple-writes: `addPoints` (leaderboard) + `recordAttempt` (analytics) + `gradeObjective` (FSRS memory model).

**Lifecycle contract — the 4 must-dos every scored game obeys:**
1. Full reset on `currentTurnId` change (new picked student ⇒ fresh board).
2. `mistakesRef` + `awardedRef` latches (no double-payment, no cross-turn leakage).
3. Score via `addPoints` + `scoreForAttempt` on the picked student.
4. Personalized message with the picked student's name.

**Turn dealing.** Deterministic per `(session, unit, shell, round, turnToken, resetCount)` — a new pick or reset re-deals; class-wide coverage tracked by a ledger so every objective gets its turn.

**Phases.** WARMUP / INPUT / OUTPUT / PRACTICE / ASSESS / WRAPUP — each game belongs to one phase envelope (allowed difficulty rungs + scoring posture).

**Design constraints for any redesign (applies to the Stitch prompt):**
- Board surface only, **16:9 projector**, viewed from 5–8 meters — large type, high contrast, punchy states.
- Kid-friendly but not infantile (ages 6–12 band).
- Must always be legible: the current challenge, the feedback state (correct/wrong/partial), the picked student's identity, and the score moment.
- Teacher-driven: every interaction must have a remote-control path; nothing can require a student device.

---

## §0 Identity

- **Flow type:** `CLASS_RALLY`
- **Component:** `apps/board/templates/BoardClassRally.tsx`
- **Phase:** PRACTICE
- **Remote-control group:** custom — CHORAL_ROUND ("ALL ANSWER") / SKIP_ITEM ("Next") / MARK_CORRECT ("Correct") / RESET_GAME ("Reset Rally") / SLIDE_COMPLETE forced ("End") (`apps/teacher/live/panels/ContextualControls.tsx:241-250`)
- **Data sources:** `useBoardPool` mixed MCQ types — MEANING_MATCH / IMAGE_SELECT / SPELL_CLOZE / LISTEN_SELECT / ERROR_SPOT / STORY_COMPREHENSION — class-weak first, roster-scoped, limit 24 (`:79-85`)
- **Mode:** cooperative class (shared rally bar) with the picked student answering; choral sub-mode via ALL ANSWER

## §1 How the game works today

**The whole class works together toward one goal: fill the rally bar with 12 correct answers.** The bar never drops — wrong answers cost the individual responder a point but never undo class progress. A picked student answers one mixed question at a time; every correct (or teacher-override, or strong choral) answer fills the bar +1.

**Rally bar + milestones.** A horizontal bar (`TARGET_CORRECT = 12`, `:45`) with milestone nodes at 25/50/75/100% that flip from ☆ to ★ as progress passes them (`:384-394`). Crossing a milestone fires a ≤900ms full-screen celebration overlay ("25% milestone!" / "RALLY COMPLETE!") + confetti (`:173-184`) — deliberately compressed dead-time.

**Question phase.** One white card: the prompt (sentence/prompt/sentence_with_blank/prompt_text fallback chain, `:103`) + optional "Listen" audio button + a 2-column options grid. IMAGE_SELECT items render image cards; every other type renders text rows. A tap on the correct option → `resolveCorrect`: `scoreForAttempt(mistakes, difficulty)` points to the picked student (`addPoints` + `logAttempt`), the responder's personal streak tally bumps (cue + confetti at 3 and 5 — no scoring multiplier, "the bar is collective"), the bar fills, a ≤900ms feedback beat plays, then the next question — or victory at 12. A wrong tap → wrong cue, streak reset, live −1 `MISTAKE_PENALTY` + `logAttempt(incorrect)`, bar unchanged; a second miss triggers reveal-on-wrong: the correct option takes an amber ring + explanation card, then advance after a 2.2s teaching hold. **Correct** (MARK_CORRECT) scores the open question as a clean correct through the same path (mistakes preserved).

**Choral sub-mode (ALL ANSWER).** CHORAL_ROUND (remote button or the flow) swaps the question card for a big "📣 EVERYONE! — The whole class answers together!" stage: the prompt + a readable, non-interactive options preview, and two large board buttons — "✓ CLASS NAILED IT" / "✗ NEEDS PRACTICE" (the remote's Correct/Skip double as the same marks during choral, `:150-156`). A strong mark plays the correct option, fills the bar, and writes a roster-wide `recordChoralReview('strong')` (the FSRS signal for every student — same as LiveClassWarmup); a weak mark reveals the answer + explanation, changes nothing, and moves on. No individual points flow in choral mode.

**Victory.** At 12 corrects: a trophy "RALLY COMPLETE!" screen, win cue, confetti, and a natural `SLIDE_COMPLETE` broadcast (the commander ignores natural completions — the teacher decides when to move on). **End** (forced) jumps to the victory screen directly.

**Turn & controls lifecycle.** A new wheel pick resets only the per-question attempt refs (`mistakesRef`, `awardedRef`, selection, phase) — the bar, milestone state, and personal streak tallies persist across picks within the slide, because they are *class* progress (`:117-125`). **Next** (SKIP_ITEM) advances the question (or marks a weak choral during choral). **Reset Rally** (RESET_GAME) wipes everything: bar to 0, streaks cleared, question 0 (`:131-142`). Questions wrap via `questionIdx % questions.length` (`:113`) when the pool runs out before the goal.

**Empty/loading states:** "Loading rally questions…" while the pool fetches; "No rally questions ready for this unit yet. Run the exercise generator…" when the pool yields none.

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> This game is quite all right, but a big issue is we see a word and we need to pick up the proper vocabulary card — but on each card they also have the word written. So it's too simple: it's writing "rock" and I know the card with "rock" written on it is the right one. So we need to remove those vocabulary names on the cards — otherwise it's too easy.

**Clarified with the owner (2026-09-09):**
- Option cards show the IMAGE ONLY — no word labels on the cards.
- Audio-on-tap is acceptable as a controlled (hint-level) interaction.

## §3 ZCode code-level findings

Severity: P1 blocks learning · P2 degrades · P3 polish. Line refs are `apps/board/templates/BoardClassRally.tsx` unless noted.

- **F1 · P1 — Image option cards carry the word label, making IMAGE_SELECT items a reading-match, not recall.** The image-card branch renders the picture *plus* the label text under it: `{option.label && <span className="text-sm text-gray-700">{option.label}</span>}` (`:550`; card scaffold `:543-551`). The generator stamps IMAGE_SELECT options as `{image_url, label: word}` with the correct option's label being the prompt's own word (`supabase/functions/generate-exercises/index.ts:131-132`) — so the prompt says "rock" and the card with "rock" written on it is the answer. §2 verbatim. The label also leaks into the choral options preview (`:486-493`). The fix seam is one render line (`:550`) — keep `alt={option.label}` for accessibility, drop the visible text; note §2's acceptable replacement interaction (audio-on-tap) is *not* currently wired — option buttons are silent; only the prompt has a Listen button.
- **F2 · P2 — Option images are `object-cover`-cropped inside square pods.** Image cards are `aspect-square` with `object-cover` (`:530`, `:548`), and the choral preview uses fixed `w-14 h-14 object-cover` (`:488`) — square-cropping the typically landscape vocab art. Same crop family the owner just flagged on Story Quest (20-story-quest F1) and at odds with the 2026-09-10 landscape-card design rule.
- **F3 · P2 — Mixed-type stream can render a question with no visible prompt.** The prompt is whatever the content-field fallback chain yields (`:103`); an audio-led type (e.g. LISTEN_SELECT) whose text fields are empty would show only a bare "Listen" button above the options — no question text on screen. Needs per-unit content verification, but the component has no empty-prompt guard.
- **F4 · P3 — Scoring drift from the unified model: no streak argument.** `resolveCorrect` calls `scoreForAttempt(mistakesRef.current, difficulty, 1.0)` without the streak (`:192`), so the streak bonus (+1/+2 at 3/5) never applies in rally — the code comment frames this as deliberate ("the bar is collective"), and personal streaks still fire cues/confetti, but the payout curve differs from every other scored game.
- **F5 · P3 — Award-count wheel rotation churns the responder.** Every correct answer is a positive `addPoints` to the current responder, so with the sidebar wheel's EVERY_1 mode (`store/SessionContext.tsx:1565-1581`) a new student is auto-picked after *every* correct — mid-feedback-hold the turn refs reset and the phase snaps back to 'question'. The bar persists (correct for a co-op game), but the responder carousel is fast; same seam as 25-fast-vocab F1.
- **F6 · P3 — No path to victory short of 12 corrects.** The goal is fixed (`:45`); a struggling class grinds repetitions (the pool wraps, `:113`) and the teacher's only exits are **End** (forced-complete, `:164-167`) or **Reset Rally** (wipes all progress). No time-box, no adjust-target control.
- **F7 · P3 — Turn context disappears outside the question phase.** The in-game picked-student footer renders only when `phase === 'question'` (`:625`); during choral/feedback the game surface drops the whose-turn cue (the BoardShell footer banner still shows it — also duplicating it during question phase).
- **F8 · P3 — Chrome/palette.** Light fuchsia-on-white palette vs the shell's dark PRACTICE wash; the 240px leaderboard rail stays up during the co-op game (`BoardShell.tsx:41,112` — CLASS_RALLY not in FULL_BLEED_TYPES), which for a class-goal game is arguably the right chrome but costs the question card ~240px of width on 16:9.

**What already works well (context — don't re-litigate):** the cooperative bar that never punishes (individual penalty only), milestone nodes with compressed ≤900ms celebrations, reveal-on-wrong with the explanation teaching beat, the choral tier with roster-wide `recordChoralReview` FSRS writes and remote Correct/Skip dual-marking, per-question attempt-ref hygiene with the bar correctly persisting across picks, string/object option normalization (no "[object Object]" rows), and dead-button avoidance throughout.

## §4 ⬜ ChatGPT Co-Work quality audit

### 4.a UI & visual design
- **Faint, low-energy rally progress bar (screenshot `24-class-rally-idle.png`):** The collective rally bar is the central emotional hook of the game, yet it currently renders as an anemic, pale-lavender outline with hollow grey star icons (`:384-394`). From 5–8 meters back in a classroom, children cannot discern how full the bar is or feel the excitement of charging up a team goal. It needs to look like a high-voltage arcade power core or charging super-battery with glowing segments, vibrant milestone nodes, and kinetic particle fills.
- **Double-nested white card structure creates visual claustrophobia:** The UI mounts a white prompt card inside a larger rounded white shell container on top of the dark shell background. This double-boxed white-on-white composition washes out contrast and cramps the 2×2 options grid into the center third of the screen.
- **`object-cover` square crop destroys vocabulary illustrations (F2):** When rendering `IMAGE_SELECT` questions, images are forced into `aspect-square` with `object-cover` (`:530, :548`), severely clipping the edges of standard 16:9 or 4:3 vocabulary illustrations. The choral preview is even worse, forcing images into tiny `w-14 h-14` thumbnails (`:488`).
- **PRACTICE phase badge mismatch (screenshot):** The top-left tag in the idle screenshot shows an amber "WARM-UP" badge, even though §0 registers `CLASS_RALLY` as a PRACTICE flow type.
- **Leaderboard rail width cost (F8):** While retaining the right leaderboard rail makes sense for tracking individual contributions toward the team goal, the central question container should expand to utilize all available horizontal real estate, providing wide, easily tappable option plates.

### 4.b Workflow & user flow (teacher's path: start → turns → end)
- **Rapid student churn on EVERY_1 wheel mode (F5):** When the commander wheel is set to auto-spin every 1 point (`EVERY_1`), each correct answer instantly triggers a student switch. The 900ms celebration barely clears before a new name appears and the question updates, giving the teacher almost zero pause to praise the student or reinforce the answer.
- **Choral sub-mode ("ALL ANSWER") works well but needs clearer board cues:** Tapping `CHORAL_ROUND` swaps the interface into a whole-class shouting drill with large "✓ CLASS NAILED IT" / "✗ NEEDS PRACTICE" validation buttons (`:150-156`). However, the transition needs a dramatic audio-visual cue (e.g., siren/horn sound + neon banner) so the entire classroom immediately shifts from individual silence to choral unison.
- **Rigid 12-question target with no time-box or mercy adjustment (F6):** The game fixes `TARGET_CORRECT = 12` (`:45`). If a class is struggling or lesson time is running out (e.g., only 3 minutes left in the period), the teacher is forced to either grind through 12 questions (which wrap repeatedly around the pool, `:113`) or hit "End" (forced complete). The teacher needs a quick target selector (e.g., 6 / 9 / 12 questions) or a dynamic "Sprint Finish" button on the remote.
- **Turn context disappears during transitions (F7):** The picked student's name footer only renders when `phase === 'question'` (`:625`), disappearing during feedback and milestone bursts.

### 4.c Pedagogical practice (ESL ages 6–12)
- **The Core Pedagogical Flaw: Text labels on image options destroy conceptual recall (F1, §2):** When an `IMAGE_SELECT` item appears, the options render both the picture *and* the English word label directly underneath: `{option.label && <span>{option.label}</span>}` (`:550`). If the prompt asks for "rock", the student simply scans the four cards, spots the letters "r-o-c-k", and taps it without ever looking at the picture or recalling the semantic concept! This reduces an active vocabulary recall challenge to trivial letter-matching. The text labels on option cards must be completely removed.
- **Missing instructional prompt on audio-led questions (F3):** When the content fallback chain encounters audio-led questions (e.g., `LISTEN_SELECT`) where the text prompt is empty (`:103`), the screen displays a lone purple "Listen" button floating above four options with zero instructional context. Young learners are left confused about what they are supposed to do. A reliable default stem must always render: *"Listen and choose the matching card 🎧"*.
- **Cooperative framing diminishes classroom anxiety:** The non-punitive collective bar (wrong answers live-penalize the individual responder by −1 point but never decrease the team's rally meter) is pedagogically superb for 6–12 ESL classrooms in China, where fear of public failure can silence shy learners.

### 4.d Game interaction (mechanic, pacing, fairness, fun)
- **Option layout and legibility:** The 2×2 grid should be styled as large, tactile widescreen plates (~4:3 ratio) labeled with prominent badges (`A`, `B`, `C`, `D`). In a live classroom, kids at the back desks frequently shout "B!" or "Letter C!" when pointing is impossible.
- **Milestone celebrations:** Crossing 25%, 50%, 75%, and 100% triggers a ≤900ms overlay with confetti. These milestones should feel like escalating power boosts (e.g., "⚡ 25% Power Surge!", "🔥 50% Halfway Turbo!", "🚀 75% Supercharge!", "🏆 RALLY COMPLETE!").
- **Streak transparency (F4):** The game tracks personal streaks and fires confetti at streaks of 3 and 5, but deliberately omits the unified streak point bonus (`streak` parameter omitted in `scoreForAttempt`, `:192`). The rationale ("the bar is collective") is sound, but this should be visually celebrated with a team badge (e.g., "Alice is ON FIRE! +1 Team Energy").

### 4.e Top-5 prioritized recommendations
1. **P1 — Strip Visible Word Labels from Image Option Cards (F1, §2):** Remove `{option.label}` text from option cards in `BoardClassRally.tsx:550` and the choral preview (`:486-493`), keeping `alt` text for accessibility. Require students to connect the prompt word to the image concept.
2. **P2 — Overhaul the Rally Bar into a Glowing High-Voltage Energy Core (4.a, 4.d):** Replace the faint lavender line with a chunky, neon-segmented battery/energy meter with pulsing milestone stars, vibrant fill animations, and unmistakable 5–8m visibility.
3. **P2 — Add Robust Default Prompts for Audio-Led Questions (F3):** Guard against blank prompt headers on `LISTEN_SELECT` items by enforcing fallback copy: *"Listen and choose the matching card 🎧"*.
4. **P2 — Adopt Landscape-Ratio Option Plates to Prevent Image Cropping (F2, 4.a):** Switch option cards from `aspect-square object-cover` to widescreen containers (`~4:3` or `16:9` with `object-contain`/balanced cover) with clear `A/B/C/D` index badges.
5. **P3 — Add Teacher Target Controls (6 / 9 / 12 Goal Selector) (F6):** Provide a quick remote/commander toggle allowing teachers to adjust rally length based on remaining classroom time.

### 4.f Design direction for Stitch
- **Mood and visual theme:** "Co-Op Arcade Power Rally" / "Cyber Team Booster". Deep electric indigo/navy background (`#0B132B`), neon cyan power conduit (`#00F0FF`), radiant emerald completion glow (`#10B981`), glowing amber milestone stars (`#F59E0B`), and frosted glass option plates.
- **Mock up these four screens/states (16:9 projector, no scrolling):**
  1. **Screen 1 — Active Question (Image Options without text):**
     - Top Stage: Glowing neon cyan/emerald Rally Power Bar showing `4 / 12` segments filled, with 3 pulsing star nodes ahead.
     - Header: Picked student turn indicator: *"Alice's Turn — Choose the right card!"*. Prompt word `"ROCK"` in massive display typography with a sleek audio speaker button.
     - Center Grid: 4 clean, border-lit widescreen image plates (Options A, B, C, D) displaying pure illustrations without any text labels.
     - Right rail: Compact co-op leaderboard.
  2. **Screen 2 — Milestone Burst Overlay (50% Halfway Boost):**
     - Full-screen translucent celebratory freeze: glowing lightning bolts, energetic confetti burst, and banner: *"⚡ 50% HALFWAY POWER SURGE! Keep going, Team!"*.
  3. **Screen 3 — Choral Sub-Mode ("ALL ANSWER"):**
     - Top Banner: Glowing golden megaphone banner: *"📣 WHOLE CLASS CHORAL ROUND!"*.
     - Center: Target challenge presented clearly to all students.
     - Bottom Controls: Two massive, unmistakable teacher touchplates: `[✓ CLASS NAILED IT (+1 Bar)]` (neon emerald) and `[✗ NEEDS PRACTICE]` (amber outline).
  4. **Screen 4 — Victory Screen (Rally Complete!):**
     - Grand celebratory stage: fully illuminated 12/12 golden power core, central trophy burst, class accuracy summary, and confetti shower.
- **What to KEEP from current design:** The cooperative non-punitive progress bar, 2-miss reveal with educational hold, dual-marking choral review (`recordChoralReview`), and seeded pool ordering.

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §5 note — wave-2 design pass SUBMITTED 2026-09-11 (ZCode → Stitch, autonomous)

Two key screens per game per the §4 brief (briefs in `prompts/wave2-stitch.json`, submitted into project 17415096891547227013; all 26 accepted by the API). Screens materialize asynchronously in Stitch's generation queue — ZCode verifies against the QA list, exports to `stitch/24-class-rally/`, then implements with the wave-2 logic fixes (already deployed `bfd78ab`).

## §6 Stitch output & implementation notes

Implemented from Stitch screens `1-rally.html` (Active Neon Arena Rally state) and `2-milestone.html` (Milestone Celebration & Rally Complete states) on 2026-09-12.

### Implementation Summary
1. **F1 (Owner Priority P1): Strip Visible Word Labels from Image Cards (§2):** When items are `IMAGE_SELECT` (option has `imageUrl`), cards render the image only with zero visible text labels, keeping `alt={option.label}` for accessibility. This forces active semantic recall instead of letter-matching. Also applied in choral options preview.
2. **Hero Collective Rally Bar (P2, §4.a):** Replaced faint lavender bar with a glowing cyan-to-pink gradient track (`bg-gradient-to-r from-[#00FFCC] via-[#00E6B8] to-[#FF2D78]`), pulsing flame glyph (`Flame`) riding the leading edge of progress, and interactive milestone star nodes at 25%, 50%, 75%, 100%.
3. **Flat Obsidian / Cyberpunk Surface (#070C18 / #141422):** Eliminated double-nested white card structures that caused contrast washout.
4. **Robust Audio-Led Prompts (F3, §4.c):** Enforced fallback copy `"Listen and choose the matching card 🎧"` on audio-led questions with no text prompt.
5. **Landscape Option Plates (F2, §4.d):** Options styled as tactile widescreen plates with prominent `A`, `B`, `C`, `D` index badges.
6. **Whole-Class Choral Round ("ALL ANSWER"):** High-energy megaphone banner (`📣 EVERYONE! — The whole class answers together!`) with dual teacher hotplates: `[✓ CLASS NAILED IT (+1 Bar)]` and `[✗ NEEDS PRACTICE]`, writing roster-wide `recordChoralReview('strong' | 'weak')`.
7. **Owner Celebration Animation:** Preserved owner's animated 🏆 trophy celebration (`scale: 0`, `rotate: -10` spring bounce) on rally completion and empty state.
8. **Lifecycle & Verification:** Preserves `RESET_GAME`, `SKIP_ITEM`, `MARK_CORRECT`, `CHORAL_ROUND`, `SLIDE_COMPLETE`. Verified with dedicated unit test suite `test/BoardClassRally.test.tsx` (5 tests passing) and 3-step gauntlet.
