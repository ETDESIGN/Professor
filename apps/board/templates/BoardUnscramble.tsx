// BoardUnscramble v2 — sentence-assembly game (PRACTICE phase).
//
// Rewritten per unscramble-storysequencing-v2-spec.md Part A:
//   • TWO round types on one tile UI (spec A2): WORD_BANK_BUILD (vocab ladder
//     rung 5) and TRANSFORM (grammar ladder rung 3, "path b" — the correct
//     MCQ option becomes the assembly target; prompt_sentence is the
//     reference line). The two-ladder eligibility model (spec A0) is handled
//     by lessonDirector.buildRound via SHELL_CAPABILITIES.UNSCRAMBLE.
//   • LCS partial credit (spec A1): right words / wrong order now pays
//     something. Below PARTIAL_PASS_THRESHOLD (0.5) = full miss.
//   • Targeted feedback (spec A1): a clean adjacent swap highlights exactly
//     those two tiles ("swap these!"); anything messier highlights just the
//     first wrong position (narrowed hint, never overclaimed precision).
//   • Lifecycle + scoring (spec A3): standard 4-must-dos, dual-write on every
//     scored event — addPoints (leaderboard) + recordAttempt (analytics,
//     correctness 'correct'|'partial'|'incorrect') + gradeObjective (FSRS).
//
// Field names verified against types/exercise.ts (spec correction 2026-08-05):
//   WordBankBuildContent { target_sentence, word_bank[], translation?, audio_url? }
//   TransformContent     { prompt_sentence, instruction, options[], correct_index }

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, RefreshCcw, ArrowRight, ArrowLeftRight, Lightbulb } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playCue } from './playCue';
import type { ContextualControlsSpec } from '../lessonDirector';
import type { PoolItem } from '../../../types/exercise';

// ── LCS partial credit (spec A1) ─────────────────────────────────────────
// Exported so BoardStorySequencing reuses the exact same algorithm (spec B2:
// panel ids stand in for tiles).

export function lcsLength(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

export function computeLCSPartialCredit(placedTiles: string[], targetTiles: string[]): number {
  if (targetTiles.length === 0) return placedTiles.length === 0 ? 1 : 0;
  return lcsLength(placedTiles, targetTiles) / targetTiles.length;
}

export const UNSCRAMBLE_PASS_THRESHOLD = 0.5; // below this = full miss, not a low partial

export function detectSwappedPair(placed: string[], target: string[]): [number, number] | null {
  if (placed.length !== target.length) return null;
  const diffPositions = target.map((_, i) => i).filter((i) => placed[i] !== target[i]);
  if (diffPositions.length === 2) {
    const [a, b] = diffPositions;
    if (b === a + 1 && placed[a] === target[b] && placed[b] === target[a]) return [a, b];
  }
  return null;
}

export function highlightFirstWrongPosition(placed: string[], target: string[]): number {
  for (let i = 0; i < placed.length; i++) {
    if (placed[i] !== target[i]) return i;
  }
  return placed.length < target.length ? placed.length : -1;
}

// ── Round normalization (spec A2) ────────────────────────────────────────
export interface AssemblyRound {
  id: string;
  objectiveId: string;
  exerciseType: 'WORD_BANK_BUILD' | 'TRANSFORM';
  difficulty: 1 | 2 | 3;
  /** undefined for WORD_BANK_BUILD; = content.prompt_sentence for TRANSFORM. */
  promptText?: string;
  /** TRANSFORM only (e.g. "Make it negative"). */
  instruction?: string;
  /** L1 context line for WORD_BANK_BUILD. */
  translation?: string;
  /** Target sentence split into word tiles. */
  targetTiles: string[];
  /** Candidate tiles (word_bank for WBB; shuffled target for TRANSFORM path b). */
  trayTiles: string[];
}

const shuffle = <T,>(a: T[], rng: () => number = Math.random): T[] => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/** FIXPLAN E1.5 — pass a seeded rng so both tabs normalize the item to the
 *  identical tray. Defaults to Math.random for tests/legacy callers. */
export function normalizeToAssemblyRound(item: PoolItem, rng: () => number = Math.random): AssemblyRound | null {
  const base = {
    id: item.id,
    objectiveId: item.objective_id,
    exerciseType: item.exercise_type as AssemblyRound['exerciseType'],
    difficulty: item.difficulty,
  };
  const c = item.content as any;
  if (item.exercise_type === 'WORD_BANK_BUILD') {
    // target_sentence is the assembly target; word_bank already carries the
    // candidate set (generator-shuffled — no client shuffle needed when present).
    if (!c?.target_sentence) return null;
    const target = String(c.target_sentence).split(/\s+/).filter(Boolean);
    const bank = Array.isArray(c.word_bank) && c.word_bank.length > 0
      ? c.word_bank.map((w: any) => String(w))
      : shuffle(target, rng);
    return { ...base, targetTiles: target, trayTiles: bank, translation: c.translation };
  }
  if (item.exercise_type === 'TRANSFORM') {
    // Path b: the CORRECT option is the assembly target; prompt_sentence is
    // the reference line shown above the tray.
    const correctOption = String(c?.options?.[c.correct_index] ?? '');
    if (!correctOption) return null;
    const target = correctOption.split(/\s+/).filter(Boolean);
    return { ...base, promptText: c.prompt_sentence, instruction: c.instruction, targetTiles: target, trayTiles: shuffle(target, rng) };
  }
  return null;
}

// ── Constants ─────────────────────────────────────────────────────────────
const TOTAL_ROUNDS = 4; // spec A4: minimum 3 recommended; 4 gives a real ramp

// ── Contextual controls contract (architecture §4.1, spec A4) ─────────────
export const UNSCRAMBLE_ACTION_TYPES = {
  check: 'CHECK_ANSWER',
  skip: 'SKIP_ROUND',
  revealHint: 'REVEAL_HINT',
  forceCorrect: 'MARK_CORRECT',
  nextRound: 'NEXT_ROUND',
  endSlide: 'SLIDE_COMPLETE',
  reset: 'RESET_GAME',
} as const;

const noop = () => {};
export const UNSCRAMBLE_CONTROLS: ContextualControlsSpec = {
  shellType: 'UNSCRAMBLE',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: noop },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: noop }, // swap cue or first-wrong-position highlight
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    nextRound:    { label: 'Next', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
  },
};

