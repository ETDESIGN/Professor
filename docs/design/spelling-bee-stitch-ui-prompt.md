# Spelling Bee — Google Stitch UI-upgrade prompt pack

Internal doc (2026-08-18). Two copy-paste prompts for Google Stitch
(stitch.withgoogle.com):

1. **Phase 1 prompt** — Stitch brainstorms 3–4 distinct visual directions and
   designs the core play screen (board + phone) in each.
2. **Phase 2 prompt** — after you pick a direction, paste this to get the
   remaining screens + a mini design system in that direction.

**Stitch workflow tips**
- Stitch works best one screen (or one direction) per generation round —
  expect to iterate; use "remix"/variants to explore within a direction.
- Keep one Stitch project per direction so styles don't bleed together.
- Export the screens (and copy the generated CSS/spec panel) — bring both
  back to the coding agent along with the chosen direction's name.

---

## PHASE 1 PROMPT (copy everything in the fence)

```text
You are designing a UI upgrade for "Spelling Bee", a game inside an English-teaching
app for young Chinese ESL learners (ages 6–12). Design for kids, but with craft an
adult designer would respect.

PRODUCT CONTEXT
The app has two very different surfaces:
• CLASSROOM BOARD — the teacher's projector screen, 16:9 landscape, dark room,
  viewed from 5+ meters away by a whole class. One child plays at a time in front
  of the class while the teacher referees.
• STUDENT SOLO — the child's own phone, portrait, held in two hands, thumbs typing.

THE GAME (learn the loop before designing)
An illustrated word card appears and the word is spoken aloud ("truck"). The child
spells it letter-by-letter on an on-screen QWERTY keyboard:
• A per-word countdown clock (circular ring, ~15s) is always visible.
• Correct letter → fills a slot in the answer bar (t r _ _ _), cursor advances.
• Wrong letter → gentle shake + buzzer, the clock loses 1 second, AND the wrong
  keys on the keyboard start dropping away ("adaptive scaffolding": struggle more
  → keyboard narrows → only the needed letters remain). This elimination is the
  game's signature mechanic — the UI should make keys visibly and delightfully
  fall away.
• Word complete → green check on the card, the word is pronounced, points awarded
  (more points for time left), streak flames build up.
• After the child's turn (3 words): a big celebratory score screen
  "{Name} nailed it!" with 5 stars filling in sequence.
• On the phone the child plays solo: 3 rounds × 5 words, a "Well Done!" round
  interstitial between rounds, and a final results screen (stars, score, XP).
  If the clock hits zero on the phone, the run ends with a "Time's Up!" screen.

SCREENS TO DESIGN IN THIS PHASE (the two play screens, per direction)
• B1 — BOARD PLAY SCREEN (16:9 landscape, projector):
    HUD (turn score, streak flame meter, round progress, circular countdown),
    the word illustration card, the letter-slot answer bar, and a 3-row uppercase
    QWERTY keyboard with BIG keys. Show three keyboard states in variants:
    full keyboard / mid-game with several keys already dropped away / hint state
    where the next needed key pulses.
• S2 — PHONE PLAY SCREEN (portrait, compact):
    same game elements scaled for a child's thumbs, plus a small back button and
    score chip. Keyboard keys at least 44px touch targets.

CURRENT DESIGN (reference only — upgrade it, don't copy it)
Duolingo-ish palette (green #58cc02, blue #1cb0f6, amber, red #ff4b4b),
dark slate-900 board with white rounded cards, light mobile screens, very rounded
corners, chunky buttons with hard bottom shadows. It is clean but generic — the
upgrade should give the game a memorable identity.

YOUR TASK — BRAINSTORM 3–4 DISTINCT VISUAL DIRECTIONS
For EACH direction deliver:
• a name + one-line concept
• a style tile: palette (hex), typography feel, shape language, texture/depth
• how it expresses the signature mechanics: the countdown ring, keys dropping
  off the keyboard, the streak, the star rewards, the celebration screen
• render B1 and S2 in that direction

Seed ideas you may use, improve, or replace (surprise me with the 4th):
1. "HONEYCOMB HIVE" — own the bee identity: hexagonal honeycomb keys, honey/amber
   on warm dark, a small bee mascot that cheers on correct letters and gasps on
   mistakes, honey-drip progress, hive-shaped word card.
2. "RETRO ARCADE" — neon-on-dark coin-op arcade: glow, marquee score display,
   pixel-adjacent display type, ticket/prize metaphors for rewards.
3. "CRAFT CLASSROOM" — warm paper collage and hand-drawn doodles: notebook paper,
   sticker stars, crayon textures, washi-tape word card, gentle and homemade.

HARD REQUIREMENTS FOR EVERY DIRECTION
• Board screens readable from the back of the classroom: huge word card and
  gigantic keyboard keys; hierarchy readable at a glance.
• Kid-friendly and encouraging — mistakes feel gentle and funny, never harsh
  punishment. Countdown visible but not anxiety-inducing for a 7-year-old.
• Every direction must cover BOTH the dark projector variant (board) and a light
  variant (phone) of the same identity.
• Clear letterforms (avoid confusion between similar glyphs), strong contrast,
  never color alone to carry meaning.
• Uppercase letters on keys; lowercase or uppercase in the answer slots is your
  call — justify it.
```

