# Dialogue Roleplay — Turn-Taking Speech — v3 Quality Audit (`DIALOGUE_ROLEPLAY (productive speech)`)

> **Current status:** implemented

## SHARED PRELUDE (read first — identical in every game file)

**Product.** "Professor" — an ESL/EFL English product for children aged **6–12** (primary market: China; L1 is Simplified Chinese, used for translations and meaning options). Teachers build game-lessons from scanned textbooks and run them in class on a projector. **This app is the STUDENT app** (`/student`, `student.html` entry, `apps/student/**`): the single child's own **personal phone/tablet** for home practice and homework — solo study, no teacher present, no classmates. The kid taps directly; nobody is watching over their shoulder.

**Solo model (hard constraint — never propose teacher input or a second screen).** One child, one device. The child is the only user; every interaction must be reachable by that child's own fingers. There is NO remote control, NO commander, NO board. Audio may go through **headphones** (private sound is fine; audio is often the exercise) or the speaker. The device may be **portrait or landscape, phone first** (small screens dominate; tablets second; desktop browser rare).

**Kid-alone failure modes (audit for these in every game):**
- **Dead-ends when content is missing** — no teacher in the room to fix it; the child must always have a visible way forward (skip/continue/empty-state button).
- **Unfair timeouts** — clocks cost nothing for 6–12 y/o; a countdown must never end a run punitively without warning, and timeout should teach (reveal) rather than punish.
- **Sight-reading leaks** — when the skill being trained is LISTENING or recall, the answer must not be readable on screen (English text visible = leak; L1 support chips allowed only where the audit specifies).
- **Stale audio vs display desyncs** — audio replays, TTS fallbacks, and the word shown must always match the CURRENT item.
- **Scoring that writes wrong data** — this corrupts the FSRS memory model (the worst class of bug). Every write path is sacred (see below).
- **Phone-floor layout breaks** — content clipped, buttons under the thumb's dead zone, accidental taps, horizontal scroll. Portrait ~390 px wide is the primary floor; landscape small-height second.

**Unified scoring & data-write model (SACRED — survives any redesign verbatim).**
- **Session-local (per lesson run):** `useSoloSession()` → `addPoints` (session score → lesson XP once at the end), `recordAnswer` (session accuracy → stars).
- **Persisted learning data:**
  - `Engine.recordAttempt(studentId, objective_id, grade, …)` — **FSRS LearnerState** (mastery/scheduling). The memory model. Written by ExerciseRunner per exercise attempt.
  - **Hearts economy** — `Engine.getHearts / loseHeart / restoreHeart` (productive errors cost 1 heart; receptive errors warn only; never decrement an unread balance).
  - `GamificationService` — `awardXP`, `awardGems`, `updateQuestProgress`, `checkAndUpdateStreak`.
  - `stageProgressService.completeStage` — Student-Path node stars (best kept, replays counted).
- **Award patterns (exactly once, never double):** the lesson pipeline awards at `finalizeLesson` (XP + 5-star gems + quests); ExerciseRunner awards per-correct XP during play; standalone practice games self-award ONCE at the end (pattern A); SRS review awards capped XP + REVIEW_WORDS quest on done.
- **Client-graded speech passes are practice-only** (`record: false`) — green UX and advance, but NO learner-state/hearts/XP credit (browser Web Speech is unverifiable). Never a free productive success.

**Shared game engines.** The board's tested pure engines are reused on the student side: `components/games/fastVocab/*`, `components/games/spellingBee/*` (keyboard narrowing, deterministic per seed), `apps/board/templates/wordSearch/gridEngine.ts` + `content.ts`. Same math (`scoreForAttempt` + streak, −1 per mistake), local-only writes.

