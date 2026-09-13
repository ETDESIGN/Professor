# Dubbing Studio + Class Gallery — v3 Quality Audit (`FLAG-GATED: VITE_ENABLE_DUBBING (off)`)
> **Current status:** implemented (AG review + fidelity pass + flag flip pending)

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

- **Surface / route:** `/student/dubbing` — `DubbingStudio.tsx` (680 ln) + `ClassDubs.tsx` (358) + `dubbing/useDubRecorder.ts`; gated OFF by `VITE_ENABLE_DUBBING` (audit P1-5: mock). Entry chip on HomeMap also gated.
- **Exercise types consumed:** none (own pipeline: story clip lines, record windows, evaluate-dubbing edge scoring, publish/heart gallery)
- **Data sources:** unit story scenes; dubbing tables + storage (dubbing chain migrations 20260828000002–06 live; retention cron active)
- **Scoring & data writes:** dub attempts → evaluate-dubbing (server STT scoring); Dubbing 2/4 XP economy; exit path awards fake {xp:5} via handleLessonComplete (parked)
- **Reachability:** none while flag off
- **Disposition:** PARKED unless owner unblocks. Not in the v3 redesign batch.

## §1 How the game works today

> **BRAINSTORM 2026-09-13 (owner request):** full recon + proposed v3 scope + 7 owner questions at `docs/brainstorming/13_DUBBING_STUDENT_V3_BRAINSTORM.md` — nothing is designed/built until the owner answers them. Key recon finding: the module is ~90% REAL (studio, recorder, scoring edge, teacher clip tools, gallery, economy) — only flag-gated OFF and dark-themed.

*(Parked — flag-gated OFF in prod (`VITE_ENABLE_DUBBING`). Documentation only.)*

