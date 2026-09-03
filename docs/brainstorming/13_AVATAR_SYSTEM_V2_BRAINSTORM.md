# 13. Avatar System v2 — Brainstorm & External Consultation

**Date:** 2026-09-03
**Status:** Brainstorm phase — awaiting owner's Claude/ChatGPT consultation responses (prompt in §4)
**Supersedes:** `12_avatar_system_technical.md` (root) — its "Vector Paper Doll" direction survives in revised form, but its AI pipeline (Nano Banana = Google) **violates the region-safe AI rule** and its PNG→SVG vectorization step is a known quality dead-end (see §5.2).

---

## 1. Owner calibration decisions (2026-09-03)

| Question | Decision |
|---|---|
| Animation | **Subtle motion at launch** (idle breathing/blink, celebration bounce); choreographed "dances"/emotes are Phase 2 |
| One-time art budget | **≤ $100 — AI-batch generation + in-house curation only** (no commissioned art, no custom 3D assets) |
| Runtime AI | **Curated catalog only** — students never trigger AI generation; no per-generation gem sink |
| Primary age range | **Wide: 6–15** (style must scale cute→cool; child-safety rules apply across the range) |

Additional standing constraints (from AGENTS.md + audit):
- Region-safe AI only, via OpenRouter (Seedream 4.5 / FLUX family; never OpenAI/Google/Anthropic; no LoRA/fine-tune hosting). Measured ≈ **$0.04/image** on the existing pipeline.
- Web PWA on low-end Android tablets + flaky school Wi-Fi; also rendered large on a 4K projected board.
- Students never pay real money (Stripe is teacher/school-side only).
- Team: one developer + AI agent.

---

## 2. Audit — what exists today (2026-09-03)

### 2.1 Avatar: three disconnected fragments

1. **AvatarBuilder prototype** — `apps/student/AvatarBuilder.tsx` (7 skin colors, 7 shirt colors, hats none/cap/beanie/crown/headset, 4 expressions; `shirtType` in state has no UI tab). Saves config as `JSON.stringify(config)` into **`profiles.avatar_url`** (`apps/student/StudentApp.tsx:188`) — a column every `<img>` consumer treats as a URL. Consequences: **broken images** on the student Leaderboard podium (`apps/student/Leaderboard.tsx:102–149`), teacher Reports/Dashboard, parent app after customization; raw JSON text in board legacy mode. The builder's inline SVG renderer is used **only** in its own preview — `apps/student/Profile.tsx:50–64` degrades the config to a skin-colored circle + fixed 😎 emoji.
2. **Classroom board gets nothing** — `services/DataService.ts` `getSessionRoster()` hardcodes `avatar: ''` (~line 161), so in roster-first live mode every board surface renders the `👤`/initial fallback: `apps/board/BoardShell.tsx:265,297`, `ClassLeaderboard.tsx:54`, `BoardGameArena`, `BoardTeamBattle:665`, `BoardWheelOfDestiny`, `BoardOverlayLayer:117,220`, `LiveCommander`, `SidebarPanel`, `StudentSelectorModal`, `QuickSpinModal`.
3. **Dead column** — `profiles.avatar_config JSONB` (migration `20260420000002_gamification_schema.sql:107–109`) has **zero references** in any .ts/.tsx (frontend or edge). `roster_students.avatar` (emoji, `20260715000005`) is writable via RPC but no UI ever sets it and the board never reads it. No avatar TS types exist (all `any`). No avatar assets in Storage; no e2e coverage.

### 2.2 Shop & economy: plumbing real, pipe ends capped