---

## PHASE 2 PROMPT (paste after you pick one direction)

```text
Continue the "Spelling Bee" project. I chose this direction: [DIRECTION NAME].
Keep every style decision from the Phase-1 screens you already made ([B1, S2])
exactly — palette, type, shapes, mascot, motion personality.

Now produce the REMAINING screens in this direction:

• B2 — BOARD TURN-COMPLETE OVERLAY (16:9): full-screen celebration over a dimmed
  game. "{Name} nailed it!" headline, 5 stars filling in sequence, and three
  stat blocks: points this turn, best streak, words spelled x/y. A subtle hint
  that the teacher taps "Next Student" on their remote to continue.

• S1 — PHONE UNIT PICKER (portrait): friendly title "Spell the words", a list of
  units (each with unit name, topic, and personal-best stars + score), and THREE
  settings toggle cards: "Countdown timer" (on/off), "Slow mode" (more time per
  word), "Remove letters" (keys drop away as you play vs full keyboard = harder).

• S3 — PHONE ROUND INTERSTITIAL (portrait): "Well Done!" headline, a row of 5
  circular per-word badges (the points earned, or a soft ✗ for missed words)
  with the tiny word under each, a rolling count-up total score, and a big
  "Round 2/3 →" button.

• S4 — PHONE RESULTS (portrait): two variants —
  (a) "Well Done!": 5 stars popping in, final score count-up, best streak /
      accuracy / "+N XP" stat row, personal-best trophy line, Play again + Done.
  (b) "Time's Up!": same layout, calmer end-of-run mood, the word they were
      spelling revealed, encouraging copy ("so close!"), same buttons.

ALSO DELIVER a mini design system section:
• final palette with hex codes (board-dark + phone-light)
• type scale (display/headline/body/label, with sizes)
• spacing grid, corner radii, shadow/border style
• component states: keyboard key (default / pressed / wrong / dropped-away /
  hint-pulse), answer slot (empty / cursor / filled / solved / revealed),
  word card (idle / solved / listen-only fallback with a speaker icon),
  primary button (default / pressed)
• motion notes: what the key-drop animation, star fill, and count-up should
  feel like (timing + easing personality)
```

---

## Handoff back to the coding agent

When a direction is chosen and Stitch has produced the screens, bring back:
1. The chosen direction name + exported screen images (B1, B2, S1–S4).
2. The mini design system (palette hex, type scale, radii, component states).
3. Any mascot/asset notes (e.g. the bee mascot states).

Implementation will map to: `components/games/spellingBee/SpellingBeeStage.tsx`
(play surface, both compact/board variants), `BoardSpellingBee.tsx` (HUD +
overlay), `SpellingBeeGame.tsx` (solo screens) — Tailwind + framer-motion,
reusing `FastVocabHud` or replacing it with the direction's HUD.
