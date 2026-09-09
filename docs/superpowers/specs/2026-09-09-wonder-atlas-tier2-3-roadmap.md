# Wonder Atlas — Tier 2 & Tier 3 Roadmap (deferred features)

> Date: 2026-09-09 · Owner decision: implement **Tier 1 only** now (see
> `2026-09-09-stitch-wonder-atlas-gap-analysis.md` §6). This document captures the
> deferred Stitch-invented features so nothing is lost, with prerequisites and the
> open owner decisions to settle before each is scheduled.
> These come from the Stitch "Wonder Atlas" exports in
> `/Users/ET/Documents/DEV/teacher app/stitch student app ui` (reference screens noted).

## Tier 2 — real value, bounded backend work

### B1. Badges & achievements system
- **What:** badge catalog + award rules + Badge Vault section (Quests tab, screen_13) +
  Badges showcase (Profile, screen_9) + unlock moments on lesson complete
  ("New Badge Unlocked: Ocean Pioneer", screen_29). Locked = dashed-border slot.
- **Cost:** migration (`badges`, `student_badges`), award-rule engine (hook into XP /
  streak / mastery / unit-complete events), 2 UI sections, unlock toast/overlay.
- **Prereqs:** Tier 1 Plan 3 (Quests/Profile reskins land the sections' shells).
- **Owner decisions:** badge list + art (emoji is fine to start); which events award.

### B5. Shop Daily Gift
- **What:** free daily claimable "Mystery Daily Pack" (+15 gems or sticker), screen_14.
- **Cost:** daily claim ledger (one row/student/day, idempotent RPC), shop UI card.
- **Owner decisions:** ⚠️ **economy** — reward size vs. existing gem faucet (economy was
  deliberately re-tuned 2026-08-28; do not casually add a second gem faucet).

### B3. Weekly chest tiers
- **What:** "Weekly Mystery Chest — 2/3 quests → Gold Explorer Chest" above the daily
  chest (screen_13).
- **Cost:** weekly quest-completion ledger + chest tier logic; UI.
- **Owner decisions:** reward cadence vs. daily chest (keep ONE to avoid chest fatigue?).

### B7. Unit-exclusive & achievement-gated cosmetics
- **What:** "Safari Explorer Hat · Unit 2 Exclusive", "Farm Pioneer Overalls — EARNED
  from Unit 1", "Classroom Champion Crown — reach Top 3" (screen_14).
- **Cost:** catalog rules — `shop_items` already has slot/rarity/compat/unlock columns
  (avatar v2, migration `20260907000001`); needs unlock-condition evaluator + shop card
  states (owned-by-progress, locked-with-requirement) + item art.
- **Prereqs:** Tier 1 unit theme metadata; art via seedream pipeline.
- **Owner decisions:** how many items per unit; which achievements gate what.

### B8. New power-ups (2× XP Elixir; Streak Freeze inventory cap)
- **What:** 15-minute 2× XP consumable; freeze inventory "MAX 2 · Own 1" (screen_14).
- **Cost:** consumable inventory + session multiplier plumbing through
  `GamificationService.awardXP`; freeze cap enforcement.
- **Owner decisions:** ⚠️ **economy** — elixir price/duration; whether caps are needed.

### B9. Combo / speed scoring
- **What:** Combo ×3 badges, 1.5× multipliers, "+100 pts if answered < 5s" (screens 20/23).
- **Cost:** frontend scoring layer in the speed games; XP award stays flat underneath
  (combo affects in-game points/stars, not the XP ledger) — keeps economy safe.
- **Owner decisions:** does combo XP leak into real XP or stay cosmetic+stars?

### C2. Cheetah Sprint practice mode
- **What:** solo timed sprint (5 Qs, 6s each, combo multiplier, sprint target) — screen_23.
- **Cost:** Fast Vocab engine retheme + timer/combo layer; new Practice Arena tile.
- **Prereqs:** B9.

### B4. League divisions
- **What:** "Crystal League · Division A · Top 10 advance to Master League · Safe Zone"
  + class ↔ Global scope toggle (screen_12).
- **Cost:** league assignment + promotion/relegation job (weekly), leaderboard UI.
- **Owner decisions:** kid-stress level (promotion AND demotion, or promotion-only?).

### B10. Class Pool (class-collective reward)
- **What:** "Miss Diaz's Pizza Party Pool — 76% — 380/500 Class Stars — Donate 40 gems →
  +5 class stars" (screen_14); stars earned in lessons/battles; certificate tie-in.
- **Cost:** class star ledger + donation RPC + progress broadcast; **teacher-side control**
  (create pool, set reward, end + celebrate) in the teacher app.
- **Owner decisions:** teacher controls; donation exchange rate; anti-abuse.

## Tier 3 — ambitious; owner decision required before scheduling

### C1. Multiplayer Word Battle — START AS GHOST-RACE
- **What:** race duel vs a classmate (screens 20/21): 3 rounds, 9s/question, live
  positions, combos, sticker reactions, victory ceremony.
- **Recommended path:** **async ghost-race** — record each run (answers + per-question
  timing) on a shared question set; race a replayed ghost avatar. No realtime infra, no
  presence, no matchmaking complexity; same-class opponent pool; visually identical to
  the Stitch design. Live duels only if ghost-race proves the loop.
- **Cost:** runs table + ghost replay engine + battle UI + opponent picker; safety:
  same-class only, no free chat (Stitch already uses sticker-only reactions — keep that).
- **Owner decisions:** timing; same-class-only vs school-wide; XP/gem rewards for losing.

### C3. Karaoke pitch / sing-and-tap
- **What:** "96% Pitch Perfect", tap-words-as-sung, live mic (screens 10/28).
- **Why deferred:** songs are YouTube embeds — no word-level timing data exists; pitch
  detection is its own project. Would require switching songs to TTS-aligned audio or
  LRC-timed tracks first. Keep the current lyric display + focus-word pattern.

### C4. Per-syllable pronunciation scoring
- **What:** "Syllable 1 /laɪ/: ✓96%", syllable breakdowns, 80%+ match target (screen_18).
- **Why deferred:** `evaluate-pronunciation` edge function returns whole-utterance
  scores; syllable alignment is unreliable with browser speech transcripts. Adopt the
  **Voice Lab UI** (target %, slow listen) with whole-utterance scoring in Tier 1 Plan 2;
  revisit syllables only with a dedicated scoring model.

### D5. Parent/Teacher insights dashboard
- **What:** weekly goal %, practice minutes ▲, words learned, pronunciation 3-star avg,
  weekly rhythm chart (screen_19).
- **Where it belongs:** the **parent app**, not the student app. Feed this exact design
  into the parent portal's own redesign when scheduled. Metrics need activity logging
  (practice minutes per day) that we don't currently store — add an events/rollup table
  then.

## Standing notes for whoever picks these up

- All new gem-touching features must re-read the economy notes in AGENTS.md §9 (the
  2026-08-28 economy RPC atomicity work) before touching `GamificationService`.
- All UI lands on the Wonder Atlas token layer (`apps/student/atlas/tokens.ts` after
  Tier 1 Plan 1) — no raw hex, no `duo-*` in student screens.
- Reference screens cited above live in `stitch student app ui/…` (each with code.html).