- **Works:** atomic `buy_shop_item(p_item_id)` RPC (migration `20260828000001_economy_rpc_atomicity.sql:194–221`), `shop_items` catalog table (5 seeded rows, incl. 3 cosmetics: Gold Crown 300 / Space Suit 150 / Cool Shades 120), `student_inventory (student_id, item_id, quantity, equipped DEFAULT FALSE)` with UNIQUE(student,item). Client: `services/GamificationService.ts:246–255`, hooks in `hooks/useQueries.ts`.
- **Broken/disconnected:** Shop UI (`apps/student/Shop.tsx:32–36,176–216`) hardcodes its own catalog copy (never queries `shop_items`), shows lucide icons not avatar previews, and buying only flips a session-local "Owned ✓" card. **`equipped` has zero code references** — there is no equip action and no render path, so purchased cosmetics change nothing anywhere.
- **Currencies (six!):** class points (`point_transactions` ledger, board games, 1–5/question post-rescale), home XP (`student_progress.xp`, level = xp/100), **gems** (the only spendable currency: quests 10, 5-star lessons 15), hearts (max 5, regen 1/4h), streak, `profiles.ai_credits_balance` (never touched by any code). XP and class points have **zero sinks**. `character_ledger` is NOT currency — it's a 0-row story-character table.
- **Earn-rate drift (devalues gems, fix in the same pass):** DubbingStudio awards raw 10/15 XP and SpacedRepetition 10–50 XP per session (pre-rescale values vs the 1–5 scale everywhere else); StudentApp awards +15 PERFECT_LESSON gems unconditionally while games gate it on 5 stars; 3 of 6 quest types can never progress; teacher sidebar +10/+50/+5 manual points predate the rescale.
- **Stripe:** fully disconnected from student value; no parent-buys-credits flow exists (and §5.5 recommends keeping it that way).

### 2.3 Reusable image pipeline (Illustration v2)

`supabase/functions/_shared/illustrationCore.ts` + `illustration.ts` + `generate-media`: OpenRouter `/images` with `bytedance-seed/seedream-4.5` default, `HOUSE_STYLE` + per-unit `art_direction` + `SURFACE_DIRECTIVES` prompt composition, **`input_references` image-to-image** (already used to keep story characters consistent across scenes), aspect-ratio control, SHA-256 prompt-hash dedupe with `(prompt_hash, type)` unique index, public `generated-media` bucket, `assets` table. Batch pattern: `scripts/testing/illustration-backfill.ts` (dry-run default, ~$0.04/img). Server-side **ImageScript** (decode/crop/encode JPEG) already runs on edge for book crops — the key precedent for server-side avatar compositing.

### 2.4 Social surfaces (why customization matters — the "lobby")

Projected board leaderboard rail + whose-turn pill (`BoardShell.tsx`), full-screen `ClassLeaderboard.tsx`, team chips, `BoardWheelOfDestiny` winner, point popups (`BoardOverlayLayer.tsx`), "{Name} nailed it!" banners (via `apps/board/templates/usePickedStudent.ts`), student Diamond League podium (`Leaderboard.tsx`, consumes `get_class_leaderboard` RPC → `class_roster_analytics_view.avatar_url = COALESCE(profiles.avatar_url, roster_students.avatar)`), teacher LiveCommander grid + StudentSelectorModal, parent dashboard/settings. Note `BoardWordSearch.tsx:1016` already renders `<img src={s.avatar}>` — evidence the board can consume URLs fine once we supply them.

---

## 3. What "premium" means here (design frame)

Students coming from PUBG/Fortnite/Roblox don't love *3D* — they love **rarity, status, collection, freshness, and being seen**. The app already owns the stage: the projected classroom is the "lobby" where a skin gets shown off. Therefore:

> A gorgeous, cohesive 2D skin system with 150+ items, rarity tiers and weekly drops beats a clunky 3D system with 6 outfits — at ~1/20th the cost and complexity — PROVIDED the avatar renders everywhere classmates look, instantly, on any device.

---

## 4. External consultation prompt (owner pastes into Claude + ChatGPT verbatim)

Deliberately neutral: it does not leak our recommendation, so responses stay independent and comparable. Analysis of responses happens against §5–§7 when the owner returns.

