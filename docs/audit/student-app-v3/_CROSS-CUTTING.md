# Cross-cutting themes & open decisions — student-app-v3

Themes and decisions that span multiple surfaces. Owner decisions recorded here before they gate any design work.

## 1. ⚠️ Light vs dark — THE first owner decision (blocks design generation)

The student app currently runs **two light theme systems side by side**:
- **`wa-*` "Wonder Atlas"** (cream `bg-wa-cream`, paper cards, teal/terracotta accents, Fredoka display) — Home Map, header, join-class, Shop/Profile area, TerritoryIntro.
- **`duo-*` / slate Duolingo-style** (white cards, `duo-pink`/`duo-blue`/`duo-red`, slate-50) — lesson shell, WordLab, exercise battery, most practice games; a few slate-900 dark screens (engine steps 08/09/11, Pronunciation Coach, Lesson Complete).

The board's v3 identity (night navy `#070C18`, hot-pink `#FF2E79`, sky `#38BDF8`) was designed for a projector. The mission says "same v3 visual language where it fits — but let Stitch propose per-game personality."

**The owner's own draft prompts** (untracked at repo root, `PROMPT_STITCH_STUDENT_APP_UI.md` + `PROMPT_STITCH_STUDENT_SCREENS.md`, ~28-screen checklist) describe the current look as a working-but-generic "Duolingo clone" and ask Stitch to brainstorm **4 distinct directions** (one may evolve the current berry/light style) for the whole app — a different process than per-game personality on top of v3 tokens.

**Decision needed before AG generates anything:** (a) adopt v3 dark as the base with per-game personality, (b) run the owner's 4-direction brainstorm app-wide first and pick one, or (c) keep light and modernize per-game. Also: are the two root PROMPT_STITCH files superseded by this pipeline? (They are owner WIP — never committed without asking.)

## 2. Dead code (file 29)

`LessonSession.tsx` + `ListenTap.tsx` + `SentenceScramble.tsx` + embedded-mode PronunciationCoach are unreachable today (`/student/lesson` has no navigation path; HomeMap routes everything to the solo player). They carry fake HUD hearts (hardcoded 5/"4") and pre-battery contracts. **Recommend delete-or-archive decision** — keeping them invites confusion during redesign and untested code paths in the bundle.

## 3. Dubbing (file 30) stays flag-gated

`VITE_ENABLE_DUBBING=false` in prod. The dubbing chain (scans, evaluate-dubbing, retention) is real but the studio is mock-flagged (audit P1-5). Not in this redesign batch unless the owner unblocks it.

## 4. Hearts split-brain

- The **battery** (file 12) has REAL DB-backed hearts (`getHearts/loseHeart/restoreHeart`, productive-only, unread-balance guard, out-of-hearts exit).
- The **SoloLessonPlayer shell** (file 02) shows a decorative local `lives=5` that decrements on speed-quiz wrongs but **never gates anything** — a kid can hit 0 and continue forever (honest-UI issue).
- The **legacy trio** hardcodes hearts in dead headers.
Decision: unify on the battery's model (shell displays the real balance, or drop hearts from the shell entirely)?

## 5. Award-pattern discipline (verify at every implementation)

Exactly-once rules that any redesign must preserve verbatim:
- Lesson pipeline awards once at `finalizeLesson` (XP + 5★ gems + COMPLETE_LESSONS/EARN_XP quests).
- Standalone games self-award once (pattern A, `awardedRef` latch) — parent never re-awards.
- ExerciseRunner awards per-correct XP during play + LESSON_COMPLETE at finish + one heart restore.
- SRS exit awards capped XP (min(5, correct)) + REVIEW_WORDS quest.
- Client-graded speech passes are practice-only (`record:false`) — never learner-state/hearts/XP credit.
Double-award or miss-award = FSRS/economy corruption (worst bug class).

## 6. Empty-pool reality

Many production units still have empty `pool_items` (word-image backfill deferred; ~243 vocab rows imageless). The student app's answer everywhere is the 3-tier ladder (pool → `get_unit_bundle` vocab → clean empty-state with Continue). Every redesigned surface must keep a **visible way forward** for the kid alone — no dead-ends.

## 7. Screenshot fixture path (Phase B tooling)

Students authenticate via teacher-minted passports (`student-passports` edge fn, `@passport.local` emails, AES-GCM creds in `passport_secrets`). The games-v3 Playwright pattern adapts: mint a throwaway passport on the pipeline account's class → log in at `/login` (student tab) → walk `/student`. First capture lands with the pilot game's §0–§3. Phone viewport 390×844 @2x primary; 700×320 landscape secondary.
