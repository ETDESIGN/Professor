# Avatar System v2 — Design Spec

**Date:** 2026-09-03
**Status:** Owner review requested
**Inputs:** `docs/brainstorming/13_AVATAR_SYSTEM_V2_BRAINSTORM.md` (audit + triple consultation: agent, Claude, ChatGPT — verdicts in its §8)
**Supersedes:** root `12_avatar_system_technical.md` (its AI pipeline violated the region-safe rule; its slot-anchor concept survives below)

---

## 1. Decision record (locked)

| Decision | Value |
|---|---|
| Paradigm | **Layered 2D raster "paperdoll"** — config = source of truth, rendered image = cache |
| Bases at launch | **All 5, shared skeleton**: `human_boy`, `human_girl`, `robot`, `alien`, `monster` — chibi cartoon style (Duolingo-like), extending the app `HOUSE_STYLE`; **not** hyper-realistic (owner: quality bar = cohesive + cartoonish, and flat style raises AI keeper rate) |
| Human picker | **Boy / Girl labels** (owner decision). **Rule: NO item is gender-locked** — every hair/outfit/accessory is available on both human shapes |
| Species unlock | **Gem purchase** (~150 each, epic) — the flagship "pay to change the avatar itself" purchase. Both human bodies free |
| Generation | Offline AI batch via existing OpenRouter pipeline (i2i against locked masters, ~$0.04/img); **runtime AI = none** |
| Launch catalog | **~52 premium items** (owner decision) across universal + human-only slots; expand to 120–150 in Phase 2 |
| Pricing | common 20 / rare 40 / epic 75 / legendary 120–180 gems; 15–20% of items quest-exclusive (zero gem price) |
| Compositing | Hybrid: client layer stack in the Builder (instant preview) → server composite (ImageScript, edge) → one cached multi-res image everywhere else |
| Economy rules | Earn-only (no real money, no loot boxes, no trading/gifting); **no class-points→gems conversion (permanent)**; free = cool; rarity = scarcity, not superiority |
| Animation v1 | CSS idle (breathe/sway) + baked blink variants + celebrate pop. Emotes (sprite sheets, NOT Live2D/video) = Phase 3 |
| Scope ban (v1) | Trading, gifting, avatar chat, 3D, UGC cosmetics, marketplace, animation editor, multiplayer avatar interaction |

Phase-1 success criterion (acceptance test): **20 different avatars on the 4K classroom leaderboard look like a real children's game, not an educational CRUD app.**

## 2. Architecture

### 2.1 Slot taxonomy & compatibility

| Slot | Compatibility | Notes |
|---|---|---|
| `body` | — | One of 5 bases; the "slot" that species purchases change |
| `skin` | human only (v1) | Tone index; species colorways = Phase 2 |
| `hair` | human only | 8 at launch |
| `eyes` | human only | 5 at launch; species expressions baked into base variants |
| `outfit` | human only (v1) | **One-piece outfits** (no top/bottom split) — better silhouettes, less alignment risk; species outfits ("cosplay") = Phase 2 |
| `headwear` | **universal** | Drawn to the shared head anchor with brim tolerance |
| `face` | **universal** | Glasses, masks |
| `handheld` | **universal** | Pencil, flag, trophy |
| `back` | **universal** | Capes, wings, jetpack |
| `background` | **universal** | Identity-card backgrounds |
| species signature packs | per species | 1–2 items each at launch (robot antenna, monster horns…) |

Layer order at composite: `background → back → body → outfit → hair → eyes → face → headwear → handheld`.

### 2.2 Data model

```jsonc
// profiles.avatar_config JSONB  (column exists, currently unused — becomes source of truth)
{
  "version": 1,
  "body": "human_boy",
  "skin": 2,
  "items": {
    "hair": "hair_08", "eyes": "eyes_03", "outfit": "outfit_12",
    "headwear": "crown_gold", "face": null, "handheld": null,
    "back": null, "background": "bg_blue"
  }
}
```