```text
AVATAR SYSTEM DESIGN CONSULT — ESL classroom app for kids 6–15

You are consulting as a combined senior game economist, character art director, and web
technical architect. Be opinionated and concrete; numbers over adjectives. If you think
one of our constraints is wrong, say so and explain what you'd change.

PRODUCT CONTEXT
- "Professor": a web-based English-teaching platform used in real classrooms. A teacher
  runs live, projected quiz/board games (wheel spins, team battles, leaderboards on a 4K
  projector). Students (ages ~6–15, wide range) use a student web app — an installable
  PWA that must run on low-end Android tablets and flaky school Wi-Fi. Parents have a
  separate, read-mostly app.
- Stack: React + TypeScript (Vite multi-entry), Tailwind, Supabase (Postgres, RLS, Edge
  Functions on Deno, Storage), deployed on Vercel. Team: effectively ONE developer plus
  an AI coding agent.
- Money: teachers/schools pay via Stripe. Students never pay real money — we want to
  keep it that way (children).
- In-app economy today (real, working plumbing): students earn "gems" (daily quests ~10,
  5-star lessons ~15) and spend them in a shop via an atomic buy_shop_item RPC. There is
  an item catalog table and an ownership table with an (unused) "equipped" column.
  Separate class-points and XP counters exist as leaderboard metrics only.
- Avatar today: a basic prototype builder (skin/shirt colors, 5 hats, 4 expressions)
  saves JSON into a column every other screen treats as an image URL — so customized
  avatars currently render as BROKEN IMAGES on the leaderboard and parent app, and the
  projected classroom surfaces show a generic 👤 fallback. No real art assets exist;
  placeholders come from the free DiceBear API.
- AI constraint (HARD): only image models reachable via OpenRouter with region-safe
  providers (e.g. ByteDance Seedream 4.5, FLUX family; NO OpenAI/Google/Anthropic; no
  fine-tuning or LoRA hosting). Measured cost ≈ $0.04 per image. We already have a
  working generation pipeline (house-style prompt tokens, image-to-image reference
  passing, hash dedupe, cloud storage) used daily for lesson illustrations.
- Budget: one-time art budget ≤ $100 total → AI batch generation + human curation.
  Commissioned art and custom 3D assets are OUT. Runtime per-student AI generation is
  OUT (cost predictability, child safety, offline PWA). Curated catalog only.
- Quality bar: our students play PUBG/Fortnite/Roblox. We cannot match AAA 3D, but the
  experience must feel premium, cohesive and "game-like" — not clipart.
- Animation: subtle motion at launch (idle breathing/blinking, celebration bounce).
  Purchasable "dances"/emotes are a desired LATER phase — the architecture must not
  dead-end before that.
- Where avatars are SEEN (why customization matters): projected classroom leaderboard,
  "whose turn" pill, "{Name} nailed it!" win banners, student league podium, teacher
  roster tools, parent app.

ANSWER ALL OF THESE, IN ORDER
1. Rendering paradigm — compare honestly for OUR constraints: (a) layered 2D
   "paperdoll" of raster PNG layers stacked in the browser; (b) hand-built SVG vector
   paperdoll; (c) true 3D (Ready Player Me / VRM / three.js); (d) static single
   AI-generated portrait per avatar config (no layers — regenerate whenever the config
   changes); (e) pixel art. Criteria: perceived quality to a 6–15-year-old gamer;
   visual consistency across hundreds of items; animation ceiling (incl. future dance
   emotes); performance on low-end tablets AND a 4K projector; one-time and runtime
   cost; engineering complexity for one React developer.
2. If layered 2D raster: how do we keep hundreds of AI-generated items perfectly aligned
   to one body template and style? (image-to-image from locked template renders? fixed
   canvas + prompt scaffolds? chroma-key background removal? expected curation rate —
   how many keepers per 10 generations?)
3. Compositing: client-side layer stacking vs server-side pre-composited PNG (rendered
   once per config, cached, served as a single URL) vs hybrid (server composite for
   boards/leaderboards/parent app, live layers only in the builder preview). Which gives
   the best quality/perf/integration trade-off, and how should 20+ existing display
   sites consume it?
4. Item & economy design for ages 6–15: slot taxonomy (how many slots?), rarity tiers,
   gem pricing vs our earn rates (~10 gems/quest, ~15 per 5-star lesson), prestige and
   quest-exclusive items, seasonal rotation, and whether class points should convert to
   gems. How to feel premium while staying earn-only, avoiding pay-to-win AND status
   shaming (free defaults must be genuinely good)? Flag any child-safety/regulatory
   traps (loot-box-adjacent mechanics to avoid).
5. Phase-2 dance emotes on a 2D budget: realistic techniques (frame sequences/APNG,
   sprite sheets, simple skeletal deformation à la Live2D, short video stickers)? What
   would we regret not deciding now?
6. Give a 3-phase roadmap (MVP that ALREADY feels premium → expansion → emotes/social),
   with rough engineering effort per phase for one developer.
7. Top 5 ways this fails (boredom, art-style drift, performance, scope creep, ...) with
   mitigations.
8. Named products to steal ideas from (Duolingo, Prodigy, Epic!, Bitmoji, Zepeto,
   Roblox, Fortnite, ...) — what EXACTLY to copy for a classroom context.

OUTPUT FORMAT
1. Recommendation (one decisive paragraph)
2. Paradigm comparison table
3. Proposed architecture (data model + render flow, brief)
4. Item/economy design summary
5. 3-phase roadmap with effort estimates
6. Top-5 risks + mitigations
7. "Things we haven't considered" (max 5 bullets)
```

