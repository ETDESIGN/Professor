# Tier-1 batch + XP↔Gems parity + dubbing fixes (owner-approved 2026-09-14)

## 0. Owner decisions (verbatim intent)

- **Tier 1: YES to all** (legacy deletion, gem→hearts RPC, dubbing P3s, fidelity pass, Arena tiles).
- **Gems economy — REDEFINED by owner, supersedes the 3★-gate advice:** "whatever XP student receives — whether in the student app or during the live lesson — he should receive the same amount in gems; XP only increases, gems decrease only when spent." ⇒ **Gems mirror positive XP 1:1 at every award source.** Go-forward (no retroactive backfill — spend history doesn't exist to reconcile). Perfect-lesson gem gate becomes redundant → removed.
- **Dubbing fixes:** (1) student can't re-watch his own take after finishing; (2) publish must NOT look paid — the +1💎 badge was misread as a cost → copy must say "Earn"; (3) gallery cards want a movie image + student avatar; (4) gallery player shows a still frame, video never runs (root cause: DubPlayer has no play UI and nothing calls its imperative play()).

## 1. ZCode's part (economy + routing — DB & guarded files)

1. **Migration `20260914000001_gems_mirror_xp.sql`**: `CREATE OR REPLACE award_xp` and `award_xp_to_student` — both UPDATEs also `gems = gems + GREATEST(p_amount, 0)`. Atomic, covers student-app + live lessons + any future caller. Apply via Management API + record in schema_migrations.
2. **StudentApp.tsx surgical edits (4):** (a) remove the 5★-gate gem block in `finalizeLesson` (parity pays it); (b) remove LessonSession import + `/student/lesson` route (dead code companion to the trio deletion); (c) add `/student/listening` route → `ListeningPractice` wrapper; (d) add `/student/grammar` route → `GrammarPractice` wrapper (AG builds both, PhonicsPhlyer pattern).
3. **Heart-refill RPC** (`20260914000002_refill_hearts_gems.sql`): `refill_hearts_gems(p_cost 50)` — atomic: verify gems ≥ cost → gems −50, hearts = min(HEARTS_MAX, hearts+5); returns new balances; student-caller only. Then enable the modal's gem button (client calls the RPC; `apps/student/exercises/ExerciseRunner.tsx` + `HeartRefillModal.tsx` — AG wires, RPC is mine).

## 2. Anti-Gravity's part (disjoint files)

**Dubbing playback & UX** (`components/shared/DubPlayer.tsx`, `apps/student/DubbingStudio.tsx`, `apps/student/ClassDubs.tsx`):
- DubPlayer: visible play/pause overlay + tap-to-toggle (fixes still-frame bug on BOTH result + gallery; keep the imperative handle).
- Studio Pick: dubbed clips get a **"Watch my dub"** button → own-take overlay (video + own signed line-audio via DubPlayer; reuse `myDubs()` + `signedUrl`, pattern from ClassDubs.openDub).
- Share button badge: `+1 💎` → **"Earn +1 💎"** (explicit reward, not a cost).
- ClassDubs cards: first-frame thumbnail via one signed `<video preload="metadata" muted>` per active clip shared by its cards + prominent student avatar chip.
- Gallery overlay: autoplay on open (user gesture precedes; call play() after mount).
- P3s: redo-mode counter/next-line corrections + exit-confirm during the record pass.

**Tier-1 rest:**
- Delete `apps/student/LessonSession.tsx`, `ListenTap.tsx`, `SentenceScramble.tsx` (ZCode removes StudentApp's import/route; FlashMatch stays).
- `apps/student/PracticeMenu.tsx`: un-disable Listening + Grammar tiles → new routes.
- NEW wrappers `apps/student/ListeningPractice.tsx` + `GrammarPractice.tsx` (PhonicsPhlyer pattern: activeUnit pool query — LISTEN_SELECT/AUDIO_L1_SELECT family and GRAMMAR_FILL/TRANSFORM/ERROR_SPOT family — through ExerciseRunner; unit picker fallback per the Phonics lobby fix).

## 3. Sacred / unchanged

All existing award latches (XP exactly-once patterns become the gems guarantee too — the RPC is idempotent per call, callers keep their exactly-once semantics); hearts model; quest gem rewards stay ON TOP; spend paths untouched; dubbing timing/scoring/economy latches untouched (the +1 great-gem stays as approved).

## 4. Steps

ZCode: migration×2 → apply+record → StudentApp edits. AG: §2 in one run. Gauntlet (tsc/vitest/build) → deploy → verify (`/student` last-modified + a live RPC probe of award_xp mirroring gems on the pipeline account). Fidelity pass + report close-out.