// ── Component ─────────────────────────────────────────────────────────────
interface Tile { id: string; text: string; }
type Outcome = 'correct' | 'partial' | null;

const BoardUnscramble = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded tray deal (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phaseTag = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  const [roundIndex, setRoundIndex] = useState(1);

  // ── Escalating pool: WORD_BANK_BUILD (vocab rung 5) + TRANSFORM (grammar
  //    rung 3). buildRound applies the two-ladder eligibility floors (A0). ──
  const { items, loading } = useEscalatingPool({
    unitId,
    shellType: 'UNSCRAMBLE',
    phase: phaseTag,
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: 3, // over-pull so a skip/invalid item still leaves a fallback
  });

  // ── Frozen fallback (legacy data.words + data.targetSentence) ──────────
  const frozenRound: AssemblyRound | null = useMemo(() => {
    const words = Array.isArray(data?.words) ? data.words.map((w: any) => String(w)) : [];
    const targetSentence = typeof data?.targetSentence === 'string' ? data.targetSentence : '';
    if (words.length === 0 || !targetSentence) return null;
    const target = targetSentence.split(/\s+/).filter(Boolean);
    return {
      id: 'frozen-unscramble',
      objectiveId: 'frozen-unscramble',
      exerciseType: 'WORD_BANK_BUILD',
      difficulty: 1,
      targetTiles: target,
      trayTiles: words,
    };
  }, [data?.words, data?.targetSentence]);
  const usingFrozen = !!frozenRound;

  // This round's assembly item: first normalizable pool item, or frozen.
  const round: AssemblyRound | null = useMemo(() => {
    if (usingFrozen) return frozenRound;
    for (const it of items) {
      const r = normalizeToAssemblyRound(it, makeRng(seedBase, it.id));
      if (r) return r;
    }
    return null;
  }, [items, usingFrozen, frozenRound, seedBase]);

  // ── Tile state ────────────────────────────────────────────────────────
  const [tray, setTray] = useState<Tile[]>([]);
  const [placed, setPlaced] = useState<Tile[]>([]);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [lastRatio, setLastRatio] = useState(0);
  const [swapHint, setSwapHint] = useState<[number, number] | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number>(-1);
  const [isWrongFlash, setIsWrongFlash] = useState(false);
  const [slideComplete, setSlideComplete] = useState(false);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);
  /** Designed reveal (2nd failed check this round): the target sentence as
   *  in-order tiles, each colored green (student had the right word in that
   *  position) or amber (misplaced/missing) — BoardSentenceLab's
   *  placedFeedback pattern. Null when not revealing. */
  const [revealTiles, setRevealTiles] = useState<{ word: string; inPlace: boolean }[] | null>(null);

  // ── Lifecycle refs (the 4 must-dos) ───────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  /** Failed checks within the CURRENT round (reveal trigger — reset on round
   *  change and new turn via buildBoard). Distinct from mistakesRef, which is
   *  the turn-wide accumulation scoreForAttempt deducts against. */
  const roundMissesRef = useRef(0);
  // Slide-scoped streak for the picked responder (consecutive correct
  // rounds; reset on a failed check and a new turn). 4th arg to
  // scoreForAttempt — 3 = 1.25x, 5 = 1.5x.
  const streakRef = useRef(0);

  // ── Build/rebuild the tray for the current round ──────────────────────
  const buildBoard = useCallback((r: AssemblyRound | null) => {
    roundMissesRef.current = 0; // per-round reveal counter (round change / new turn / reset)
    setRevealTiles(null);
    if (!r) { setTray([]); setPlaced([]); return; }
    // games-v3 audit: the tray seed lacked the turn token — a re-dealt round
    // was pixel-identical ("Skip did nothing" perception). Still deterministic
    // per turn (every tab deals the same tray), but varies across picks.
    setTray(shuffle(r.trayTiles, makeRng(seedBase, r.id, state.currentTurnId ?? 'practice', 'tray')).map((w, i) => ({ id: `t-${i}-${w}`, text: w })));
    setPlaced([]);
    setOutcome(null);
    setLastRatio(0);
    setSwapHint(null);
    setWrongIdx(-1);
    setIsWrongFlash(false);
  }, []);

  const buildSigRef = useRef('');
  useEffect(() => {
    if (!round) return;
    const sig = `${round.id}|${roundIndex}`;
    if (buildSigRef.current === sig) return;
    buildSigRef.current = sig;
    buildBoard(round);
  }, [round, roundIndex, buildBoard]);

  // ── Tile moves (broadcast for multi-board-tab sync, as before) ────────
  const handleTileClick = useCallback((tile: Tile, from: 'bank' | 'placed') => {
    if (outcome || revealTiles) return;
    triggerAction('UNSCRAMBLE_MOVE', { wordId: tile.id, from });
  }, [outcome, revealTiles, triggerAction]);

  // ── Dual-write + cognitive capture ────────────────────────────────────
  const doScoring = useCallback((correctness: 'correct' | 'partial' | 'incorrect', points: number, r: AssemblyRound, passed: boolean) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (points !== 0) addPoints(picked, points);
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId: r.objectiveId.startsWith('frozen') ? undefined : r.objectiveId,
      exerciseType: r.exerciseType,
      difficulty: r.difficulty,
    }).catch(() => {});
    // FSRS write via the REAL objective id (both round types are productive).
    if (unitId && !r.objectiveId.startsWith('frozen')) {
      gradeObjective(picked, unitId, r.objectiveId, passed, 'productive').catch(() => {});
    }
    if (correctness === 'incorrect') pushToRemediation(r.objectiveId, picked);
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── Round advancement + SLIDE_COMPLETE (spec A4) ──────────────────────
  const advanceRound = useCallback((opts?: { silent?: boolean }) => {
    if (slideComplete) return;
    if (roundIndex >= TOTAL_ROUNDS) {
      setSlideComplete(true);
      // Natural end (NEXT_ROUND on the last round) celebrates; a silent skip
      // ({ silent: true } from SKIP_ROUND) doesn't.
      if (!opts?.silent) playCue('win');
      triggerAction('SLIDE_COMPLETE', { forced: !!opts?.silent ? true : false });
    } else {
      setRoundIndex((r) => r + 1);
    }
  }, [roundIndex, slideComplete, triggerAction]);

  const afterResolve = useCallback(() => {
    setTimeout(() => {
      if (roundIndex >= TOTAL_ROUNDS) {
        setSlideComplete(true);
        playCue('win'); // natural completion after real play
        triggerAction('SLIDE_COMPLETE', { forced: false });
      } else {
        setRoundIndex((r) => r + 1);
      }
    }, 2400);
  }, [roundIndex, triggerAction]);

  // Auto-dismiss the terminal celebration after 6s. SLIDE_COMPLETE already
  // broadcast (above), so this is purely cosmetic — keeps the board from
  // sitting stuck behind "Great building!" if the teacher walks away.
  useEffect(() => {
    if (!slideComplete) return;
    setRevealTiles(null); // a final-round reveal must not outlive this overlay
    const t = setTimeout(() => setSlideComplete(false), 6000);
    return () => clearTimeout(t);
  }, [slideComplete]);

  // ── Submit (spec A3) ──────────────────────────────────────────────────
  const checkAnswer = useCallback(() => {
    if (!round || outcome || slideComplete || revealTiles) return;
    if (placed.length === 0) return;

    const placedTexts = placed.map((t) => t.text);
    // Punctuation-stripped comparison on both sides (legacy behavior kept).
    const strip = (s: string) => s.replace(/[.,!?;:]/g, '');
    const ratio = computeLCSPartialCredit(placedTexts.map(strip), round.targetTiles.map(strip));

    if (ratio >= UNSCRAMBLE_PASS_THRESHOLD) {
      if (awardedRef.current) { showAlreadyScored(); return; }
      awardedRef.current = true;
      const clean = ratio >= 1;
      streakRef.current += 1; // bumped before scoring so the award sees it
      const points = scoreForAttempt(mistakesRef.current, round.difficulty, ratio, streakRef.current);
      setOutcome(clean ? 'correct' : 'partial');
      setLastRatio(ratio);
      doScoring(clean ? 'correct' : 'partial', points, round, true);
      playCue('correct');
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      afterResolve();
    } else {
      mistakesRef.current += 1;
      roundMissesRef.current += 1;
      setLastRatio(ratio);
      doScoring('incorrect', -MISTAKE_PENALTY, round, false);
      playCue('wrong');
      streakRef.current = 0;

      // 2nd failed check this round → designed reveal (replaces the endless
      // red-flash + hint loop): the target sentence as in-order tiles with
      // per-position coloring vs the current placement, ~2.4s teaching hold
      // (afterResolve's own timer), then advance. roundMissesRef resets on
      // round change / new turn via buildBoard.
      if (roundMissesRef.current >= 2) {
        playCue('reveal');
        setRevealTiles(round.targetTiles.map((w, i) => ({
          word: w,
          inPlace: strip(placedTexts[i] ?? '') === strip(w),
        })));
        afterResolve();
        return;
      }

      setIsWrongFlash(true);
      setTimeout(() => setIsWrongFlash(false), 900);
      // Targeted feedback (spec A1): clean adjacent swap → highlight exactly
      // those two tiles; messier diffs → first wrong position only.
      const swap = detectSwappedPair(placedTexts, round.targetTiles);
      if (swap) {
        setSwapHint(swap);
        setWrongIdx(-1);
      } else {
        setSwapHint(null);
        setWrongIdx(highlightFirstWrongPosition(placedTexts, round.targetTiles));
      }
    }
  }, [round, placed, outcome, slideComplete, revealTiles, doScoring, afterResolve, showAlreadyScored]);

  // ── Teacher controls ──────────────────────────────────────────────────
  const revealHint = useCallback(() => {
    if (!round || outcome || revealTiles) return;
    const placedTexts = placed.map((t) => t.text);
    if (placedTexts.length === 0) return;
    const swap = detectSwappedPair(placedTexts, round.targetTiles);
    if (swap) { setSwapHint(swap); setWrongIdx(-1); }
    else { setSwapHint(null); setWrongIdx(highlightFirstWrongPosition(placedTexts, round.targetTiles)); }
  }, [round, placed, outcome, revealTiles]);

  const forceCorrect = useCallback(() => {
    if (!round || outcome || slideComplete || revealTiles) return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    awardedRef.current = true;
    streakRef.current += 1; // teacher-confirmed oral answer counts toward the streak
    const points = scoreForAttempt(mistakesRef.current, round.difficulty, 1.0, streakRef.current);
    setOutcome('correct');
    setLastRatio(1);
    doScoring('correct', points, round, true);
    playCue('correct');
    if (streakRef.current === 3 || streakRef.current === 5) {
      playCue('streak');
      triggerConfetti();
    }
    afterResolve();
  }, [round, outcome, slideComplete, revealTiles, doScoring, afterResolve, showAlreadyScored]);

  const skipRound = useCallback(() => {
    advanceRound({ silent: true });
  }, [advanceRound]);

  // ── Remote/commander action listener ──────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'CHECK_ANSWER': checkAnswer(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'SKIP_ROUND': skipRound(); break;
      case 'NEXT_ROUND': advanceRound(); break;
      case 'RESET_GAME':
        mistakesRef.current = 0;
        awardedRef.current = false;
        streakRef.current = 0;
        buildSigRef.current = '';
        buildBoard(round);
        break;
      case 'UNSCRAMBLE_MOVE': {
        const { wordId, from } = action.payload || {};
        setSwapHint(null);
        setWrongIdx(-1);
        if (from === 'bank') {
          setTray((prev) => {
            const tile = prev.find((t) => t.id === wordId);
            if (tile) {
              setPlaced((p) => [...p, tile]);
              return prev.filter((t) => t.id !== wordId);
            }
            return prev;
          });
        } else {
          setPlaced((prev) => {
            const tile = prev.find((t) => t.id === wordId);
            if (tile) {
              setTray((b) => [...b, tile]);
              return prev.filter((t) => t.id !== wordId);
            }
            return prev;
          });
        }
        break;
      }
      case 'SLIDE_COMPLETE': setSlideComplete(true); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Game-lifecycle: new responder (NEW_TURN) → fresh turn refs + board ─
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = practice mode
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0; // fresh responder → fresh streak
    buildBoard(round); // also zeroes roundMissesRef + clears the reveal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Empty / loading state (spec A4: an empty slide isn't acceptable) ──
  if (loading || (!round && !usingFrozen)) {
    const empty = !loading && !round;
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-bold text-slate-500 mb-2">Unscramble</h1>
        <p className="text-slate-600 text-xl max-w-xl">
          {loading ? 'Loading…' : "Content isn't ready for this round yet. Generate the exercise pool for this unit."}
        </p>
        {empty && (
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Slide
          </button>
        )}
      </div>
    );
  }

  const isTransform = round?.exerciseType === 'TRANSFORM';
  const canCheck = !!round && placed.length >= round.targetTiles.length && !outcome;
  const targetLen = round?.targetTiles.length ?? 0;

  // ── Render pieces (v3 "Syntax Workshop" per stitch/12-unscramble) ──────

  // Header. BoardShell's phase pill occupies the top-left ~164px —
  // pl-32/lg:pl-48 keeps the U badge clear (same as Word Search/Listen&Tap).
  const header = (
    <header className="w-full flex items-center justify-between gap-3 pr-1 pl-32 lg:pl-48 h-12 lg:h-14 [@media(max-height:450px)]:h-8 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 lg:w-10 lg:h-10 [@media(max-height:450px)]:w-6 [@media(max-height:450px)]:h-6 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-lg lg:text-xl [@media(max-height:450px)]:text-xs flex items-center justify-center shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)] shrink-0">
          U
        </div>
        <div className="min-w-0">
          <p className="un-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400 leading-none [@media(max-height:450px)]:hidden">
            {isTransform ? 'Transform Workshop' : 'Syntax Workshop'}
          </p>
          <h1 className="text-lg lg:text-xl [@media(max-height:450px)]:text-sm font-bold tracking-tight text-white leading-tight truncate">
            {isTransform ? 'Transform It' : 'Unscramble'}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 [@media(max-height:450px)]:py-0.5 rounded-lg bg-slate-800/90 border border-slate-700 shrink-0">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="un-mono text-[10px] lg:text-xs font-bold text-slate-200">Round {roundIndex}/{TOTAL_ROUNDS}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!outcome && !slideComplete && !revealTiles && (
          <button onClick={revealHint} title="Hint (swap cue / first wrong spot)"
            className="px-2.5 lg:px-4 py-1.5 lg:py-2 [@media(max-height:450px)]:py-1 [@media(max-height:450px)]:px-2 rounded-xl border border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors active:scale-95 flex items-center gap-1.5">
            <Lightbulb size={13} /> Clue
          </button>
        )}
        <button onClick={() => triggerAction('RESET_GAME')} title="Re-deal this round"
          className="p-2 [@media(max-height:450px)]:p-1 bg-slate-800/90 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
          <RefreshCcw size={14} />
        </button>
      </div>
    </header>
  );

  // Task frame plate (design #1 upper section). No per-sentence photo exists
  // in WORD_BANK_BUILD/TRANSFORM content — the plate is full-width (fidelity
  // log #1). The stem shows only SLOT COUNT blanks, never a revealed word.
  const taskFrame = (
    <section className="w-full shrink-0 rounded-2xl bg-[#0B132B]/90 border border-slate-700/70 px-4 lg:px-6 py-2.5 lg:py-4 [@media(max-height:450px)]:py-1 [@media(max-height:450px)]:px-2.5 flex flex-col gap-2 [@media(max-height:450px)]:gap-1 relative">
      <div className="flex items-center justify-between gap-3 [@media(max-height:450px)]:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="un-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[9px] lg:text-[10px] font-bold uppercase tracking-widest shrink-0">
            Task {String(roundIndex).padStart(2, '0')}
          </span>
          <span className="text-slate-400 text-xs lg:text-sm font-medium truncate">
            {isTransform ? (round?.instruction || 'Rewrite the sentence.') : 'Build the sentence:'}
          </span>
        </div>
        <span className="un-mono text-[9px] lg:text-[10px] text-slate-500 hidden sm:flex items-center gap-1.5 shrink-0">
          <span className="text-emerald-400 font-bold">{targetLen} words</span>· tap or drag blocks
        </span>
      </div>

      {/* Reference line: TRANSFORM original (path b) or L1 translation clue */}
      <div className="rounded-xl bg-[#070C18]/90 border-2 border-slate-800 px-3.5 lg:px-5 py-2 lg:py-3 [@media(max-height:450px)]:py-1 [@media(max-height:450px)]:px-2.5 flex items-center gap-3 min-h-0 overflow-hidden">
        {isTransform ? (
          <>
            <span className="un-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-cyan-400 font-bold shrink-0">Original</span>
            <span className="text-base lg:text-xl [@media(max-height:450px)]:text-sm font-bold text-white truncate">{round?.promptText}</span>
          </>
        ) : (
          <>
            <span className="un-mono text-[9px] lg:text-[10px] uppercase tracking-widest text-amber-400/80 font-bold shrink-0">Clue</span>
            <span className={`text-base lg:text-xl [@media(max-height:450px)]:text-xs font-medium truncate ${round?.translation ? 'text-slate-300' : 'text-slate-500'}`}>
              {round?.translation || `${targetLen} words — put them in order`}
            </span>
            <span className="ml-auto hidden md:flex items-center gap-1 shrink-0" aria-hidden>
              {round?.targetTiles.map((_, i) => (
                <span key={i} className="un-mono text-slate-600 text-lg tracking-widest font-bold">__</span>
              ))}
            </span>
          </>
        )}
      </div>
    </section>
  );

  // Sentence runway (design #1 middle): N numbered dashed slots; filled slots
  // render the design-#2 amber "snapped" block.
  const runway = (
    <section className={`w-full flex-1 min-h-0 rounded-2xl bg-[#070C18]/70 border px-3 lg:px-5 py-2 lg:py-3 [@media(max-height:450px)]:py-1 [@media(max-height:450px)]:px-2 flex flex-col justify-center gap-2 [@media(max-height:450px)]:gap-1 relative
      ${isWrongFlash ? 'border-rose-500/70 un-shake' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between gap-3 [@media(max-height:450px)]:hidden">
        <span className="un-mono text-[9px] lg:text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold shrink-0">
          Sentence Runway
        </span>
        <span className="text-[10px] text-slate-500 hidden sm:inline">tap a block to send it back</span>
      </div>
      <div className="grid gap-2 lg:gap-4 [@media(max-height:450px)]:gap-1 flex-1 min-h-0"
        style={{ gridTemplateColumns: `repeat(${Math.max(targetLen, 1)}, minmax(0, 1fr))` }}>
        {Array.from({ length: Math.max(targetLen, placed.length) }).map((_, i) => {
          const tile = placed[i];
          const inSwapHint = swapHint !== null && (swapHint[0] === i || swapHint[1] === i);
          const isWrongSpot = wrongIdx === i;
          if (!tile) {
            return (
              <div key={`slot-${i}`}
                className={`rounded-xl border-2 border-dashed flex items-center justify-center gap-1.5 min-h-0 transition-all
                  ${i === placed.length && !outcome ? 'border-cyan-400/70 bg-cyan-950/20 un-slot-glow' : 'border-slate-700 bg-slate-900/40'}`}>
                <span className={`un-mono w-5 h-5 lg:w-6 lg:h-6 [@media(max-height:450px)]:w-4 [@media(max-height:450px)]:h-4 rounded-md flex items-center justify-center text-[10px] lg:text-xs [@media(max-height:450px)]:text-[9px] font-bold
                  ${i === placed.length && !outcome ? 'bg-cyan-400/15 border border-cyan-400/50 text-cyan-300' : 'bg-slate-800 border border-slate-700 text-slate-500'}`}>
                  {i + 1}
                </span>
                <span className="un-mono text-slate-600 text-lg hidden lg:inline">____</span>
              </div>
            );
          }
          return (
            <button key={tile.id} onClick={() => handleTileClick(tile, 'placed')}
              className={`rounded-xl border-2 flex flex-col items-center justify-center min-h-0 px-1 lg:px-2 [@media(max-height:450px)]:py-0.5 transition-all active:scale-95 animate-pop-in group
                ${outcome === 'correct' ? 'border-emerald-400 bg-emerald-950/40'
                  : outcome === 'partial' ? 'border-amber-400 bg-amber-950/30'
                  : 'border-amber-500/70 bg-[#111C3D] un-snapped'}
                ${inSwapHint ? 'ring-4 ring-amber-400/70 animate-pulse' : ''}
                ${isWrongSpot ? 'ring-4 ring-rose-500' : ''}`}>
              <span className="un-mono text-[8px] lg:text-[9px] uppercase tracking-widest text-amber-400/90 font-bold leading-none mb-0.5 hidden sm:block [@media(max-height:450px)]:!hidden">
                {String(i + 1).padStart(2, '0')} · {outcome ? 'Locked' : 'Tap to remove'}
              </span>
              <span className={`font-extrabold tracking-tight truncate w-full text-center [@media(max-height:450px)]:text-xs
                ${targetLen > 5 ? 'text-sm lg:text-xl' : targetLen > 3 ? 'text-lg lg:text-2xl' : 'text-xl lg:text-3xl'}
                ${outcome === 'correct' ? 'text-emerald-300' : outcome === 'partial' ? 'text-amber-300' : 'text-amber-300'}`}>
                {tile.text}
              </span>
            </button>
          );
        })}
      </div>
      {/* Targeted feedback chips (kept from v2 logic, v3-styled) */}
      {isWrongFlash && (
        <div className="absolute -top-2.5 right-3 bg-rose-500 text-white text-[10px] lg:text-xs font-bold px-3 py-1 rounded-full animate-bounce">
          Try Again!
        </div>
      )}
      {swapHint && !outcome && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 text-[10px] lg:text-xs font-bold px-3.5 py-1 rounded-full flex items-center gap-1.5 animate-pop-in whitespace-nowrap">
          <ArrowLeftRight size={13} /> Swap these two!
        </div>
      )}
      {wrongIdx >= 0 && !outcome && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[10px] lg:text-xs font-bold px-3.5 py-1 rounded-full animate-pop-in whitespace-nowrap">
          Check spot {wrongIdx + 1}…
        </div>
      )}
    </section>
  );

  // Word bank tray (design #1 lower): tactile cyan blocks with pressed-shadow.
  // Distractor tiles are NOT visually marked during play — marking them would
  // give the answer away (fidelity log #2); grey styling is reveal-only.
  const wordBank = (
    <section className="w-full shrink-0 rounded-2xl bg-[#0B132B]/90 border border-slate-700/70 px-3 lg:px-5 py-2 lg:py-3 [@media(max-height:450px)]:py-1 [@media(max-height:450px)]:px-2.5 flex flex-col gap-2 [@media(max-height:450px)]:gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="un-mono text-[9px] lg:text-[10px] uppercase tracking-[0.18em] text-amber-300 font-bold">
            Word Bank
          </span>
          <span className="un-mono text-[9px] lg:text-[10px] text-slate-500">
            {tray.length} block{tray.length === 1 ? '' : 's'} left
          </span>
        </div>
        {/* Compact inline check button for phone floor */}
        {!outcome && !slideComplete && !revealTiles && (
          <button onClick={checkAnswer} disabled={!canCheck}
            className={`[@media(min-height:451px)]:hidden px-3 py-1 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all
              ${canCheck
                ? 'bg-[#FF2E79] text-white shadow-[0_0_12px_-2px_rgba(255,46,121,0.6)] active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`}>
            <Check size={13} /> Check
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2 lg:gap-4 [@media(max-height:450px)]:gap-1.5">
        {tray.length === 0 && (
          <span className="un-mono text-slate-600 text-sm font-bold uppercase tracking-widest py-1">All blocks placed</span>
        )}
        {tray.map((tile) => (
          <button key={tile.id} onClick={() => handleTileClick(tile, 'bank')}
            className="un-block bg-cyan-400 text-slate-950 font-extrabold text-base lg:text-2xl [@media(max-height:450px)]:text-sm [@media(max-height:450px)]:px-2.5 [@media(max-height:450px)]:py-1 tracking-wide px-3.5 lg:px-6 py-2 lg:py-3 rounded-xl [@media(max-height:450px)]:rounded-lg border-t border-cyan-200 transition-all hover:-translate-y-0.5 active:translate-y-0.5 animate-pop-in">
            {tile.text}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="un-root h-full w-full flex flex-col gap-2 lg:gap-3 p-2 lg:p-4 [@media(max-height:450px)]:gap-1 [@media(max-height:450px)]:p-1 bg-[#070C18] relative overflow-hidden">
      <style>{`
        .un-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .un-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .un-block { box-shadow: 0 5px 0 0 #0e7490, 0 10px 20px -6px rgba(6,182,212,0.35); }
        .un-block:active { box-shadow: 0 1px 0 0 #0e7490; }
        .un-snapped { box-shadow: 0 0 18px -2px rgba(245,158,11,0.35), inset 0 0 14px rgba(245,158,11,0.08); }
        @keyframes un-slot-pulse { 0%, 100% { box-shadow: 0 0 8px -2px rgba(34,211,238,0.35); } 50% { box-shadow: 0 0 22px -2px rgba(34,211,238,0.7); } }
        .un-slot-glow { animation: un-slot-pulse 1.1s ease-in-out infinite; }
        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        @keyframes un-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-8px); } 40%, 80% { transform: translateX(8px); } }
        .un-shake { animation: un-shake 0.4s ease-in-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.35s ease-out; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
      `}</style>

      {header}

      {/* Amber-framed workshop panel (design #1 main) */}
      <main className="flex-1 min-h-0 w-full rounded-2xl lg:rounded-3xl bg-[#0F172A] border-2 border-amber-500/40 shadow-[0_0_36px_-12px_rgba(245,158,11,0.35)] p-2.5 lg:p-5 [@media(max-height:450px)]:p-1.5 flex flex-col gap-2 lg:gap-4 [@media(max-height:450px)]:gap-1 relative overflow-hidden">
        {/* Amber corner brackets (design accent) */}
        <div className="absolute top-0 left-0 w-5 h-5 lg:w-7 lg:h-7 border-t-4 border-l-4 border-amber-400/70 rounded-tl-2xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-5 h-5 lg:w-7 lg:h-7 border-t-4 border-r-4 border-amber-400/70 rounded-tr-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-5 h-5 lg:w-7 lg:h-7 border-b-4 border-l-4 border-amber-400/70 rounded-bl-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-5 h-5 lg:w-7 lg:h-7 border-b-4 border-r-4 border-amber-400/70 rounded-br-2xl pointer-events-none" />

        {taskFrame}
        {runway}
        {wordBank}

        {/* Check CTA — the single hot-pink primary (design's pink accent) */}
        {!outcome && !slideComplete && !revealTiles && (
          <div className="shrink-0 flex justify-center pt-0.5 [@media(max-height:450px)]:hidden">
            <button onClick={checkAnswer} disabled={!canCheck}
              className={`px-8 lg:px-10 py-2 lg:py-3 rounded-xl font-bold text-base lg:text-xl flex items-center gap-2.5 transition-all
                ${canCheck
                  ? 'bg-[#FF2E79] text-white shadow-[0_0_22px_-4px_rgba(255,46,121,0.6)] hover:shadow-[0_0_30px_-4px_rgba(255,46,121,0.8)] active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'}`}>
              <Check size={20} /> Check Answer
            </button>
          </div>
        )}
      </main>

      {/* Success / partial feedback overlay — click to dismiss early (v3 dark) */}
      {outcome && (
        <div
          onClick={() => setOutcome(null)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-[#111C3D] border-2 border-emerald-400/50 p-8 lg:p-12 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-subtle max-w-3xl">
            <div className={`w-24 h-24 lg:w-32 lg:h-32 rounded-full flex items-center justify-center mb-5 ${outcome === 'correct' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
              {outcome === 'correct' ? <Check size={56} strokeWidth={3} /> : <Lightbulb size={56} strokeWidth={2.5} />}
            </div>
            <h2 className="text-3xl lg:text-5xl font-black text-white mb-2">
              {outcome === 'correct'
                ? (pickedStudent ? `Nice one, ${pickedStudent.name}!` : 'Excellent!')
                : (pickedStudent ? `So close, ${pickedStudent.name}!` : 'So close!')}
            </h2>
            {outcome === 'partial' && (
              <p className="text-base lg:text-xl text-slate-400 font-medium mb-3">Almost there — {Math.round(lastRatio * 100)}% in the right order.</p>
            )}
            <p className="text-xl lg:text-3xl font-bold text-emerald-300 text-center">{round?.targetTiles.join(' ')}</p>
            <p className="text-xs text-slate-500 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Designed reveal (2nd failed check) — the target sentence in order,
          per-position colored vs what the student had placed: green = that
          position was already right, amber = misplaced/missing. A teaching
          hold (~2.4s via afterResolve), then the round advances. */}
      {revealTiles && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#111C3D] border-2 border-amber-400/50 p-8 lg:p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-subtle max-w-3xl">
            <div className="w-16 h-16 bg-amber-500/15 text-amber-400 rounded-full flex items-center justify-center mb-4">
              <Lightbulb size={36} strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl lg:text-3xl font-black text-white mb-1">Here's the sentence</h2>
            <p className="text-sm text-slate-400 mb-5 font-medium">
              <span className="text-emerald-400 font-bold">Green</span> = you had it right ·
              <span className="text-amber-400 font-bold"> Amber</span> = wrong spot
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {revealTiles.map((t, i) => (
                <span key={i}
                  className={`text-xl lg:text-3xl font-bold px-4 lg:px-6 py-2 lg:py-3 rounded-2xl shadow-md animate-pop-in
                    ${t.inPlace ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-950'}`}>
                  {t.word}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Already-scored chip */}
      {alreadyScoredChip && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800/95 border border-slate-600 text-white px-5 py-2 rounded-full font-bold text-sm animate-fade-in">
          already scored this turn
        </div>
      )}

      {/* Slide complete overlay — click to dismiss (v3 dark) */}
      {slideComplete && (
        <div
          onClick={() => setSlideComplete(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-[#111C3D] border-2 border-cyan-400/50 p-8 lg:p-12 rounded-3xl shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-24 h-24 lg:w-32 lg:h-32 bg-cyan-500/15 text-cyan-400 rounded-full flex items-center justify-center mb-5">
              <Check size={56} strokeWidth={3} />
            </div>
            <h2 className="text-3xl lg:text-5xl font-black text-white mb-2">
              {pickedStudent ? `Great building, ${pickedStudent.name}!` : 'Great building, everyone!'}
            </h2>
            <p className="text-lg lg:text-2xl text-slate-400 font-medium">Ready for the next slide.</p>
            <p className="text-xs text-slate-500 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardUnscramble;