---

## 5. My parallel analysis (to diff against external answers)

### 5.1 Recommendation (one line)

**Layered 2D raster "paperdoll" (sticker-skin system): AI-batched curated catalog → server-composited cached render per avatar config → single PNG URL consumed everywhere; gems economy connected via a new equip RPC; subtle CSS/SVG motion now; dance emotes deferred to Phase 2 with a pre-decided technique.**

### 5.2 Options considered / rejected

| Option | Verdict | Why |
|---|---|---|
| (a) Layered 2D **raster** paperdoll | **RECOMMENDED** | Only lane hitting all constraints: $0.04/img AI art, premium shading/lighting quality (raster = AI models' native output), trivial client rendering (stacked images), server compositing already feasible (ImageScript on edge), offline-friendly. |
| (b) SVG vector paperdoll (old doc 12) | Rejected as primary | AI cannot produce clean vectors; potrace-style vectorization flattens shading → "clipart ceiling" fails the quality bar. Hand-authoring vectors = commissioned-art costs, outside budget. SVG survives only as a *fallback tier* (tiny, crisp at 4K) if we ever hand-draw a base set. |
| (c) True 3D (RPM / VRM / three.js) | Rejected for v2 | Custom outfits cost $200–800 each (budget: total ≤$100); RPM style is semi-realistic (wrong for 6–15 ESL); adds a three.js/WebGL runtime to low-end tablets; one-dev maintenance burden; dances are the only strong argument and don't justify it alone. Revisit only if emotes become the core product. |
| (d) Static portrait per config (no layers) | Rejected | Regenerating per equip = runtime AI (banned), seconds of latency, no instant preview, cost scales with student behavior, consistency across regenerations not solvable today. |
| (e) Pixel art | Rejected | Cheap and consistent, but reads "retro indie," not premium, to the PUBG demographic; clashes with the app's existing soft picture-book illustration style. |
| Runtime open prompting for students | Rejected (owner decision + safety) | Unpredictable cost, child-safety/moderation burden, offline PWA broken, quality inconsistency. |

### 5.3 Architecture sketch

**Data model (reuses existing columns/tables):**
- `profiles.avatar_config JSONB` — the source of truth: `{ base: 'human_a', skin: 3, items: { head: 'wizard_galaxy', back: null, ... } }`. (Column already exists, unused.)
- `profiles.avatar_url` — repurposed to hold the **server-composited render URL** (never JSON again). All existing `<img>` consumers keep working unchanged.
- `shop_items` — extend with `slot`, `rarity`, `layer_asset_id`, `preview_url`, `rotation/live dates`. Stop hardcoding the catalog in `Shop.tsx`.
- `student_inventory` — finally use `equipped`; add RPC `equip_item(item_id)` = atomic: verify ownership → set equipped=true for that item's slot, false for siblings → trigger re-composite.
- New table `avatar_renders (profile_id, config_hash, url, created_at)` or reuse `assets` with a new kind — one cached composite per config hash.

**Render flow:**
1. Builder (student app) renders live layer stack client-side → instant preview, zero API calls.
2. On save/equip: edge function composites layers with ImageScript (already proven on edge for book crops) → uploads one PNG (e.g. 512px student-app + 1024px board variant) → updates `profiles.avatar_url` + render cache.
3. Every display site renders `<AvatarView student={...} size={...}/>` — one shared component. URL consumers (leaderboard RPC, parent app, Reports) keep `<img src>`; emoji-text sites on the board swap to `<AvatarView>`; `getSessionRoster()` stops hardcoding `avatar: ''` and joins the render URL.
4. PWA service worker precaches each student's own render (+ classmates' on the board entry).

