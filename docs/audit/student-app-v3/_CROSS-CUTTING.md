# Cross-cutting themes & open decisions — student-app-v3

Themes and decisions that span multiple surfaces. Owner decisions recorded here before they gate any design work.

## 0. ✅ OWNER DIRECTION (2026-09-13, verbatim intent) — the ground rules for this round

> "I will let you audit and let Anti-Gravity audit properly every game, every game interaction, the workflow, the user flow, the … pedagogic flow, etc. … and figure out where are the issues. About the theme — actually we have implemented on the first page some kind of wonder atlas, but actually I like very much the Duolingo style white and pink … So for the new stitch design creation I want a mix between those both. We don't change the screens already implemented, but some games are still good but some deserve refinement — some a very big improvement and some just a slight improvement. So for each game I want Anti[-Gravity] to recreate the different screens with codes that we can reuse, but I want to validate them first, and in case there is some screen I don't like I will be able to modify through Stitch. … We will do the first game [first], I will review the Stitch file, make my comment to Anti-Gravity if needed and bring it back to you for you to analyze [whether] it's properly implemented. The home screen for the student will not be changed — the design is not bad right now — but it still can be audited about functionality. Actually the whole student app needs to be audited about functionality."

Decoded into operating rules:
1. **Full functionality audit of everything** (ZCode §1–§3 + Anti-Gravity §4) BEFORE/alongside redesigns — every game, interaction, workflow, user flow, pedagogical flow.
2. **Design language for redesigned games = a MIX of the current two light systems**: "Wonder Atlas" (home-page cream/paper/teal/terracotta warmth) × "Duolingo white + pink" (the lesson screens' clean white cards + `duo-pink` accents). NOT the board's dark-navy v3 identity. Per-game personality may still vary within that light world.
3. **Student HOME page design is FROZEN** — functionality audit only (file 01), no Stitch redesign.
4. **Screens that are already good stay as implemented** — only games needing refinement get recreated; expect a mix of big and slight improvements. The §4/§3 audits decide which bucket each game falls in.
5. **AG recreates screens as reusable code** (production-grade Tailwind HTML → adapted nearly verbatim into the React component), **owner validates every screen before implementation**, and the owner can himself iterate a screen inside Stitch when he dislikes it.
6. **Pilot-first workflow**: game #1 runs the full loop (audit → AG §4 + Stitch → owner review/comments → AG fixes → ZCode verifies implementation) to prove the flow before the batch.

_(Supersedes the earlier "light vs dark" open question below — kept for history.)_

## 1. ~~Light vs dark~~ RESOLVED by §0 — mix Wonder Atlas × Duolingo white/pink; home frozen

The app's two current light systems are the PARENTS of the new mix: `wa-*` "Wonder Atlas" (cream `bg-wa-cream`, paper cards, teal/terracotta, Fredoka display — Home Map, Shop/Profile area) and `duo-*` Duolingo-style (white cards, `duo-pink`/`duo-blue`/`duo-red` on slate-50 — lesson shell, battery, most games). New Stitch designs for redesigned games blend both; the board's v3 dark-navy tokens are NOT the base. The owner's root draft prompts (`PROMPT_STITCH_STUDENT_APP_UI.md` / `_SCREENS.md`) predate this decision — treat their **content checklists** (28 screens, realistic kid content) as useful input, their **process** (4-direction brainstorm) as superseded. The files remain owner WIP — never commit without asking.

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
