# Kids-ESL song channel analysis + seed catalog v0

Date: 2026-09-05 · Companion to `docs/superpowers/specs/2026-09-04-youtube-media-resolution-design.md` (§4 catalog rung) · Data: `scripts/media/catalog-seed.json` (189 oEmbed-verified entries, 33 topics, 17 channels)

---

## 1. Method — why these numbers are trustworthy

- Every entry was **resolved via live YouTube search** (developer-run `scripts/media/harvest-catalog.mjs`, same as a person browsing) and **validated via the keyless oEmbed endpoint** (title, author, thumbnail; 404 drops). No video ID was taken from model memory — LLM-recalled YouTube IDs are routinely hallucinated.
- Every entry passed: known-good channel + song duration 45s–8min + human title review (pruned non-English variants, auto-generated "- Topic" channels, off-brand picks; corrected mis-filed topics).
- Per-entry fields match the design §4.3 contract: `videoId, url, title, channel, channelId, thumbnailUrl, durationSec, topics[], ageBands[], language, source`.

## 2. Channel analysis (ranked by ESL teaching value)

### Tier 1 — ESL-native (made for language learners; auto-apply allowlist core)

| Channel (entries) | Channel ID | Why |
|---|---|---|
| **Super Simple Songs** (87) | `UCLsooMJoIpl_7ux2jvdPB-Q` | The ESL gold standard: slow, clear enunciation, minimal lyrics, one language point per song; covers virtually every primary textbook topic. Family channels: **Noodle & Pals** (19, `UCUamVL0L_lgG720vqmdZqoA`) and **Super Simple Play with Caitie!** (6, `UCxG6Tbopv4XcHfem65bgFeg`) share the same pedagogy. |
| **Dream English Kids** (27) | `UC6LKuH7RPkvRmzS9-8URtqA` | Matt (ESL teacher) — a song for *every* textbook unit shape (rooms, toys, months, clothes…); fast to deploy in class; lyrics aimed at L2 learners. |
| **The Singing Walrus** (16) | `UCe1VpF4wS_kdcjyTRSXBcnQ` | Made by ESL teachers; call-and-response structure is ideal for classroom warm-ups; strong on calendar (days/months), colors, counting, feelings. |
| **STEVE AND MAGGIE / WOW ENGLISH** (5+2+1) | `UCx1xhxQyzR4TT6PmXO0khbQ`, `UCEjCyBoWP57QRkmFRz-aOGw`, `UCeO9uWOK2w-c2h3zzBDCqmQ` (Sing Along) | Story-driven skits+songs; extremely popular with Chinese young learners (relevant to our user base); energetic, great for 6-10 attention spans. Clips run longer (3-7 min). |
| **Maple Leaf Learning** (8) | `UCdHK6g8ddMEcMu9B3LgeKYg` | Japan-based ESL; best-in-class for prepositions ("Where Is It?" series), clothes, weather chants. |
| **ELF Kids Videos** (3) | `UCJJmDk_lxosfvRFiwgOn6xw` | Japan-based ESL drills-as-songs; classroom chants. |
| **English Singsing** (2) | `UCGwA4GjY4nGMIYvaJiA0EGA` | Korean ESL animation; clean pattern-practice songs (can you swim…). |

### Tier 2 — teacher/classroom staple (safe, education-first)

| Channel (entries) | Channel ID | Why |
|---|---|---|
| **Jack Hartmann** (3) | `UCVcQH8A634mauPrGbWs7QlQ` | US K-2 institution (months/time); teacher-trusted. |
| **Sesame Street** (1) | `UCoookXUzPciGrEZEXmh4Jjg` | Classic, celebrity versions, universally age-safe. |

### Tier 3 — kids-entertainment (clean audio/visuals; use for famous nursery staples)

**Pinkfong / Baby Shark** (4, `UCcdwLMPsaU2ezNSJU1nFoBQ`), **Cocomelon** (3, `UCbCmjCuTUZos6Inko4u57UQ`), **Bounce Patrol** (1, `UC56cowXhoqRWHeqfJfSJkIQaA`), **Pancake Manor** (1, `UCDBQdJsUA9i8Had_jXCP0bg`). High energy, native-speaker pace, less ESL-graded — good as alternates, toddler band especially.

### Dropped during review (do not allowlist)

- **Super Simple 日本語 / Português** — localized variants (English twins exist in catalog).
- **"- Topic" auto-generated channels** — not artist-owned; provenance/rename risk.
- **Pokémon Kids TV** and similar off-brand covers — inconsistent ESL quality.

## 3. Topic coverage (33 topics, 189 entries)

Strong (≥6 entries): actions 12 · colors 9 · numbers 10 · christmas 9 · food 8 · feelings 8 · greetings 8 · body 7 · weather 7 · daily_routine 7 · abc 7 · clothes 6 · school 6 · days 6 · seasons 6 · halloween 6 · animals_sea 6 · animals_zoo 5 · shapes 5 · fruit 5 · time 5 …

Thin but present (1–4): house 6* · prepositions 4 · can 7* · family 4 · transport 4 · toys 5* · manners 4 · months 4 · cleanup 4 · goodbye 4 · animals_farm 7* · birthday 2 · there_is 0* (dropped the false match; see gaps)

*after supplemental wave. Full counts in `catalog-seed.json → stats.perChannel` / per-topic rollup.

## 4. Gaps → next curation wave (when the flywheel's miss-reports point at them)

- `there_is` (there is/there are songs — the textbook grammar point has weak song coverage on these channels; likely resolve via teacher flywheel or the AI rung).
- Pronouns, present-continuous, question words, "this/that/these/those" — same situation.
- More **Steve & Maggie / Wow English** (only 8 entries — the channel is huge; curate per-topic).
- Non-song **videos** catalog (owner: "maybe do the same for video after that" — same pipeline, `type:'video'`, longer duration cap).

## 5. Operating notes

- **Refresh**: channel RSS (`youtube.com/feeds/videos.xml?channel_id=…`) is keyless and ToS-benign — the future maintenance mode of the harvest script.
- **The harvest script is a curation tool, not product infrastructure** — nothing deployed scrapes; the seed script only re-verifies via oEmbed at seed time.
- **Age bands** in v0 are coarse (toddler/early_primary) because the song universe itself skews young; refine when `classes.grade_level` wiring lands and real classes inform the mapping.