**Art pipeline (offline, team-run — extends Illustration v2):**
- Lock 5–8 **canonical base renders** (e.g. human ×2, robot, alien, monster — covering cute→cool across 6–15) in a fixed 1:1 canvas, canonical pose.
- Every item generated via **image-to-image against the locked base template** (`input_references` — pipeline already supports it) with slot-specific prompt scaffolds + HOUSE_STYLE tokens.
- Transparency: prompt items on a flat chroma background → chroma-key removal server-side (ImageScript), or native transparency if a provider supports it (validate in bake-off).
- Human curation gate before anything enters `shop_items`; ~3–5 keepers per 10 generations expected.
- Bases get blink/idle/celebrate variants (3 poses/expressions per base) → free "alive" feel at launch.

**Animation (Phase 1, subtle):** CSS transforms on the composite/layer container (breathing scale, tiny sway), eye-blink by swapping the face layer (or a masked overlay on the composite), celebration = squash-and-stretch pop on "{Name} nailed it!" banners — all GPU-cheap, no new assets beyond the 2–3 base variants.

**Dance emotes (Phase 2, pre-decision needed):** leading candidates: (i) 8–12 frame sprite sequences per emote, composited per-frame per config (render cost only when equipped — feasible: ~$0.04 × frames, only for owned emotes), (ii) simple skeletal deformation (Live2D-lite mesh) — smoother but heavy engineering, (iii) short video stickers (APNG/WebP/video) — cheapest engineering, weakest "avatar wearing MY stuff" feel. **Open question flagged for external consult.**

### 5.4 Cost model

- Launch catalog: 5 bases × ~3 variants + ~120–150 items × (÷3–5 keeper rate ≈ 3.3 gen attempts avg) ≈ **400–500 generations ≈ $16–25**. Round-trip retries/culls → budget $40. Composites are free (ImageScript on our edge). Runtime cost: **$0** (curated catalog, cached renders).
- Headroom under the $100 cap covers a second seasonal drop + emote pilots in Phase 2.

### 5.5 Economy design (initial position)

- Slots: **head, eyes, body, back, held, background** (6). Base + skin always free — defaults must look genuinely good (anti-shaming, and unclaimed roster students get fun auto-assigned defaults so the board never shows 👤).
- Rarity & price: common 50 / rare 120 / epic 250 / legendary 500 gems → a legendary ≈ a week of solid play (quests ~10, 5-star lesson 15 → ~40–80 gems/day realistic).
- Freshness: weekly drop rotation (items go vaulted, not deleted — return later), quest-exclusive items (e.g. "complete 5 dubbing takes"), event items tied to curriculum seasons.
- **No loot boxes, no random purchases, no trading, no real-money cosmetics.** Children + regulators + classroom fairness. Earn-only makes gems (and therefore studying) matter more.
- Hygiene in the same pass: fix Dubbing/SRS legacy XP rates, unconditional PERFECT_LESSON gems, dead quest types, teacher sidebar +10/+50 point values.