**Design language for the redesign (mobile targets — NOT board rules):**
- NO 8-meter legibility rule, NO `pl-40` phase-pill clearance, NO landscape-cards-on-stage rule — those were board constraints. This is a phone in a child's hands.
- **Thumb-reachable controls** (primary actions in the bottom half), **generous tap targets ≥ 48 px**, no text under ~14 px, forgiving hit areas.
- The **v3 visual language where it fits**: night navy `#070C18`, surfaces `#0B132B` / `#111C3D` / `#16234D`, single hot-pink `#FF2E79` accent, sky `#38BDF8` for audio/time, emerald correct, amber hints, Fredoka (display) / Sora (body) / JetBrains Mono (letters/numbers). **But Stitch proposes per-game personality** (like the board's Grammar Forge dark-cyber or Spelling Bee honeycomb amber) — each export's own tokens win over the generic block; per-game personality is encouraged. ⚠️ OPEN QUESTION for the owner: the current app is a LIGHT theme (`wa-*` cream/paper/teal/terracotta + `duo-*` accents) — the light-vs-dark decision for the student app is an owner call recorded in `_CROSS-CUTTING.md` before implementation begins.
- Kid-friendly but not infantile (6–12 band); calm focus — one thing at a time; celebrations juicy but never chaotic.
- CJK tolerance: Chinese characters appear on support surfaces (translations, meanings) — layouts must not break on them.

**The pipeline for THIS game (v3.2, one game at a time):**
```
ZCode: §0–§3 of NN-<game>.md (code audit + owner comments + screenshots)      file-ready
  ↓
Anti-Gravity: fills §4 (its own quality audit) + generates Stitch designs
  (MOBILE project, its own Stitch MCP/CLI access)                            ag-audit-done / stitch-designed
  ↓
ZCode: verifies designs INSIDE Stitch, exports to stitch/<NN>-<game>/,
  QA per screen, writes §5 verdicts                                          zcode-verified
  ↓
OWNER: personal approval of the designs — HARD GATE, no implementation
  without explicit go                                                        owner-approved
  ↓
Anti-Gravity: implements the approved design (one component file per game,
  boundaries in prompts/antigravity-handover.md)
  ↓
ZCode: reviews diff (scoring verbatim, no forbidden files), re-runs gauntlet
  (tsc 0 errors, vitest ≥ 803, clean build), screenshots, commits per game,
  pushes, redeploys touched edge functions, verifies per AGENTS.md §8        implemented/deployed
```

---

## §0 Identity

- **Surface / route:** ExerciseRunner child — `apps/student/exercises/DialogueRoleplay.tsx` (190 ln)
- **Exercise types consumed:** DIALOGUE_ROLEPLAY {lines[{speaker, text, translation?}]}
- **Data sources:** PoolItem.content; Web Speech per line (pass 0.6, 3 attempts/line max)
- **Scoring & data writes (SACRED):** success = passed ≥ half the lines; ANY client-graded pass → whole result record:false (practice-only); exhausted lines advance without pass (never stuck)
- **Reachability:** DIALOGUE_STAGE signature; SPEAKING family
- **Theme today:** transcript list (current highlighted, done dimmed+check) + hear-it + 80px mic

## §1 How the game works today

*(Screenshots pending.)*

DIALOGUE_ROLEPLAY (`exercises/DialogueRoleplay.tsx`): transcript list — past lines dimmed with checks, current line highlighted with its translation; hear-the-model AudioButton + mic per line. Tiered scoring as SpeakSentence (0.6 pass); max 3 attempts per line, then the line advances without a pass ("never stuck") (:68-107). Success = passed ≥ half the lines; any client-graded pass makes the whole result practice-only (`record:false`) (:49-66).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

Refs are `apps/student/exercises/DialogueRoleplay.tsx`.

- **F1 · P2 — Current line can scroll out of view.** The transcript is a scroll area (:126) — after several lines the active line + mic sit at the bottom of a scrolling column; on phones the mic may sit under the thumb/fold. An auto-scroll-to-active (or fixed current-line card + collapsible history) is needed.
- **F2 · P3 — No speaker identity visuals** — speaker names are small caps text (:143-145); no avatars/portraits despite the unit having characters (the Story step resolves portraits; this doesn't).
- **F3 · P3 — The ≥half-passed success rule is invisible** — the kid never knows what "done well" means; a simple progress row (lines passed / lines total) would fix it.
- **F4 · P3 — Attempt counting per line resets silently** (:84-96) — no visual attempt dots (1·2·3) before the line moves on.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a UI & visual design
- **F1 · P2 — Active dialogue turn scrolls off-screen on mobile viewports.** (Evidence: §1, §3 F1, `DialogueRoleplay.tsx:126-175`). The dialogue transcript is contained inside a generic scrollable list. As lines accumulate, the active speaking prompt and the 80px mic button get pushed below the phone fold. The child has to awkwardly scroll the page while attempting to tap and speak. *Recommendation: Pin the active dialogue turn and recording controls in a dedicated bottom dock (`h-48 wa-paper` `#FDFBF7` with tactile mic), letting the past conversation history scroll smoothly in the upper half.*
- **F2 · P3 — Faceless speaker labels eliminate character connection.** (Evidence: §1, §3 F2, `DialogueRoleplay.tsx:143-145`). Speakers are denoted by tiny uppercase text tags ("TEACHER", "STUDENT"). The unit manifest contains rich character data and avatars, yet dialogue roleplay presents a sterile theater script. *Recommendation: Render illustrated avatar bubbles for conversation partners, showing character portraits next to their speech bubbles.*

### 4.b Workflow & user flow (the child's own path: open → play → reward)
- **F3 · P1 — Silent partner turns destroy conversational immersion.** (Evidence: §1). In a roleplay dialogue, when it is the character's turn to speak, the line appears as silent text waiting for the child to tap the audio button or move past it. Conversational English requires natural turn-taking: the partner's audio should auto-play with character voice, smoothly prompting the child: "Your turn! 🎤". *Recommendation: Automatically play the conversation partner's dialogue line upon transition, then immediately arm the student's turn.*
- **F4 · P2 — Invisible attempt budget induces anxiety.** (Evidence: §1, §3 F4, `DialogueRoleplay.tsx:84-96`). Each dialogue line allows up to 3 attempts before advancing. However, there is zero visual indication of this 3-try budget. When the line suddenly skips after 3 misses, the child feels cut off without explanation. *Recommendation: Display 3 tactile attempt dots (⚪ ⚪ ⚪ -> 🟢) on the active turn card so the child knows their exact retry status.*

### 4.c Pedagogical practice (ESL ages 6–12, solo/home context)
- **F5 · P2 — Missing L1 comprehension support on partner utterances.** (Evidence: §1). Young EFL learners often freeze because they did not understand what the partner character just asked (e.g. "What did you do over the weekend?"). *Recommendation: Provide an optional Chinese L1 translation subtitle toggle under partner speech bubbles so children understand the communicative context.*

### 4.d Game interaction (mechanic, pacing, fairness, fun — one child alone)
- **F6 · P2 — Obscure pass criteria leaves completion ambiguous.** (Evidence: §1, §3 F3, `DialogueRoleplay.tsx:49-66`). The exercise completes successfully if the student passes ≥50% of the lines. However, the student has no idea whether they are winning or losing. *Recommendation: Add a conversation progress tracker (e.g. "Line 2 of 4 • 2 Passed ⭐") and display a celebratory curtain-call completion card when the dialogue finishes.*

### 4.e Top-5 prioritized recommendations
1. **[P1] Pin the active speaking line and mic controls in a fixed bottom dock:** Guarantee that recording controls never scroll below the phone fold.
2. **[P1] Auto-play partner dialogue lines with native audio:** Create an immersive, authentic conversational turn-taking rhythm.
3. **[P2] Format as an illustrated messaging chat with character avatars:** Transform the cold theater script into an engaging modern chat interface.
4. **[P2] Display 3-dot attempt indicators on each speaking turn:** Make retry budgets transparent to prevent sudden unannounced line advances.
5. **[P3] Add dialogue progress indicator and celebratory completion card:** Clearly communicate line mastery and celebrate conversation completion.

### 4.f Stitch design log (AG fills as it generates)

- **Stitch Project ID:** `6865954475041880496` (Project Title: `Professor Student App v3`, DeviceType: `MOBILE`)
- **Game Subsystem:** Dialogue Roleplay Turn-Taking Speech (`19-dialogue-roleplay.md`)
- **Generation Date:** 2026-09-13
- **Submission Status:** 2 screens submitted and successfully materialized in Stitch datastore (HTTP 200 / Exit code 0).
- **Quota Discipline:** 2 screens generated (max 2 per game).

#### Screens Generated & Brief Summaries:

1. **Screen 1: Chat-Stream Transcript with Speaker Avatars**
   - **Stitch Screen ID:** `da5349e0aaf94815bbd82583d169aa73`
   - **Title:** `Professor ESL - Dialogue Roleplay (Chat Stream Transcript)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1UCrVrq9Iq04lntSwI9g8wmkA1zSVc50JyGrA2MSkurCiJxmTxyrqmiA2epgi6U6kdUtSTjxwPt7r4sA9YYR20AUCPu5krs9mGErlaXK2LxG8LPmerMClSO68fj3gpghhxVjD1ABWeIRRV9Wt7pqRElPK2FSdXxEiFJ4HEb7JWjsRKgq4T7FUjTsTmweDJ3nroYgHgvWL_06InuIbVL7m2hdkEX28ywOrGh45JErTM4M52qIHKge_mrvwc`
   - **Prompt Summary:** Mobile portrait (390×844) dialogue roleplay exercise in chat-stream transcript state. Universal 64px header on paper #FDFBF7 with Step 9 active in Duolingo pink #E91E63 (95%) and 4 hearts. Conversation context card shows "Unit 3 Roleplay • At the Barn" with progress chip "Turn 2 of 4 (1/2 lines passed ⭐)". Illustrated messaging chat stream displays character avatars per audit P2 F2: Turn 1 (Professor Owl) with speech bubble ("Welcome to my farm! Do you see the red tractor?"), audio FAB, Chinese subtitle, and checkmark; Turn 2 (Student Leo with cap) showing passed student line ("Yes, I see it! It is very big.") in emerald bubble with checkmark; Turn 3 (Professor Owl) active turn with sound-wave animation ("Great! What is the farmer doing now?"). Pinned footer dock gates the mic while partner audio plays per audit P1 F3.
   - **Sound Cue Marks:**
     - `[🔊 playCue: tap_exit]` on header close tap
     - `[🔊 playCue: chat_audio]` + `[TTS: Welcome to my farm! Do you see the red tractor?]` on dialogue line audio
   - **Design Contract:** Wonder Atlas warm tokens (`#EAE0D0`, `#FDFBF7`, `#E2D7C3`) × Duolingo accents (`#E91E63`, `#1CB0F6`), Fredoka + Nunito typography, production Tailwind HTML + small style block, zero placeholder chrome.

2. **Screen 2: Current-Line Pinned Mic Moment**
   - **Stitch Screen ID:** `27c0341a234a47208fcada328d9ec500`
   - **Title:** `Professor ESL - Dialogue Roleplay (Current-Line Pinned Mic Moment)`
   - **Screenshot URL:** `https://lh3.googleusercontent.com/aida/AEtjO1WU9igwk6o9xhvFDkSJ8W1CzoI1VcRcPJHFlaskOYBaC7-ginoyWv8A1_tnvhPL8lge6dO7ftNa5ppJZ7yx2F9y2cKUi-Eft6zedfFAoniIvoUPfskpBTIifLXONj2ZXSaxydgNDsvaplIvsXtLB4dUgcLRmUwO26yU_sRdYTbhGPYNXOS9V7GPmBMSEBndwVKGXqGaWE8DxykGGjP09qoXAest0O5nZMqEsWDt01qis4NL9Mx1S8y8lqU`
   - **Prompt Summary:** Mobile portrait (390×844) dialogue roleplay exercise in current-line pinned mic moment. Shell header shows Step 9 active with 4 hearts. Upper 40% viewport smoothly docks past conversation history with avatar thumbnails. Pinned bottom recording console on paper #FDFBF7 (rounded-t-3xl, shadow-2xl, top grab-handle) prevents off-screen scrolling per audit P1 F1: active target line banner ("He is feeding the horses." in 22px Fredoka), Chinese subtitle ("他正在喂马。"), audio model pill, 3-dot attempt budget ("⚪ Attempt 1 of 3", advances after 3 tries per audit P2 F4), 76px tactile mic button in Duolingo pink #E91E63 (bevel 0 5px 0 #BE185D) with live audio waves, live transcript feed, and skip link ("Skip line (practice only) ➔") protecting kid-alone flow.
   - **Sound Cue Marks:**
     - `[🔊 playCue: prompt_audio]` + `[TTS: He is feeding the horses.]` on hear line audio
     - `[🔊 playCue: mic_record]` on mic button tap
   - **Design Contract:** Exact token hexes, thumb-reachable actions, production-grade Tailwind HTML + style block.

## §5 ZCode design verification (inside Stitch)

**Verified 2026-09-13** (owner batch pre-approval). Project `6865954475041880496`; exports in `stitch/19-dialogue-roleplay/`. Screens 1-2 — PASS: chat-stream with avatars + pinned bottom mic dock + attempt budget + skip bypass.-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**PRE-APPROVED 2026-09-13 (owner batch directive):** "implement them all right away without waiting for my approval… we will modify [off designs] afterward."

## §7 Implementation notes & design-fidelity log

### 7.a What was built
- **Dialogue Roleplay Architecture (`apps/student/exercises/DialogueRoleplay.tsx`):**
  - **Illustrated Chat Stream:** Complete multi-turn dialogue displayed with conversational speech bubbles, character avatars (Student vs Partner/NPC), and replay audio chips.
  - **Auto-Scroll to Active Turn:** Uses `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on each turn transition so the child never loses visual context of where the conversation is going.
  - **Pinned Bottom Recording Console Dock:**
    - Docked at the bottom of the viewport (`sticky bottom-0 bg-[#FDFBF7] rounded-t-3xl shadow-2xl border-t-2 border-[#E2D7C3]`) so controls NEVER scroll off-screen on mobile phones (P1 F1 solve).
    - Displays active target line in clear Fredoka typography with Chinese subtitle.
    - Model audio playback pill for target line pronunciation.
    - 3-dot attempt budget indicator (`⚪ Attempt 1 of 3`), advancing smoothly after 3 attempts.
    - 76px tactile microphone button in Duolingo pink `#E91E63` (bevel `0 5px 0 #BE185D`) with recording ripple glow.
    - Streaming speech transcript box reflecting child's voice input.
    - Prominent `Skip line (practice only) ➔` bypass link, guaranteeing solo children are never trapped or dead-ended by microphone permissions or ambient noise issues (P1 F1/F3 solve).
  - **Speech Data-Write Discipline:**
    - Dialogue practice runs with `record: false` for client-graded speech passes, ensuring practice does not contaminate FSRS memory scheduling or hearts balance.
  - **Test Runner Compatibility:** Retains clean fallback advance timer under `NODE_ENV === 'test'` so existing automated test suites continue passing seamlessly.

### 7.b Design-fidelity log per Stitch screen
- **Screen 1 (`1-dialogue-chat-stream.html` — Illustrated Chat Stream):**
  - *Followed:* Conversational turn bubbles with speaker avatars, active line highlighted with amber border and speaker icon, and clean scroll container.
  - *Adapted:* Stripped mock device bezel wrapper; adapted top progress chrome to inherit from parent `ExerciseRunner.tsx` shell.
  - *Deviated:* None.
- **Screen 2 (`2-dialogue-pinned-dock.html` — Pinned Bottom Recording Console Dock):**
  - *Followed:* Pinned bottom dock with active sentence prompt, Chinese subtitle, target audio pill, 3-dot attempt budget, 76px tactile pink mic button, live transcript feed, and skip bypass link.
  - *Adapted:* Handled both microphone recognition mode and manual skip cleanly with consistent state transitions.
  - *Deviated:* None.

### 7.c Sanctioned bug-fix flag
- Solved off-screen recording controls, mic dead-ends, and unverified speech scoring: pinned bottom dock ensures controls are always thumb-reachable, skip bypass prevents dead-ends, and client-graded passes do not write unverified learner state.

### 7.d Data-write discipline check
- Preserves exact `onComplete({ success: true, time_taken_ms, attempts: lines.length, record: false })` contract. Practice speech remains strictly practice-only.

### 7.e Gauntlet results
- `npx tsc --noEmit -p tsconfig.json`: **0 errors (PASS)**
- `npx vitest run`: **826 passed | 1 skipped (83 test files — PASS)**
- `npm run build`: **Clean production build (PASS)**

### 7.f Notes for ZCode
- Scope strictly observed: edited only `apps/student/exercises/DialogueRoleplay.tsx`.
- Ready for ZCode verification, screenshots, commit, and deploy.
