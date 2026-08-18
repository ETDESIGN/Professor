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
    setTray(shuffle(r.trayTiles, makeRng(seedBase, r.id, 'tray')).map((w, i) => ({ id: `t-${i}-${w}`, text: w })));
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

  return (
    <div className="h-full bg-slate-900 flex flex-col p-8 font-display relative">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="bg-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/10">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-2xl font-bold ${isTransform ? 'bg-purple-500' : 'bg-duo-green'}`}>
            {isTransform ? '↻' : 'Abc'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{isTransform ? 'Transform It!' : 'Unscramble'}</h1>
            <p className="text-slate-400 text-sm">
              Round {roundIndex}/{TOTAL_ROUNDS} — {isTransform ? (round?.instruction || 'Rewrite the sentence.') : 'Build the correct sentence.'}
            </p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          {round?.exerciseType === 'WORD_BANK_BUILD' && round.translation && (
            <div className="bg-slate-800 px-5 py-3 rounded-xl border border-slate-700 text-slate-300 font-cn text-lg">
              {round.translation}
            </div>
          )}
          <button onClick={() => triggerAction('RESET_GAME')}
            className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white">
            <RefreshCcw />
          </button>
        </div>
      </div>

      {/* TRANSFORM reference line (path b — spec A2) */}
      {isTransform && round?.promptText && (
        <div className="max-w-5xl mx-auto w-full mb-6 flex items-center gap-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl px-6 py-4">
          <span className="text-purple-300 uppercase tracking-widest text-xs font-bold shrink-0">Original</span>
          <span className="text-2xl text-white font-bold">{round.promptText}</span>
        </div>
      )}

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 max-w-6xl mx-auto w-full">
        {/* Drop Zone */}
        <div className={`
          w-full min-h-[160px] bg-slate-800/50 rounded-3xl border-4 border-dashed transition-all duration-300 flex flex-wrap items-center justify-center p-6 gap-4 relative
          ${outcome === 'correct' ? 'border-green-500 bg-green-500/10'
            : outcome === 'partial' ? 'border-yellow-500 bg-yellow-500/10'
            : isWrongFlash ? 'border-red-500 bg-red-500/10 animate-shake'
            : 'border-slate-700'}
        `}>
          {placed.length === 0 && (
            <div className="text-slate-600 font-bold text-2xl uppercase tracking-widest pointer-events-none select-none">
              Drop Words Here
            </div>
          )}

          {placed.map((tile, i) => {
            const inSwapHint = swapHint !== null && (swapHint[0] === i || swapHint[1] === i);
            const isWrongSpot = wrongIdx === i;
            return (
              <button key={tile.id} onClick={() => handleTileClick(tile, 'placed')}
                className={`text-4xl font-bold px-8 py-4 rounded-2xl shadow-lg transition-all active:scale-95 animate-pop-in
                  ${outcome ? 'bg-white text-slate-900' : 'bg-white text-slate-900 hover:bg-red-50 hover:text-red-500'}
                  ${inSwapHint ? 'ring-4 ring-yellow-400 animate-pulse' : ''}
                  ${isWrongSpot ? 'ring-4 ring-red-500' : ''}`}>
                {tile.text}
              </button>
            );
          })}

          {isWrongFlash && (
            <div className="absolute -top-4 right-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-bounce">
              Try Again!
            </div>
          )}
          {swapHint && !outcome && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-950 text-sm font-bold px-4 py-1.5 rounded-full flex items-center gap-2 animate-pop-in">
              <ArrowLeftRight size={16} /> Swap these two!
            </div>
          )}
          {wrongIdx >= 0 && !outcome && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full animate-pop-in">
              Check this spot…
            </div>
          )}
        </div>

        {/* Arrow Divider */}
        <div className="text-slate-600">
          <ArrowRight size={48} className="rotate-90" />
        </div>

        {/* Word Bank */}
        <div className="flex flex-wrap justify-center gap-4">
          {tray.map((tile) => (
            <button key={tile.id} onClick={() => handleTileClick(tile, 'bank')}
              className="bg-duo-blue hover:bg-blue-400 text-white text-4xl font-bold px-8 py-4 rounded-2xl shadow-[0_6px_0_0_#0b5cb5] active:translate-y-1 active:shadow-none transition-all">
              {tile.text}
            </button>
          ))}
        </div>

        {/* Check button (in-board; the remote/contextual bar also broadcast CHECK_ANSWER) */}
        {!outcome && !slideComplete && !revealTiles && (
          <button onClick={checkAnswer} disabled={!canCheck}
            className={`px-10 py-4 rounded-2xl font-bold text-2xl flex items-center gap-3 transition-all
              ${canCheck ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg active:scale-95' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>
            <Check size={28} /> Check Answer
          </button>
        )}
      </div>

      {/* Success / partial feedback overlay — click to dismiss early */}
      {outcome && (
        <div
          onClick={() => setOutcome(null)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle max-w-3xl">
            <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 ${outcome === 'correct' ? 'bg-green-100 text-green-500' : 'bg-yellow-100 text-yellow-500'}`}>
              {outcome === 'correct' ? <Check size={64} strokeWidth={4} /> : <Lightbulb size={64} strokeWidth={3} />}
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {outcome === 'correct'
                ? (pickedStudent ? `Nice one, ${pickedStudent.name}!` : 'Excellent!')
                : (pickedStudent ? `So close, ${pickedStudent.name}!` : 'So close!')}
            </h2>
            {outcome === 'partial' && (
              <p className="text-xl text-slate-500 font-medium mb-3">Almost there — {Math.round(lastRatio * 100)}% in the right order.</p>
            )}
            <p className="text-3xl font-bold text-slate-700 text-center">{round?.targetTiles.join(' ')}</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Designed reveal (2nd failed check) — the target sentence in order,
          per-position colored vs what the student had placed: green = that
          position was already right, amber = misplaced/missing. A teaching
          hold (~2.4s via afterResolve), then the round advances. */}
      {revealTiles && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle max-w-3xl">
            <div className="w-20 h-20 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-5">
              <Lightbulb size={44} strokeWidth={2.5} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-1">Here's the sentence</h2>
            <p className="text-base text-slate-500 mb-6 font-medium">
              <span className="text-emerald-600 font-bold">Green</span> = you had it right ·
              <span className="text-amber-600 font-bold"> Amber</span> = wrong spot
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {revealTiles.map((t, i) => (
                <span key={i}
                  className={`text-3xl font-bold px-6 py-3 rounded-2xl shadow-md animate-pop-in
                    ${t.inPlace ? 'bg-green-500 text-white' : 'bg-amber-400 text-amber-950'}`}>
                  {t.word}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Already-scored chip */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 text-white px-5 py-2 rounded-full font-bold animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      {/* Slide complete overlay — click to dismiss */}
      {slideComplete && (
        <div
          onClick={() => setSlideComplete(false)}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-6">
              <Check size={64} strokeWidth={4} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {pickedStudent ? `Great building, ${pickedStudent.name}!` : 'Great building, everyone!'}
            </h2>
            <p className="text-2xl text-slate-500 font-medium">Ready for the next slide.</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardUnscramble;