### 5.6 Phased roadmap (initial)

- **Phase 0 — Hygiene & spine (small):** stop writing JSON into `avatar_url`; write `avatar_config`; `equip_item` RPC; shared `<AvatarView>`; board roster query carries the avatar; deterministic default avatars for roster students. Nothing new visually — the system becomes coherent.
- **Phase 1 — Premium MVP:** art pipeline bake-off (2–3 models on base+item fidelity/alignment), 5 bases, ~120 items across 6 slots with rarity, composited renders at 2 sizes, shop UI rebuilt on `shop_items` (previews, rarity styling, try-on preview, owned/equipped states), board + podium + parent integration, idle/celebrate motion, economy fixes.
- **Phase 2 — Freshness & emotes:** weekly rotation tooling (admin), quest/event exclusives, passport card art, achievements/badges (the unused `ACHIEVEMENT_UNLOCK` reward), dance emote pilot (technique per external consult + bake-off), possibly class-points→gems conversion (careful: inflation).

---

## 6. Open questions I explicitly want external input on

1. **Dance emote technique for 2D layered** (frames vs skeletal vs video stickers) and what to pre-decide in Phase 1 so we don't dead-end.
2. Any credible defense of a **3D path** under these exact constraints (budget/runtime/team) — if yes, what specifically.
3. **Slot taxonomy / rarity / pricing** — better math than §5.5, especially classroom-social dynamics (teacher control over item visibility? cap visible flex per class?).
4. **Alignment & consistency techniques** we haven't listed (e.g. generating full "outfit sheets" then splitting; ControlNet-like depth/pose guidance available via OpenRouter?).
5. **Compositing split**: is there a case for pure client-side layering even on the board (offline freshness) vs server-cached composites?

## 7. Next steps

1. ~~Owner pastes §4 prompt into Claude and ChatGPT~~ — done 2026-09-03 (ChatGPT full; Claude §1–3 only — economy/emotes/roadmap/risks sections not provided).
2. ~~Agent analyzes responses against §5–§6~~ — see §8.
3. Converged design → `docs/superpowers/specs/` design doc → implementation plan (Phase 0+1 first).

---

## 8. External consult verdicts (2026-09-03)

**Triple consensus — architecture LOCKED:** layered 2D raster paperdoll · locked master template + image-to-image generation · hybrid compositing (client layers in builder, server-composited cached render everywhere else) · **config = source of truth, rendered image = cache** · one `<Avatar/>` component for all surfaces · reject 3D / per-config AI portraits / pixel art · human curation gate · no loot boxes, no trading, no real money.

### ADOPTED (from ChatGPT unless noted)

