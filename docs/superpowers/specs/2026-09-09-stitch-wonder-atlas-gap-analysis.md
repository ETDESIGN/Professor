# Stitch "Wonder Atlas" Student UI — Gap Analysis & Integration Recommendation

> Date: 2026-09-09 · Source: `/Users/ET/Documents/DEV/teacher app/stitch student app ui` (33 exported
> screens across 3 Stitch projects, each with `screen.png` + `code.html`).
> Method: text extraction of all 33 `code.html` files + vision analysis of the 7 most
> feature-dense screens (world map 17, shop 14, out-of-hearts 15, insights 19, battle 20,
> sprint 23, karaoke 28).
> ⚠️ **`screen_1_home_learn_tab/screen.png` is corrupt** (contains the literal text
> `<FIFE Image failed to fetch>`) — re-export it from Stitch. Its `code.html` is fine.
> ⚠️ Screens 6/7/8/10 (and 9/23) were rendered in a different export pass (1600×1280 vs
> 2560-wide retina) — verify style consistency during porting.

## 1. The direction: "Wonder Atlas"

Storybook-expedition identity — clearly distinct from the current Duo-Berry look AND from
Duolingo itself:

- **Palette:** warm cream paper background (~#FBF3E3 / #FDF6EA), terracotta orange primary
  (~#E85D3D / #E9603C), navy ink text (~#223A5E / #1F2A44), teal secondary (~#0FA3A3 /
  #10A5A0), soft mint / peach / amber accents, sky-blue buttons.
- **Shape language:** white "squircle" cards (24–28px radii) with soft shadows, chunky
  pill buttons, dashed trail paths, rounded pill badges ("pill-with-dot" motif).
- **Typography:** friendly rounded display font (Fredoka/Nunito feel) + clean body; generous
  sizes; bilingual EN + 中文 labels everywhere.
- **Illustration:** landscape header illustrations (savannah at golden hour, underwater
  reef), sticker-style characters, emoji as icons (matches our emoji-based iconography).
- **Structure:** consistent step pills ("Unit 3 • Stage 2 • Step 3 of 5"), hearts row,
  XP badges, mascot guides.

Token-first porting is feasible: it's palette + fonts + radii + shadows + illustration
treatment; layout structure is conventional.

## 2. Everything Stitch invented that we DON'T have today

Grouped by layer. "Ours today" refers to the student app inventory (5-tab nav, HomeMap
path, SoloLessonPlayer + ExerciseRunner, Practice Arena, quests/leaderboard/shop/avatar,
XP/gems/streak/hearts).

### A. Narrative / world layer

| # | Invention | What it is | Ours today |
|---|---|---|---|
| A1 | **World Atlas framing** | Units become themed *territories* on a world map ("Unit 1 Farm ✓ → Unit 2 Wild Savannah → Unit 3 Deep Ocean Odyssey"), with territory-intro splash ("New Territory · 8 Lessons · Explore the sunny grasslands!"), per-unit crown count, +250 Bonus XP for finishing | Winding path per unit + unit banner; no world/atlas framing, no territory intros |
| A2 | **Unit mascots** | Guide characters: Farmer Sam, Grace the Giraffe, Chester the Cheetah, Piper the Dolphin, Barnaby the Sea Turtle — narrate quizzes ("Piper's clue…"), voice stories, present vocab | Story speaker portraits only; no per-unit mascots |
| A3 | **Themed stage names** | Stages named for the theme ("1. Safari Lion 狮子 · 2. Tall Giraffe · 3. Zebra Stripes · 4. Waterhole Tale [STORY]") | Generic stage nodes |
| A4 | **Stage-unlock reveal moment** | Full "Stage 2 Unlocked! Follow Piper into the coral gardens" screen + "Lesson 1 Mastered · 1/8" recap card on the map | Node simply changes state |
| A5 | **Mascot-riddle questions** | Questions framed as character audio riddles ("Purr… chuff! Who is the fastest land animal?" + Chinese clue + phonetics) | Plain prompts |

### B. Gamification layer

| # | Invention | What it is | Ours today |
|---|---|---|---|
| B1 | **Badges & achievements** | Badge Vault (Quests tab) + Badges showcase (Profile) + unlock moments ("New Badge Unlocked: Ocean Pioneer"), locked states with dashed borders, badge-driven goals ("Flame Master") | None |
| B2 | **Streak weekly calendar** | M–S day cells with ✓, today's flame, "+1 Freeze" inventory chip | Streak count pill only |
| B3 | **Weekly Mystery Chest** | "2/3 Quests — complete all 3 daily quests to unlock the Gold Explorer Chest" (weekly tier above daily) | Daily-goal chest only |
| B4 | **League divisions** | "Crystal League · Division A · Top 10 advance to Master League 🚀 · Safe Zone · Leo: #4" + class ↔ Global scope toggle | Single flat weekly leaderboard ("Diamond League") |
| B5 | **Daily Gift** | Free daily claimable pack in Shop ("+15 gems or mystery sticker") | None |
| B6 | **Deal of the Week** | −25% gem-price discount on a shop item | None (all static prices) |
| B7 | **Unit-exclusive & earned cosmetics** | "Safari Explorer Hat · Unit 2 Exclusive"; "Farm Pioneer Overalls — EARNED from Unit 1"; "Classroom Champion Crown — reach Top 3" (locked) | Shop items all gem-priced; unlock columns exist but unused this way |
| B8 | **New power-ups** | 2× XP Elixir (15-min consumable), Slow-Mo Mic (unlocks 0.75× audio), Streak Freeze with inventory cap ("MAX 2 · Own 1"), Heart Refill with "MAX 5/5" state | Streak Freeze + Heart Refill only |
| B9 | **Combo / speed scoring** | Combo ×3 badges, 1.5× multipliers, "+100 pts if answered <5s", sprint targets | Flat XP per correct |
| B10 | **Class Pool (class-collective reward)** | "Miss Diaz's Pizza Party Pool — 76% — 22 students collaborating — 380/500 Class Stars — Donate 40 gems → +5 class stars"; stars also earned in battles; unit certificate shows "5 Stars → Class Pool" | None in student app (BoardClassRally is projector-side only) |

### C. Games / learning mechanics

| # | Invention | What it is | Ours today |
|---|---|---|---|
| C1 | **Multiplayer Word Battle** | Race duel vs a classmate (even cross-class): 3 rounds, 9s/question, live position track, scores, combo badges, sticker reactions, forfeit; full victory ceremony (trophy, battle XP/gems, avg response time, "Words Mastered in Battle 3/3 Clean Sweep") | No student-device multiplayer at all |
| C2 | **Cheetah Speed Challenge** | Solo timed sprint: 5 Qs, 6s each, combo multiplier, sprint target 400 pts, +50 Sprint XP | Fast Vocab (timed, no combos/multiplier framing) |
| C3 | **Karaoke "Sing & tap words" + pitch score** | Live mic, "96% Pitch Perfect", tap-words-as-sung, Chinese lyric line, focus word, star fills | Passive lyric display over YouTube |
| C4 | **Voice Lab (pronunciation upgrade)** | Per-syllable scores ("Syllable 1 /laɪ/: ✓96%"), syllable breakdown ("2 syllables: dol-phin"), match-target 80%+, "AUDIO SPECTRUM DETECTED" framing | Whole-utterance similarity % + transcript |
| C5 | **Slow-audio everywhere** | 0.75×–0.9× second listen buttons on vocab, stories, quizzes, karaoke | Single-speed audio |
| C6 | **Chinese hint chips in quizzes** | Optional L1 scaffold ("中文提示：哪种海洋生物会发出咔哒咔哒的声呐回音？"), Chinese chars highlighted inside options (长颈**鹿**) | L1 on vocab card backs only |

### D. Economy / recovery / meta

| # | Invention | What it is | Ours today |
|---|---|---|---|
| D1 | **Heart-recovery loop** | "Next free heart in 14:28" timed regen + growth-mindset copy ("Mistakes help our brain grow!") + hearts framed as "mistake shields"; "1 quick drill = +1 heart" (Practice Arena, no penalties) + gem refill (20) + quit link | Heart Refill power-up only; no regen, no drill-to-refill |
| D2 | **Unit graduation certificate** | "Official Certificate of Achievement — Wonder Atlas #0824 — Leo Martinez, Grade 3-B — Savannah Safari Master" with trophy ceremony + totals | Lesson complete screen only |
| D3 | **Lesson-complete recap** | "Words Mastered Today (5) · 100% Retained" checklist + streak banner + Review Words / Continue dual buttons | Stars/XP/accuracy/gems only |
| D4 | **Profile upgrades** | XP-to-next-level bar (320/500), Words-learned stat (24), school line, title chip | Level chip + 3 stat tiles |
| D5 | **Parent/Teacher insights (inside student app)** | Weekly goal %, practice minutes ▲+18% wk, words +14, pronunciation 92% (3-star avg), weekly rhythm chart | Separate parent app (weaker than this) |
| D6 | **Login/homework touches** | Language selector, "Password / Secret Code" kid wording, safety footer; homework card shows "🎧 3 Exercises · +25 XP" | Plain |

## 3. Recommendation (tiers)

### Tier 1 — adopt WITH the UI port (cheap→moderate, high value, existing data)

| Feature | Cost | Notes |
|---|---|---|
| A1 World-atlas framing + territory intros + unit bonus XP | Frontend rework of HomeMap + `units` metadata (theme/tagline/mascot name) + banner art via seedream pipeline | The single biggest identity win; our unit covers already exist per-unit |
| A2 Mascots | Art generation (flat sticker style — proven pipeline) + metadata | Can phase: theme/naming first, mascots second; reuse story speaker portraits initially |
| C5 Slow-audio buttons | Tiny | TTS `playbackRate` or cached re-request; big win for weak listeners. Make FREE (ignore Stitch's "Slow-Mo Mic" paywall) |
| C6 Chinese hint chips | Tiny | L1 already on pool items; render as toggleable hint |
| B2 Streak calendar + freeze chip | Small | Streak data exists |
| D4 Profile XP bar + Words stat | Small | XP_LEVELS + pool counts exist |
| D3 Lesson-complete word recap + Review button | Small | Session data exists |
| D1 Heart-recovery loop | Moderate | Drill-to-earn-heart (route to Practice + award), gem refill (exists), encouraging copy; timed regen optional (client timer) |
| A4 Stage-unlock reveal | Small | Overlay on map return |
| D2 Graduation certificate | Moderate | Printable screen (print-CSS precedent: passport cards); pure frontend |

### Tier 2 — real value, bounded backend work — phase 2, AFTER port stabilizes

| Feature | Cost | Notes |
|---|---|---|
| B1 Badges | Migration (badges table + award rules + vault UI) | Natural extension of quests infra |
| B5 Daily gift | Small backend (daily claim ledger) + economy rules | **Owner decision — economy tuning** (we fixed economy drift recently; be deliberate) |
| B3 Weekly chest tiers | Small backend | Same ledger pattern |
| B7 Unit-exclusive / earned cosmetics | Catalog work | `shop_items` already has slot/rarity/compat/unlock columns (avatar v2) — mostly rows + rules + art |
| B8 2× XP elixir | Session multiplier logic | **Owner decision — economy** |
| B9 Combo/speed scoring | Frontend scoring layer | Apply to Fast Vocab/Speed games |
| C2 Cheetah Sprint mode | Moderate | Fast Vocab engine retheme + combo/timer layer |
| B4 League divisions | Moderate | Decide kid-stress level first |
| B10 Class Pool / class stars | Backend (class star ledger, donation RPC, teacher visibility) + teacher control panel | **Owner decision** — lovely teacher tie-in (pizza party), but needs teacher-side UI |

### Tier 3 — ambitious; owner decision; later

| Feature | Why deferred |
|---|---|
| C1 Multiplayer Word Battle | Start **async ghost-race** (record run: answers+timing per question set; race a classmate's replayed ghost) — no realtime infra, safe, same-class matchmaking. The Stitch layout supports it (the ghost interpretation is visually identical). Live duels only if ghost works. **Owner decision** |
| C3 Karaoke pitch/tap | Songs are YouTube embeds without word timings; pitch detection is a project. Defer entirely |
| C4 Per-syllable scoring | `evaluate-pronunciation` exists but syllable alignment is a stretch. Adopt the Voice Lab *UI* (target %, slow listen, spectrum framing) with whole-utterance scoring now; syllables later |
| D5 Insights dashboard | Belongs in the **parent app**, not the student app — feed this design there later |

## 4. Coverage gaps in the exports (request from Stitch later, same direction)

Not rendered: **Avatar Studio, Settings, Help Center, Spelling step (on-screen keyboard),
Sentence building (word tiles), SRS review, Reading comprehension, Fast Vocab, Pronunciation
Coach** (superseded by Voice Lab), plus a good `screen_1` Home re-export (PNG corrupt).
Also decide: keep our 5-tab nav (Learn/Rank/Quests/Shop/Profile) — exports agree with it.

## 5. Proposed next step

1. Owner approves: **Wonder Atlas direction** + Tier 1 scope + which Tier 2/3 items go on
   the roadmap (minimum decisions: daily gift? 2× elixir? class pool? ghost battles?).
2. Ask Stitch for the missing screens (list in §4) in the same chat.
3. Writing-plans → implementation plan: token layer (cream/terracotta/navy/teal as CSS
   vars) → HomeMap/Atlas → lesson-player chrome + slow-audio + L1 hints → gamification
   screens → heart-recovery + certificate → remaining screens. Each feature lands on the
   token layer, no raw hex.

## 6. OWNER DECISION (2026-09-09)

- **Direction: Wonder Atlas — CONFIRMED.**
- **Tier 1: IMPLEMENT NOW**, together with the UI port. Split into three sub-plans
  (each ships working software):
  1. **Foundation & Atlas Home** — token layer (from the exact Stitch hex values), app
     shell, Join reskin (Login deferred to Plan 3 — it is the shared portal front door),
     HomeMap → Atlas territory cards, unit theme metadata migration.
     → `docs/superpowers/plans/2026-09-09-wonder-atlas-foundation.md`
  2. **Lesson Loop** — lesson chrome + exercise reskins, slow-audio, L1 hint chips,
     lesson-complete recap, heart-recovery loop, stage-unlock reveal, Practice Arena.
  3. **Gamification & Meta** — Quests + streak calendar, Leaderboard, Shop, Profile +
     XP bar + words stat, graduation certificate, Settings/Help.
- **Tier 2 + Tier 3: DOCUMENTED FOR LATER** — roadmap at
  `docs/superpowers/specs/2026-09-09-wonder-atlas-tier2-3-roadmap.md` (open owner
  decisions flagged there). No implementation now.
- Extracted **exact Stitch tokens** (frequency-weighted across all 33 `code.html`):
  teal `#2A9D8F`, ink `#264653`, cream `#EAE0D0`, terracotta `#E76F51`, teal-shadow
  `#1E6F5C`, sand `#E9C46A`, peach `#F4A261`, paper `#FDFBF7`, border `#E2D7C3`,
  muted `#8C7A68`, mist `#F7F3E8`; body font **Nunito**, display **Fredoka**;
  chunky 3D button shadows (`0 4px 0 <deep>`), soft card shadow
  (`0 4px 12px rgba(45,55,72,.05)`).