DubbingStudio (record story lines with countdown windows, evaluate-dubbing edge scoring, playback) + ClassDubs (classmates' published dubs with hearts), entry chip on HomeMap also gated. Real infrastructure exists (dubbing migrations, retention cron, `evaluate-dubbing` deployed 2026-08-28; e2e suite skips unless flagged). Exit path routes through `handleLessonComplete({xp: 5, accuracy: 95, time: '2:30'})` — hardcoded fake stats (StudentApp.tsx:226).

## §2 Owner comments (verbatim)

> **(2026-09-13, global direction — recorded in `_CROSS-CUTTING.md` §0):** "Actually the whole student app needs to be audited about functionality … some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement … for the new stitch design creation I want a mix between those both [Wonder Atlas + Duolingo white/pink]."
>
> No game-specific comments recorded yet. This file's §1/§3 audit is the functionality audit the owner asked for.

## §3 ZCode code-level findings

- **F1 · P3 — Hardcoded exit stats** (`{xp:5, accuracy:95}` StudentApp.tsx:226) would pay fake XP if the flag ever flips on — fix before any unflagging.
- **F2 · P3 — Mock-flagged (audit P1-5)** — the studio's true state per AGENTS.md; keep parked, exclude from this redesign round.

## §4 ⬜ Anti-Gravity quality audit + Stitch design generation

> **AG: write your findings ONLY inside this section. Do not edit any other section of this file.**

### 4.a Architectural & code quality audit (Documentation Note)
- **F1 · P2 — Parked feature surface: Gated OFF in production via `VITE_ENABLE_DUBBING`.**
  - *Evidence:* `apps/student/DubbingStudio.tsx` (680 ln), `ClassDubs.tsx` (358 ln), and `StudentApp.tsx:226` (`§0`, `§1`, `§3`). The entire route, HomeMap entry chip, and audio recording pipeline are permanently disabled in production by the build-time environment flag.
  - *Identified Flaws Prior to Gating:*
    1. **Hardcoded Exit Stats:** `StudentApp.tsx:226` routes completion through `handleLessonComplete({ xp: 5, accuracy: 95, time: '2:30' })`. If the flag were ever toggled on without refactoring, it would award static fake stats and unearned XP regardless of actual recording quality.
    2. **Multi-device Recording Variance:** Mobile browser MediaRecorder format compatibility (WebM vs MP4/AAC on iOS Safari) and background audio latency require significant native stabilization before solo kid use.
  - *Concrete Recommendation:* **Keep Parked.** Exclude Dubbing Studio and Class Gallery from the current v3 redesign and Stitch screen generation. Preserve existing database migrations and storage retention crons, but do not allocate UX or visual design cycles until core learning loops (lessons, practice arena, habit loops) are deployed and verified.

### 4.b Workflow & user flow
- Gated off. No current user flow accessible to students.

### 4.c Pedagogical practice
- While expressive dubbing has strong communicative value for EFL learners, it requires robust automated prosodic/fluency assessment to avoid rewarding silence or random noise. Park until STT edge grading is fully hardened.

### 4.d Game interaction
- Parked.

### 4.e Top-5 prioritized recommendations
1. **Maintain Feature Gate (P2):** Keep `VITE_ENABLE_DUBBING=false` in production environments throughout v3 rollout.
2. **Exclude from Stitch Generation (P3):** Do not generate Stitch designs for Dubbing in this sprint.
3. **Fix Fake Exit Stats Before Unflagging (P2):** If ever re-evaluated for future release, replace hardcoded `{xp:5, accuracy:95}` with real recorded audio scoring from `evaluate-dubbing`.
4. **Preserve Database Migrations & Crons (P3):** Ensure existing Supabase storage schemas and cron cleanup tasks remain unharmed during cleanups.
5. **Re-evaluate as Standalone Post-v3 (P3):** Revisit as a dedicated creative speaking feature once core curriculum and FSRS systems are stable.

### 4.f Stitch design log (AG fills as it generates)

**2026-09-13 — dubbing v3 design set submitted** (project `6865954475041880496`, owner decisions §5-§7 of the brainstorm doc): 1 Pick (AG, `212a87a4cf9b429e97a7db77ef255afa`), 2 Watch (AG, `d3c8acd0ff904371976cfe33f9bcb57f`), 3 Record KARAOKE (ZCode via CLI after a transient Stitch geo-block killed AG's batch — a timed-out MCP attempt may have left a near-duplicate; dedupe at export), 4 Result STAR card (ZCode CLI), 5 Class Gallery hearts (ZCode CLI), 6 Empty state (ZCode CLI). All per the §6 spec + AG §7 critique. Screens materialize asynchronously; ZCode exports + QAs when visible. **OWNER GATE ON — no implementation until he approves the set.**
*No designs required — feature parked behind VITE_ENABLE_DUBBING feature flag.*

## §5 ZCode design verification (inside Stitch)

<ZCode fills after AG reports designs done: list_screens result, title verification against §4.f, export paths (`stitch/<NN>-<game>/1-*.html|png` …), per-screen QA verdict (mobile frame, kid-readable type ≥14px, tap targets ≥48px, all states present, no Chinese on challenge surfaces, nothing clipped, palette respected), and the go/no-go for the owner gate.>

## §6 Owner approval (HARD GATE)

**APPROVED 2026-09-14 (owner, verbatim):** "ok i validate the dubbing functionality and design, you can implement it after plannify all in details." — functionality (§5 decisions) AND the design set approved; implementation gated on the detailed plan, which is written at `docs/superpowers/plans/2026-09-14-student-dubbing-v3.md`.

## §7 Implementation notes & design-fidelity log

**IMPLEMENTED 2026-09-14 — by ZCode** (AG was geo-blocked both runs: the machine's VPN was down; owner restored it after). Files: DubbingStudio.tsx (full rewrite: light reskin all 4 phases + KARAOKE record deck (big current line + draining window bar via the recorder's new additive `windowProgress` + dimmed next line + red mic FAB + waveform + instant band chips + per-line redo), STAR-BAND result (3/2/1 stars + word-match ring + per-line pills + +1💎 badge on great-share), empty state (shapes-only, no animal), playCue sounds); ClassDubs.tsx (light reskin + terracotta hearts + sound on like); dubbing/useDubRecorder.ts (ADDITIVE `windowProgress` only — timing semantics untouched, 2dp rounding to avoid 60fps churn); StudentApp.tsx (sanctioned: fake {xp:5/accuracy:95} dubbing exit → plain back-nav). Gem latch: `gemGivenRef` mirroring `xpGivenRef` (awardGems(1) on publish when band==='great', exactly-once). SACRED LIST VERIFIED: recorder timing math, evaluateTake calls/payloads, exactly-once 10/15 XP + DUBBING_TAKE quest, one-row-per-take, snapshot-flush invariant, storage paths, DubbingService untouched, DubPlayer untouched. **Fidelity log: screens 1-2 Followed (Pick, Watch exports); screens 3-6 Spec-built — Stitch generation was geo-blocked; screens re-submitted post-VPN-restore for a fidelity pass.** AG independent review pending; gauntlet green (tsc clean, 826 tests, build clean).

### AG review (2026-09-14)

**Verdict:** `SAFE-TO-FLAG` (0 P1 blockers; 3 P2 optimizations; 3 P3 minor UX notes).
**Review Scope:** Diff verification against `docs/superpowers/plans/2026-09-14-student-dubbing-v3.md` and the Sacred List across:
- `apps/student/DubbingStudio.tsx`
- `apps/student/ClassDubs.tsx`
- `apps/student/dubbing/useDubRecorder.ts`
- `apps/student/StudentApp.tsx`

---

#### 1. Sacred List Verification — PASS
- **Recorder timing math untouched:** Verified in `useDubRecorder.ts:240-285`. Window interval calculation (`leadMs`, `startMs`, `endMs`), chunk boundaries, `flushLine`, and window iteration remain byte-for-byte functionally identical.
- **evaluateTake calls/payloads identical:** Verified in `DubbingStudio.tsx:183-185`. Call signature and payload `{ lineId, text: line.text, transcript: transcript || undefined, audioBase64: b64 }` matches previous implementation exactly.
- **Exactly-once XP (10 private / 15 published) + DUBBING_TAKE quest:** Verified in `DubbingStudio.tsx:302-310` and `347-350`. `xpGivenRef` latches prevent double awards.
- **One-row-per-take:** Verified in `DubbingStudio.tsx:273` (`savedDubbingIdRef.current` guards take creation) and `343` (`publishDubbing` reuses the same row).
- **Snapshot-flush invariant (`finalBlobsRef`):** Verified in `DubbingStudio.tsx:80, 326-328`. Blobs are snapshotted into `finalBlobsRef.current` synchronously before `recorder.reset()` clears state, and read directly by `saveTake()`.
- **Storage paths & services untouched:** `DubbingService.ts` and `DubPlayer.tsx` have zero diff (`git diff HEAD~1` empty). Storage audio paths and retention remain untouched.

---

#### 2. Gem Latch Integrity — PASS
- Verified in `DubbingStudio.tsx:86, 165, 353-360, 378`.
- `gemGivenRef` initializes `false`, resets on `openClip` (line 165) and `tryAgain` (line 378).
- Inside `shareWithClass`, `gemGivenRef.current = true` is set synchronously prior to `awardGems`, preventing double-fire even if rapid multi-taps occur during async dispatch.
- Gem badge `+1 💎` on the Share button strictly conditional on `!published && overallBand === 'great'` (line 767).

---

#### 3. Karaoke `windowProgress` Signal — PASS
- Verified in `useDubRecorder.ts:80-87, 127, 256-263` and `DubbingStudio.tsx:580-588`.
- Signal is purely additive: exposes `windowProgress: number`.
- Rounded via `Math.round(... * 100) / 100` (2 decimal places) so `setState` bails out when progress hasn't advanced by a full percent, preventing 60fps render churn.
- In `DubbingStudio.tsx:585`, lead-in fills (`windowProgress`) and capture drains (`1 - windowProgress`) with distinct colors (`bg-[#E9C46A]` lead-in, `bg-[#E76F51]` capture).

---

#### 4. Sanctioned `StudentApp.tsx` Edit — PASS
- Verified in `apps/student/StudentApp.tsx:226`.
- Exactly one change: replaced `onBack={() => handleLessonComplete({ xp: 5, accuracy: 95, time: '2:30' })}` with `onBack={() => navigate('/student')}`. No other edits made.

---

#### 5. Kid-Alone UX & Recovery — PASS
- **Recovery paths:** Clear recovery on mic unsupported (lines 384-398), video load error (lines 170-174), and invalid timing boundaries (lines 152-156).
- **Pass-done review:** Shows line transcripts, real-time score badges, individual line redo triggers (`rerecordLine`), and a high-contrast primary CTA to proceed.
- **Score-pending honesty:** If STT scoring is delayed or down, the UI renders "Score pending" with 0 stars and no invented scores or false gem promises (lines 701, 717, 744, 767).

---

#### 6. Theme Consistency & Visual Guidelines — PASS
- Full light-palette conformance: `#EAE0D0` canvas, `#FDFBF7` cream cards, `#E2D7C3` sand borders, `#1D3557` navy typography, `#2A9D8F` emerald accents, `#E76F51` terracotta hearts.
- Zero owl or animal mascots across all files; empty state uses geometric TV/video shapes (`DubbingStudio.tsx:456-461`).
- Chinese characters are restricted strictly to support surfaces (empty state hint `你的老师会布置配音任务` at line 464); recording prompts remain in English.

---

#### 7. Findings & Observations (P2/P3)

- **F1 · P2 (Performance / Leak) — Blob URLs unrevoked across clip changes and back navigation:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:158`, `334`, `419`.
  - *Detail:* `URL.createObjectURL(blob)` created in `goResult` (line 332) are only revoked in `tryAgain` (line 370) and component unmount (line 137). If a child exits via the Back button to 'pick' (line 419) and selects another clip (line 158), previous blob URLs remain in memory until the studio unmounts.
  - *Recommendation:* Add `Object.values(blobUrlMap.current).forEach(URL.revokeObjectURL); blobUrlMap.current = {};` inside `openClip` and `goResult` (before reassigning).

- **F2 · P2 (Race Condition) — In-flight STT evaluation race on rapid "See my results" tap:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:183-192`, `286-297`, `326-337`.
  - *Detail:* If a child taps "See my results" immediately upon completing the final line while `evaluateLine` is still in flight, `saveTake` persists the database row with incomplete `perLineScores` and an incomplete `overallBand`. Once `savedDubbingIdRef.current` is set, the take row is not updated when `evaluateLine` eventually resolves in local state.
  - *Recommendation:* Disable the "See my results" button or show a brief "Scoring last line…" spinner while any line in `lineScores` is unresolved.

- **F3 · P2 (UX / Idempotency) — "Share with class" button missing `isPublishing` loading state:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:762-766`.
  - *Detail:* Button is disabled by `disabled={saveState === 'saving' || published}`. During `DubbingService.publishDubbing(dubbingId)`, `saveState` is `'saved'` and `published` is `false`. A slow network connection allows rapid repeated clicks dispatching duplicate publish calls (though `gemGivenRef` prevents double gem awards).
  - *Recommendation:* Introduce an `isPublishing` boolean state and disable/spin during publish.

- **F4 · P3 (UI Glitch) — Line counter badge during single-line redo:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:554`.
  - *Detail:* The counter expression `LINE {Math.min(Math.max(recorder.activeLineIndex + 1, recordedCount + 1), lines.length)} / {lines.length}` evaluates to `LINE 3 / 3` when re-recording line 1 because `recordedCount` is already 3.
  - *Recommendation:* If `recorder.activeLineIndex >= 0`, display `recorder.activeLineIndex + 1` directly.

- **F5 · P3 (UX) — Misleading "Next: [text]" subtitle during single-line redo:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:403, 569-571`.
  - *Detail:* During a single-line redo of line 1, `recNextLine` shows "Next: [Line 2 text]", although the recording loop stops immediately after line 1.

- **F6 · P3 (UX) — Absence of exit confirmation on active recording:**
  - *Evidence:* `apps/student/DubbingStudio.tsx:416-420`.
  - *Detail:* Tapping the back button during `phase === 'record'` immediately cancels the take and returns to 'pick' without confirmation.

---

**Gauntlet Status:**
- `tsc --noEmit`: 0 errors.
- `vitest run`: 83 test files passed (826 passed, 1 skipped).
- `vite build`: Clean production build (PWA sw.js precache generated, `DubbingStudio` & `ClassDubs` chunks cleanly bundled).

**Recommendation:** `SAFE-TO-FLAG`. Proceed to owner flag-flip step.