| # | Decision | Source & note |
|---|---|---|
| A1 | **Launch catalog ≈ 52 items, not 120–150** — "40–60 excellent items beat 400 mediocre"; curation time is the bottleneck, not generation cost; weekly drops provide freshness | GPT; reverses §5.5/§5.6 (pending owner blessing) |
| A2 | **Pricing common 20 / rare 40 / epic 75 / legendary 120–180 gems** — "buy something small every 1–2 days, save 3–7 days for something special" | GPT; replaces my 50/120/250/500 (too grindy for a 10-year-old) |
| A3 | **~9 slots with ONE-PIECE "outfit" slot** (base+skin, hair, eyes, outfit, headwear, face accessory, handheld, back, background) — merged from GPT's 8–10 slots; deliberate deviation: top/bottom split dropped (AI-item alignment risk, and Fortnite sells whole silhouettes, not shirt+pants) | GPT modified by agent |
| A4 | **Quest/achievement-exclusive items 15–20% of catalog, zero gem price** — "I earned this" beats "I bought this" in an educational game | GPT |
| A5 | **Prestige titles + badges** (Word Wizard, Grammar Hero…) displayed with avatar; activates the dormant achievements concept + `ACHIEVEMENT_UNLOCK` reward | GPT |
| A6 | **Board identity cards**: name + title + avatar + level on projected surfaces ("game UI, not CRUD") | GPT (badge-card part lands with achievements, Phase 2) |
| A7 | **Master character gets 20–30% of art budget; coordinates sacred; never change template after production starts** | GPT |
| A8 | **Automatic pre-curation validation**: bounding box, transparency, canvas, palette, style-similarity check (vision model) → then human KEEP/REJECT | GPT (pipeline precedent: `imageQuality.ts` Laplacian gate) |
| A9 | **Avatar Style Bible** (master ref, palette, line weight, silhouette rules, reject examples) + silhouette-recognizable at 150px | GPT |
| A10 | **Season states ACTIVE / ARCHIVED / RETURNING** — no countdown FOMO | GPT |
| A11 | **`AvatarRenderVariant` ("idle" \| "celebrate" \| "wave" \| "dance_01") baked into render keys NOW, implemented later** — prevents "avatar = one immutable PNG" dead-end | GPT |
| A12 | **Emotes = pre-rendered sprite sheets (12–18fps, 18–27 frames), NOT Live2D**; JS-controlled playback; video stickers rejected as architecture | GPT (confirms §5.3 lean; base-body frames + item overlay as cost-containment trick to validate) |
| A13 | **Class points → gems: NO, permanently** — decouple academic performance from economic power from cosmetic status; indirect path only (participation → achievement → gem reward) | GPT; kills my tentative §5.6 idea — agreed |
| A14 | **Free = cool: 3–5 excellent starter combos; rarity = scarcity, NOT social value; "a free avatar can look as cool as a Legendary"** | GPT (sharpens §5.5 anti-shaming) |
| A15 | **Phase-1 scope-ban list**: trading, gifting, avatar chat, 3D, UGC cosmetics, marketplace, animation editor, multiplayer avatar interaction | GPT |
| A16 | **Classroom sync celebrations** ("TEAM BLUE WINS → 24 avatars celebrate simultaneously") — the differentiator neither Roblox nor Duolingo can copy; fits existing `classroom_action` broadcast | GPT; Phase 3 |
| A17 | **Multi-resolution renders (128/256/512, 768 board)** + deterministic URLs; WebP if ImageScript encodes it (validate; PNG fallback) | GPT |
| A18 | **Gender-free component system** — no boy/girl base binary; hair/clothes carry expression; simplifies art | GPT |
| A19 | **Age segmentation via item collections on the same body system** (6–9 animals/fantasy · 10–12 sports/gaming · 13–15 streetwear/tech/music) | GPT; Phase 2 merchandising |
| A20 | **Success criterion: "20 different avatars on the 4K leaderboard look like a real children's game, not an educational CRUD app"** | GPT |
| A21 | Static portrait-per-config rejected because it **breaks the item shop** (no independent purchasable items) | Claude (§2) |
| A22 | "You're not patching 20+ sites — you're making their existing `avatar_url` assumption true" | Claude (§3); independently confirms §5.3 |
| A23 | **Effort estimates (1 dev + AI agent)**: Phase 1 3–5 wks, Phase 2 3–5 wks, Phase 3 4–6 wks (art production parallel) | GPT + Claude (2–3 wks for compositor+pipeline alone) |

### REDUCED / MODIFIED

- **New `student_avatar_items` / `avatar_items` tables (GPT) → REUSE `shop_items` + `student_inventory`** (add slot/rarity/season/asset columns; the atomic purchase RPC already works). Parallel tables = migration debt for no gain.
- **GPT's top/bottom/shoes/special-effect slots → one-piece outfit slot v1** (A3); shoes + effect-aura = Phase 2 candidates.
- **Species bases (robot/alien/monster) → deferred pending owner call** — they were the owner's original "pay to change the avatar itself" idea; species need per-body item compatibility; options in §8.1.
- **Item recommendations / shop-discovery engine → later/never** at this catalog size.

