# Media Player (song/video) — v3 Quality Audit (`MEDIA_PLAYER`)

> **Status:** `pending` — §2 owner comments confirmed 2026-09-09; §0 identity stub; §1/§3 code audit pending (batch phase).
> **Screenshots:** pending (batch phase).

## §0 Identity (stub — completed at code-audit time)

- **Flow type:** `MEDIA_PLAYER`
- **Component:** `apps/board/templates/BoardMediaPlayer.tsx`
- **Phase:** WARMUP
- **Remote-control group:** Play/Pause (custom)
- **Data sources:** videoUrl/audioUrl from media-resolution ladder (catalog → book → AI → teacher)
- **Mode:** passive player

## §1 How the game works today

*(pending — ZCode batch code audit; the shared prelude will be embedded here when the file reaches `file-ready`.)*

## §2 Owner comments (verbatim — confirmed 2026-09-09)

> Second comment, about the media player. I'm on the lesson "Animals in the Wild". It seems on the media player I can see the title "Working in the Jungle", but it's still writing "no media content available for this step". So it seems it still doesn't work — need to check why the media player still doesn't work properly.

**Clarified with the owner (2026-09-09):**
- **Note-only, no fix this cycle** (owner decision 2026-09-09) — record the symptom; the resolution ladder (catalog → book → AI → teacher) failed or was never run for this unit's warm-up block.

## §3 ZCode code-level findings

*(pending — ZCode batch code audit)*

## §4 ⬜ ChatGPT Co-Work quality audit

> **Co-Work: write your findings ONLY inside this section.** (Full instructions + shared prelude embedded at `file-ready`.)

### 4.a UI & visual design
### 4.b Workflow & user flow (teacher's path: start → turns → end)
### 4.c Pedagogical practice (ESL ages 6–12)
### 4.d Game interaction (mechanic, pacing, fairness, fun)
### 4.e Top-5 prioritized recommendations
### 4.f Design direction for Stitch

## §5 ⬜ Google Stitch prompt

*(ZCode writes this AFTER §4 is filled.)*

## §6 ⬜ Stitch output & implementation notes

*(Owner drops the Stitch export into `stitch/<NN>-<game>/`; ZCode records implementation + deploy.)*