- `profiles.avatar_url` — repurposed to hold the **current composite render URL** (never JSON again). This makes the existing assumption of all `<img>` consumers true instead of patching 20+ sites.
- **New table `avatar_renders`** `(profile_id, config_hash, variant, sizes text[], url, created_at)` — render cache; hash = deterministic hash of canonical config; cache hit → reuse, miss → composite.
- **Extend `shop_items`** (reuse, don't create parallel tables — the atomic `buy_shop_item` RPC already works): add `slot`, `rarity`, `kind ('item'|'base'|'emote')`, `compatible_bodies text[]` (empty = universal), `layer_asset_path`, `preview_url`, `season_id`, `sort_order`, `active`, `unlock_type ('gems'|'quest'|'default')`. `Shop.tsx` stops hardcoding its catalog and queries this table.
- **`student_inventory`** — `equipped` finally means something: exactly one equipped item per slot.
- **New RPC `equip_item(p_item_id)`** (SECURITY DEFINER, atomic): verify ownership (or `unlock_type='default'`) → verify slot compatibility with current body → unset sibling `equipped` rows for that slot → merge item into `avatar_config` → return new config. Client then calls the render action. Add `set_avatar_body(p_body)` for base changes (checks ownership of species bodies).
- **Default avatars for unclaimed roster students:** ~12 pre-generated default renders; deterministic assignment `hash(roster_students.id) → default`. The board never shows 👤 again. (Also fixes `getSessionRoster()` hardcoding `avatar: ''`.)

### 2.3 Render flow

```
Builder (student app)
  client-side layer stack → instant preview, zero API calls per tap
  SAVE → equip_item / set_avatar_config RPC → returns canonical config
       → generate-media action `compose-avatar`
          deterministic hash → avatar_renders cache hit? → done
          miss → ImageScript composite (layer order §2.1)
               → encode 128 / 256 / 512 / 768 (WebP if our ImageScript
                 version encodes it — validate in bake-off; else PNG)
               → upload to `generated-media` bucket, deterministic path
               → upsert avatar_renders + update profiles.avatar_url
All other surfaces: <Avatar student size context/> → avatar_render_url → <img>
```

- **`<Avatar/>` shared component** resolves the URL, picks the resolution (128 chips · 256 lists/profile · 512 podium/winner · 768 4K board), falls back to the roster default, and carries an accessibility label. Consumers never touch avatar JSON.
- **Render keys are variant-aware now** (`{config_hash}/{variant}_{size}`) with `AvatarRenderVariant = 'idle' | 'celebrate' | 'wave' | 'dance_01'` — only `idle` ships in v1, but the schema cannot dead-end before emotes.
- PWA service worker precaches the student's own render; board entry prefetches classmates'.

### 2.4 Art production pipeline (offline, team-run)

1. **Style Bible** (immutable once production starts): chibi proportions, flat cel shading, palette, line weight, silhouette rules ("recognizable at 150px"), the shared-skeleton coordinate spec (identical head bounding box + head-top anchor + shoulder line across all 5 bases), accept/reject visual examples. Budget 20–30% of art spend here.
2. **Masters**: 5 bases iterated until excellent (they share one style bible — one master effort serves all).
3. **Items**: image-to-image against the locked master per slot (`input_references` — pipeline already supports it) + slot-specific prompt scaffolds; flat-background prompting + chroma-key removal for transparency (validate in bake-off).
4. **Automatic validation gate** (before human eyes): canvas size, item bounding box vs slot region, true transparency, palette adherence, style-similarity check via vision model. Pipeline precedent: `imageQuality.ts` Laplacian gate.
5. **Compatibility grid**: one click renders a candidate item on all 5 bases (the admin curation tool) — catches hat-on-robot alignment misses at a glance.
6. **Human KEEP/REJECT gate** — AI never decides what enters the game. Expected keepers 3–5/10 (LoRA fine-tuning dismissed for v1; documented revisit trigger: keeper rate < 3/10 after prompt/i2i refinement AND curation becomes the bottleneck).

**Launch catalog (~52):** bases 5 (2 free human, 3 species @150) · hair 8 · eyes 5 · outfit 10 · headwear 8 · face 5 · handheld 4 · back 3 · background 4 · species signatures 4. Estimated generations ≈ 250–400 total incl. masters ≈ **$10–20** (cap $100 untouched; the real constraint is owner curation time).

### 2.5 Economy rules

- Prices: common 20 / rare 40 / epic 75 / legendary 120–180 (earn rate ~10–30 gems/day → "small purchase every 1–2 days, species in ~a week").
- Free tier: 3–5 excellent starter combos per human body; a free avatar can look as cool as a legendary one.
- Seasons: `ACTIVE / ARCHIVED / RETURNING` — items rotate back; no countdown FOMO.
- Prestige = **achievements + titles** (Word Wizard, Grammar Hero) shown on board identity cards (Phase 2, with the achievements system) — status through achievement variety, not spending.
- **Never:** loot boxes, random paid reveals, trading, gifting, real-money cosmetics, class-points→gems, wrong-answer avatar reactions (public-shame risk on the projected board — celebrate-only).
- Economy hygiene in the same pass (from audit): Dubbing/SRS legacy XP rates (10–50 vs the 1–5 scale), unconditional PERFECT_LESSON gems, 3 dead quest types, teacher sidebar +10/+50 manual points.

### 2.6 Phase-2 personalization variants (owner idea, captured)

Hair styles/colors, robot chassis colors, monster/alien skin colors, eye colors — implemented as **pre-generated curated colorway variants** (swatch picker → variant catalog entries generated in batch by the pipeline). No runtime recoloring, consistent with the curated-catalog rule.

## 3. Phases

| Phase | Content | Effort (1 dev + AI agent) |
|---|---|---|
| **0 — Spine & hygiene** | Stop JSON-in-`avatar_url`; write `avatar_config`; `equip_item`/`set_avatar_body` RPCs + migration; `<Avatar/>` component; board roster query carries avatar; deterministic roster defaults; economy drift fixes | ~1 week |
| **1 — Premium MVP** | Style bible + 5 masters; ~52 items through the pipeline; compositor + multi-res cache + `compose-avatar`; Builder rebuilt on slots/compatibility; Shop rebuilt on `shop_items` (try-on preview via client layers, rarity styling, owned/equipped); board/podium/parent integration; idle/celebrate motion | **3–5 weeks** (art parallel) |
| **2 — Expansion** | →120–150 items; seasonal rotation tooling; achievements + titles + board identity cards; age-segmented collections (6–9 / 10–12 / 13–15); colorways (§2.6); passport card art | 3–5 weeks |
| **3 — Emotes & social** | Sprite-sheet emotes (5–10 emotes, 3–5 dances, 12–18fps, 18–27 frames; base-body frames + item overlay as the cost-containment pattern to validate); **teacher-triggered mass celebrations** via `classroom_action` broadcast | 4–6 weeks |

## 4. Display-site integration map (from audit)

URL consumers (work unchanged once `avatar_url` = render URL): student `Leaderboard.tsx`, teacher `Reports.tsx`, `DashboardHome.tsx`, `BoardWordSearch.tsx`, parent `ParentDashboard/ParentSettings`. Swap to `<Avatar/>`: board `BoardShell`, `ClassLeaderboard`, `BoardGameArena`, `BoardTeamBattle`, `BoardWheelOfDestiny`, `BoardOverlayLayer`, `usePickedStudent` banners, `LiveCommander`, `SidebarPanel`, `StudentSelectorModal`, `QuickSpinModal`, student `Profile.tsx`, `Shop.tsx`. Data fixes: `getSessionRoster()` avatar field; `class_roster_analytics_view` COALESCE stays valid.

## 5. Risks (top 5, from the triple consultation)

1. **Art-style drift** → style bible + i2i masters + validation gate + human KEEP/REJECT.
2. **Dress-up database instead of a game** → avatar appears everywhere gameplay happens; loop = "I did something → I earned → everyone sees my character on the board."
3. **Performance (30 students × 4K × flaky Wi-Fi)** → production surfaces load ONE cached image each, multi-res, deterministic URLs, SW precache.
4. **Scope explosion** → the §1 scope-ban list; MVP = "choose → earn → equip → show off."
5. **Toxic status hierarchy** → free = cool, rarity = scarcity, prestige via achievements, no trading/marketplace.

## 6. Open validation items (bake-off / first sprint of Phase 1)

- WebP encode support in our ImageScript version (else PNG).
- Chroma-key background removal quality vs native transparency from the provider.
- Hat/brim tolerance across the 5 head shapes (compatibility grid).
- Model choice per surface: Seedream 4.5 vs FLUX on item isolation + style adherence (`illustration-bakeoff.ts` harness exists).
- Claude's economy/emote/roadmap sections were never provided — if the owner shares them, diff against this spec before Phase 1 locks.