### DISMISSED

- **Hosted LoRA fine-tuning (Claude §1 pushback)** — dismissed for v1: our delivery path is OpenRouter-only (no LoRA pass-through), one-person review overhead. **Revisit trigger:** measured keeper rate < 3/10 after prompt/i2i refinement AND curation becomes the schedule bottleneck. If triggered, owner re-checks region-safe providers offering hosted fine-tunes outside OpenRouter.
- **Wrong-answer avatar reactions "gentle sad face" (GPT §4/classroom-sync list)** — dismissed on classroom-psychology grounds: the board is PUBLIC; a sad avatar next to a child's name after a wrong answer is public shame. Celebrate-only + neutral.
- **Video stickers as emote architecture** (GPT itself half-rejects), **Live2D first** (GPT + me), **open student prompting** (owner decision), **pixel art / 3D / per-config portraits** (triple consensus).

### 8.1 Remaining owner calls — RESOLVED 2026-09-03

1. **Launch catalog**: ~52 premium items (owner accepted recommendation).
2. **Species bases**: **all 5 at launch** — owner direction: small cartoon bodies (robot/alien/monster) are "much more interesting even with less customization"; style = cartoonish Duolingo-like, NOT hyper-realistic; keep budget low. Resolved via the **"shared skeleton, varied skin"** design (§8.3): all bases share sacred canvas coordinates; universal slots (headwear/face/handheld/back/background) work on every body; hair/outfit/eyes human-only v1; species = gem purchases (~150).
3. **Human pair**: **Boy/Girl labeled picker** (owner decision; avatar takes the student's name). Design rule: NO item gender-locked — all hair/outfits/accessories available on both shapes.
4. **Phase-2 personalization (owner idea)**: paid hair styles/colors, species chassis/skin colors, eye colors → implemented as pre-generated curated **colorway variants** (swatch picker), no runtime recoloring. Captured in spec §2.6.

### 8.3 Sub-brainstorm: multi-species at launch ("shared skeleton, varied skin")

Species are **bases (a handful of renders), not item multipliers** — the expensive part (~52 items) is unchanged, so all 5 species fit the budget (~$10–20 generation total). Key mechanisms: locked skeleton across all bases (identical head box, head-top anchor, shoulder line → universal-slot items align everywhere); species skip body-fit slots but keep the high-visibility universal slots (chibi proportions make headwear the star); 1–2 signature items per species so they feel special; admin **compatibility grid** (renders a candidate on all 5 bodies) as the alignment curation tool. Cartoonish flat style additionally raises AI keeper rate, board legibility at 150px, and house-style coherence with lesson illustrations.

**Converged design written to:** `docs/superpowers/specs/2026-09-03-avatar-system-v2-design.md` (owner review pending).

### 8.2 Converged phases (supersedes §5.6)

- **Phase 0 — spine & hygiene** (unchanged): stop JSON-in-`avatar_url`; write `avatar_config`; `equip_item` RPC; shared `<Avatar/>`; board roster carries avatar; deterministic defaults for roster students; economy drift fixes (Dubbing/SRS XP, unconditional perfect-lesson gems, dead quests).
- **Phase 1 — premium MVP (3–5 wks)**: master character + style bible; ~52 items / 9 slots / 4 rarities / 20–40–75–150 pricing; server compositor + multi-res cache; shop rebuilt on `shop_items` (try-on preview, rarity styling, owned/equipped); board + podium + parent integration; idle/celebrate motion; render keys versioned by `AvatarRenderVariant`.
- **Phase 2 — expansion (3–5 wks)**: →120–150 items; seasonal ACTIVE/ARCHIVED/RETURNING; achievements + titles + board identity cards; age-segmented collections; passport card art.
- **Phase 3 — emotes/social (4–6 wks)**: sprite-sheet emotes (5–10 emotes, 3–5 dances); teacher-triggered mass celebrations via `classroom_action`.
