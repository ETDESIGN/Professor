// BoardWhatsMissing v2 — retrieval-practice memory game (PRACTICE phase).
// Absorbs the former BoardMagicEyes (architecture §6.2 consolidation):
// one shell, two modes via the `mode` prop:
//   • whats_missing — grid of 4–8 images, memorize ~10s, one removed.
//     Escalates recognize → produce across rounds (spec §4).
//   • magic_eyes    — single image flash ~3s, then blurred. Recognition only,
//     every round (whatsmissing-v2-spec §1: fast energizer pacing is its
//     identity; a typed-recall step would make it a second whats_missing).
//
// Both modes pull IMAGE_SELECT pool content via useEscalatingPool
// (rung tracks interaction mode here — SHELL_CAPABILITIES.WHATS_MISSING
// rungRange [1,4], see lessonDirector.ts).
//
// Interaction (spec §2 — fixes the audit's "student never inputs" critique):
//   • recognize — candidate tray of the tested item's content.options[]
//     images; teacher taps the candidate the picked student names/points at.
//   • produce   — teacher types what the student says on the Remote Baton
//     (broadcast WM_SUBMIT_ANSWER); scored via Levenshtein vs content.prompt
//     with the 0.6 pass floor (same as DICTATION rounds elsewhere).
//
// Scoring (spec §3): unified model. effectiveDifficulty overrides
// item.difficulty to 2 in produce mode (the IMAGE_SELECT item was authored
// receptive; produce asks a genuinely harder question of the same content).
// Dual-write on every scored event: addPoints (leaderboard) +
// recordAttempt (analytics) + gradeStudent (FSRS for claimed students).
//
// The 4 lifecycle must-dos: reset on currentTurnId, mistakesRef/awardedRef,
// addPoints + scoreForAttempt, personalized message via usePickedStudent.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Eye, EyeOff, HelpCircle, Lightbulb, Check, Volume2, Zap, Play, CheckCircle, X, Users, Sparkles } from 'lucide-react';
import { useSession, useSeedBase } from '../../../store/SessionContext';
import { makeRng } from '../../../services/seededRandom';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { logAttempt } from './scoreAttempt';
import { playCue } from './playCue';
import { browserSpeak } from '../../../services/SpeechService';
import type { ContextualControlsSpec } from '../lessonDirector';
import type { PoolItem } from '../../../types/exercise';

// ── Types ────────────────────────────────────────────────────────────────
export type WhatsMissingMode = 'whats_missing' | 'magic_eyes';
type InteractionMode = 'recognize' | 'produce';
type Phase = 'memorize' | 'recall' | 'reveal' | 'slideComplete';

interface GridEntry {
  image: string;
  word: string;
  objectiveId: string;
}

interface Candidate {
  image: string;
  label?: string;
  /** The image_url of the correct candidate (tested item's correct option). */
  isCorrect: boolean;
}

// ── Constants (spec §1/§4/§5) ────────────────────────────────────────────
const TOTAL_ROUNDS = 4;
const MEMORIZE_SECONDS = 10;
const FLASH_SECONDS = 3;
const MIN_GRID_ITEMS = 4; // below this the task degenerates to near-binary guessing
const MAX_GRID_ITEMS = 8;
const PRODUCE_PASS_FLOOR = 0.6; // same "close enough" floor as DICTATION rounds

// ── Small helpers ────────────────────────────────────────────────────────
const shuffle = <T,>(a: T[], rng: () => number = Math.random): T[] => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Spec §3 difficulty override: produce mode is a harder question of the same
 *  IMAGE_SELECT content → difficulty 2 (matches TYPE_TRANSLATE/DICTATION). */
function effectiveDifficulty(item: PoolItem | null, interactionMode: InteractionMode): 1 | 2 | 3 {
  if (interactionMode === 'produce') return 2;
  return item?.difficulty ?? 1;
}

// ── Contextual controls contract (architecture §4.1) ─────────────────────
// Declarative spec — the real triggers are broadcast as these action types
// from ContextualControls.tsx (commander) and TeacherRemote.tsx (baton), and
// handled by this component's lastAction listener. Shared by both modes.
export const WHATS_MISSING_ACTION_TYPES = {
  skip: 'SKIP_ROUND',
  revealHint: 'REVEAL_HINT',
  forceCorrect: 'MARK_CORRECT',
  rateIncorrect: 'RATE_INCORRECT',
  replay: 'SHOW_AGAIN', // 'START_MEMORIZE' / 'RESTART' / 'START_FLASH' accepted as legacy aliases
  nextRound: 'NEXT_ROUND',
  endSlide: 'SLIDE_COMPLETE',
  produceSubmit: 'WM_SUBMIT_ANSWER',
  startFlash: 'START_FLASH',
  hideNow: 'HIDE_NOW',
  revealAnswer: 'REVEAL_ANSWER',
} as const;

const noop = () => {};
export const WHATS_MISSING_CONTROLS: ContextualControlsSpec = {
  shellType: 'WHATS_MISSING',
  controls: {
    skip:         { label: 'Skip', enabled: true, onTrigger: noop },
    revealHint:   { label: 'Hint', enabled: true, onTrigger: noop }, // eliminate 1 candidate (recognize) / reveal first letter (produce)
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    replay:       { label: 'Show Again', enabled: true, onTrigger: noop }, // one re-run of the memorize/flash beat
    nextRound:    { label: 'Next', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
  },
};

// ── Component ─────────────────────────────────────────────────────────────
const BoardWhatsMissing = ({ data, mode = 'whats_missing' }: { data: any; mode?: WhatsMissingMode }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  // FIXPLAN E1.5 — seeded candidate order (identical on every tab).
  const seedBase = useSeedBase();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phaseTag = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Round tracking ────────────────────────────────────────────────────
  const [roundIndex, setRoundIndex] = useState(1);

  // ── Escalating pool (IMAGE_SELECT; rung tracks interaction mode) ──────
  const { items, loading, rungByObjective } = useEscalatingPool({
    unitId,
    shellType: 'WHATS_MISSING',
    phase: phaseTag,
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: MAX_GRID_ITEMS,
  });

  // ── Frozen fallback (legacy flow data.items [{image,name}]) ───────────
  const frozenEntries: GridEntry[] = useMemo(() => {
    if (!Array.isArray(data?.items) || data.items.length === 0) return [];
    return data.items.slice(0, MAX_GRID_ITEMS).map((it: any, i: number) => ({
      image: String(it.image || ''),
      word: String(it.name || ''),
      objectiveId: `frozen-${i}`,
    })).filter((e: GridEntry) => e.image);
  }, [data?.items]);
  const usingFrozen = frozenEntries.length >= MIN_GRID_ITEMS;

  // ── Pool items → grid entries (one per objective, correct image) ──────
  const poolEntries: GridEntry[] = useMemo(() => {
    const seen = new Set<string>();
    const out: GridEntry[] = [];
    for (const it of items) {
      if (it.exercise_type !== 'IMAGE_SELECT' || seen.has(it.objective_id)) continue;
      const c = it.content as any;
      const correct = c?.options?.[c.correct_index];
      const image = correct?.image_url || '';
      const word = c?.prompt || correct?.label || '';
      if (!image) continue;
      seen.add(it.objective_id);
      out.push({ image, word, objectiveId: it.objective_id });
      if (out.length >= MAX_GRID_ITEMS) break;
    }
    return out;
  }, [items]);

  const poolItemByObjective = useMemo(() => {
    const map = new Map<string, PoolItem>();
    for (const it of items) if (!map.has(it.objective_id)) map.set(it.objective_id, it);
    return map;
  }, [items]);

  // ── Round content state (snapshotted at round setup) ──────────────────
  const [grid, setGrid] = useState<GridEntry[]>([]);
  const [missingIndex, setMissingIndex] = useState(0);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [gamePhase, setGamePhase] = useState<Phase>('memorize');
  const [timer, setTimer] = useState(mode === 'magic_eyes' ? FLASH_SECONDS : MEMORIZE_SECONDS);
  const [eliminated, setEliminated] = useState<number[]>([]); // hint: removed wrong candidates
  const [firstLetterHint, setFirstLetterHint] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false); // 2nd-miss micro card
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [alreadyScoredChip, setAlreadyScoredChip] = useState(false);

  // For magic_eyes: teacher-gated flash (F2)
  const isMagic = mode === 'magic_eyes';
  const [magicReady, setMagicReady] = useState(isMagic);
  const [magicFlashing, setMagicFlashing] = useState(false);

  // ── Lifecycle refs (the 4 must-dos) ───────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const roundResolvedRef = useRef(false);
  const missedThisSlideRef = useRef<Map<string, string[]>>(new Map());
  const streakRef = useRef(0);
  const winCuedRef = useRef(false);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handledActionRef = useRef<any>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // ── Interaction mode for the current round (spec §4) ──────────────────
  const testedEntry: GridEntry | null = grid.length > 0 ? grid[missingIndex] : null;
  const interactionMode: InteractionMode = useMemo(() => {
    if (mode === 'magic_eyes') return 'recognize';
    const baseline = roundIndex <= Math.ceil(TOTAL_ROUNDS / 2) ? 1 : 4;
    if (baseline < 4) return 'recognize';
    const objRung = testedEntry ? (rungByObjective[testedEntry.objectiveId] ?? 1) : 1;
    return objRung >= 4 ? 'produce' : 'recognize';
  }, [mode, roundIndex, testedEntry, rungByObjective]);

  // ── Flash trigger for magic_eyes ─────────────────────────────────────
  const startMagicFlash = useCallback(() => {
    if (mode !== 'magic_eyes') return;
    setMagicReady(false);
    setMagicFlashing(true);
    setTimer(FLASH_SECONDS);
    playCue('reveal');
  }, [mode]);

  // ── Round setup (snapshot items into the board once per round) ────────
  const setupSigRef = useRef('');
  useEffect(() => {
    const source = usingFrozen ? frozenEntries : poolEntries;
    if (source.length === 0) return;
    const sig = `${mode}|${roundIndex}|${state.currentTurnId ?? 'practice'}|${state.resetCount ?? 0}|${source.map((e) => e.objectiveId).join(',')}`;
    if (setupSigRef.current === sig) return;
    setupSigRef.current = sig;

    const gridSize = mode === 'magic_eyes' ? 1 : Math.min(MAX_GRID_ITEMS, source.length);
    const roundGrid = mode === 'magic_eyes'
      ? [source[(roundIndex - 1) % source.length]]
      : source.slice(0, gridSize);
    const idx = (roundIndex - 1) % roundGrid.length;
    const entry = roundGrid[idx];

    let cands: Candidate[];
    const poolItem = poolItemByObjective.get(entry.objectiveId);
    const c = poolItem?.content as any;
    const correctImage = c?.options?.[c.correct_index]?.image_url || entry.image;
    if (Array.isArray(c?.options) && c.options.length > 0) {
      cands = c.options.map((o: any) => ({
        image: String(o.image_url || ''),
        label: String(o.label || o.word || o.prompt || ''),
        isCorrect: String(o.image_url || '') === String(correctImage),
      })).filter((cd: Candidate) => cd.image);
    } else {
      cands = roundGrid.map((g) => ({
        image: g.image,
        label: g.word,
        isCorrect: g.image === entry.image,
      }));
    }

    setGrid(roundGrid);
    setMissingIndex(idx);
    setCandidates(shuffle(cands, makeRng(seedBase, entry.image, 'candidates')));
    setEliminated([]);
    setFirstLetterHint(false);
    setShowExplanation(false);
    setFeedback(null);
    setMagicReady(mode === 'magic_eyes');
    setMagicFlashing(false);
    setGamePhase('memorize');
    setTimer(mode === 'magic_eyes' ? FLASH_SECONDS : MEMORIZE_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roundIndex, usingFrozen, frozenEntries, poolEntries, poolItemByObjective]);

  // ── Memorize/flash countdown → recall ─────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'memorize' || grid.length === 0) return;
    if (mode === 'magic_eyes' && magicReady) return; // teacher-gated flash
    if (timer > 0) {
      const t = setInterval(() => setTimer((v) => v - 1), 1000);
      return () => clearInterval(t);
    }
    if (mode === 'magic_eyes') {
      setMagicFlashing(false);
    }
    setGamePhase('recall');
  }, [gamePhase, timer, grid.length, mode, magicReady]);

  // ── Dual-write + cognitive capture helper ─────────────────────────────
  const doScoring = useCallback((correctness: 'correct' | 'partial' | 'incorrect', points: number, objectiveId: string, word: string) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    if (points !== 0) addPoints(picked, points);
    const difficulty = testedEntry
      ? effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode)
      : 1;
    void word;
    logAttempt({
      state, picked, unitId,
      objectiveId,
      exerciseType: 'IMAGE_SELECT',
      difficulty,
      correctness,
      modality: 'receptive',
      pushToRemediation,
    });
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, testedEntry, interactionMode, poolItemByObjective, pushToRemediation]);

  const showAlreadyScored = useCallback(() => {
    setAlreadyScoredChip(true);
    setTimeout(() => setAlreadyScoredChip(false), 1500);
  }, []);

  // ── Round resolution ──────────────────────────────────────────────────
  const finishRound = useCallback((correct: boolean) => {
    roundResolvedRef.current = true;
    setFeedback(correct ? 'correct' : 'incorrect');
    setGamePhase('reveal');
    if (!correct) setShowExplanation(true);
    if (correct && testedEntry) {
      browserSpeak(testedEntry.word);
    }
  }, [testedEntry]);

  const checkSlideComplete = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    const holdMs = 2500; // 2.5s choral celebration hold (F4 WhatsMissing, F3 MagicEyes)
    if (roundIndex >= TOTAL_ROUNDS) {
      advanceTimerRef.current = setTimeout(() => {
        setGamePhase('slideComplete');
        triggerAction('SLIDE_COMPLETE', { forced: false });
      }, holdMs);
    } else {
      advanceTimerRef.current = setTimeout(() => {
        setRoundIndex((r) => r + 1);
      }, holdMs);
    }
  }, [roundIndex, triggerAction]);

  // ── Answer handlers ───────────────────────────────────────────────────
  const handleRecognizeTap = useCallback((cand: Candidate, candIndex: number) => {
    if (gamePhase !== 'recall' || !testedEntry) return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    if (cand.isCorrect) {
      awardedRef.current = true;
      const difficulty = effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode);
      streakRef.current += 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, streakRef.current);
      doScoring('correct', points, testedEntry.objectiveId, testedEntry.word);
      playCue('correct');
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      finishRound(true);
      checkSlideComplete();
    } else {
      mistakesRef.current += 1;
      doScoring('incorrect', -MISTAKE_PENALTY, testedEntry.objectiveId, testedEntry.word);
      playCue('wrong');
      streakRef.current = 0;
      setEliminated((prev) => (prev.includes(candIndex) ? prev : [...prev, candIndex]));
      setFeedback('incorrect');
      setTimeout(() => setFeedback(null), 700);
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        setShowExplanation(true);
        setTimeout(() => setShowExplanation(false), 2500);
      }
    }
  }, [gamePhase, testedEntry, interactionMode, poolItemByObjective, doScoring, finishRound, checkSlideComplete, showAlreadyScored]);

  const handleProduceSubmit = useCallback((rawText: string) => {
    if (gamePhase !== 'recall' || !testedEntry || interactionMode !== 'produce') return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    const submitted = rawText.trim().toLowerCase();
    const target = testedEntry.word.trim().toLowerCase();
    if (!submitted || !target) return;
    const dist = levenshtein(submitted, target);
    const ratio = clamp01(1 - dist / Math.max(submitted.length, target.length));
    const correct = ratio >= PRODUCE_PASS_FLOOR;
    if (correct) {
      awardedRef.current = true;
      const difficulty = effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, 'produce');
      streakRef.current += 1;
      const points = scoreForAttempt(mistakesRef.current, difficulty, ratio, streakRef.current);
      doScoring(ratio < 1 ? 'partial' : 'correct', points, testedEntry.objectiveId, testedEntry.word);
      playCue('correct');
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      finishRound(true);
      checkSlideComplete();
    } else {
      mistakesRef.current += 1;
      doScoring('incorrect', -MISTAKE_PENALTY, testedEntry.objectiveId, testedEntry.word);
      playCue('wrong');
      streakRef.current = 0;
      setFirstLetterHint(true);
      setFeedback('incorrect');
      setTimeout(() => setFeedback(null), 700);
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        setShowExplanation(true);
        setTimeout(() => setShowExplanation(false), 2500);
      }
    }
  }, [gamePhase, testedEntry, interactionMode, poolItemByObjective, doScoring, finishRound, checkSlideComplete, showAlreadyScored]);

  // Produce-mode oral miss trigger
  const handleProduceMiss = useCallback(() => {
    if (gamePhase !== 'recall' || !testedEntry || interactionMode !== 'produce') return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    mistakesRef.current += 1;
    doScoring('incorrect', -MISTAKE_PENALTY, testedEntry.objectiveId, testedEntry.word);
    playCue('wrong');
    streakRef.current = 0;
    setFirstLetterHint(true);
    setFeedback('incorrect');
    setTimeout(() => setFeedback(null), 700);
    if (mistakesRef.current >= 2) {
      playCue('reveal');
      setShowExplanation(true);
      setTimeout(() => setShowExplanation(false), 2500);
    }
  }, [gamePhase, testedEntry, interactionMode, doScoring, showAlreadyScored]);

  // Oral answer reveal trigger
  const revealAnswer = useCallback(() => {
    if (gamePhase !== 'recall' || !testedEntry) return;
    playCue('reveal');
    setShowExplanation(true);
    setTimeout(() => setShowExplanation(false), 3000);
  }, [gamePhase, testedEntry]);

  // ── Teacher controls ──────────────────────────────────────────────────
  const replayMemorize = useCallback(() => {
    if (gamePhase === 'slideComplete') return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setEliminated([]);
    setFirstLetterHint(false);
    setShowExplanation(false);
    setFeedback(null);
    setMagicReady(mode === 'magic_eyes');
    setMagicFlashing(false);
    setGamePhase('memorize');
    setTimer(mode === 'magic_eyes' ? FLASH_SECONDS : MEMORIZE_SECONDS);
  }, [gamePhase, mode]);

  const advanceRound = useCallback((opts?: { silent?: boolean }) => {
    if (gamePhase === 'slideComplete') return;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (roundIndex >= TOTAL_ROUNDS) {
      setGamePhase('slideComplete');
      triggerAction('SLIDE_COMPLETE', { forced: !!opts?.silent ? true : false });
    } else {
      setRoundIndex((r) => r + 1);
    }
  }, [roundIndex, gamePhase, triggerAction]);

  useEffect(() => {
    if (gamePhase !== 'slideComplete') return;
    const t = setTimeout(() => setGamePhase('reveal'), 6000);
    return () => clearTimeout(t);
  }, [gamePhase]);

  const skipRound = useCallback(() => {
    advanceRound({ silent: true });
  }, [advanceRound]);

  const revealHint = useCallback(() => {
    if (gamePhase !== 'recall') return;
    if (interactionMode === 'produce') {
      setFirstLetterHint(true);
    } else {
      setEliminated((prev) => {
        const idx = candidates.findIndex((c, i) => !c.isCorrect && !prev.includes(i));
        return idx === -1 ? prev : [...prev, idx];
      });
    }
  }, [gamePhase, interactionMode, candidates]);

  const forceCorrect = useCallback(() => {
    if (gamePhase !== 'recall' || !testedEntry) return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    awardedRef.current = true;
    const difficulty = effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode);
    streakRef.current += 1;
    const points = scoreForAttempt(mistakesRef.current, difficulty, 1.0, streakRef.current);
    doScoring('correct', points, testedEntry.objectiveId, testedEntry.word);
    playCue('correct');
    if (streakRef.current === 3 || streakRef.current === 5) {
      playCue('streak');
      triggerConfetti();
    }
    finishRound(true);
    checkSlideComplete();
  }, [gamePhase, testedEntry, interactionMode, poolItemByObjective, doScoring, finishRound, checkSlideComplete, showAlreadyScored]);

  // ── Remote/commander action listener ──────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    if (handledActionRef.current === action) return;
    handledActionRef.current = action;

    switch (action.type) {
      case 'SKIP_ROUND': skipRound(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'RATE_INCORRECT': handleProduceMiss(); break;
      case 'REVEAL_ANSWER': revealAnswer(); break;
      case 'HIDE_NOW':
        setMagicReady(false);
        setMagicFlashing(false);
        setTimer(0);
        break;
      case 'START_FLASH': startMagicFlash(); break;
      case 'SHOW_AGAIN':
      case 'START_MEMORIZE':
      case 'RESTART':
        if (mode === 'magic_eyes' && magicReady) startMagicFlash();
        else replayMemorize();
        break;
      case 'NEXT_ROUND': advanceRound(); break;
      case 'WM_SUBMIT_ANSWER': handleProduceSubmit(String(action.payload?.text ?? '')); break;
      case 'RESET_GAME':
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        setupSigRef.current = '';
        mistakesRef.current = 0;
        awardedRef.current = false;
        roundResolvedRef.current = false;
        streakRef.current = 0;
        winCuedRef.current = false;
        setRoundIndex(1);
        replayMemorize();
        break;
      case 'SLIDE_COMPLETE':
        setGamePhase('slideComplete');
        if (action.payload?.forced !== true && !winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
        }
        break;
    }
  }, [state.lastAction, skipRound, revealHint, forceCorrect, handleProduceMiss, revealAnswer, startMagicFlash, replayMemorize, advanceRound, handleProduceSubmit, mode, magicReady]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (mode === 'magic_eyes' && magicReady) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          startMagicFlash();
        }
      } else if (mode === 'magic_eyes' && magicFlashing) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setMagicFlashing(false);
          setTimer(0);
        }
      } else if (mode === 'whats_missing' && gamePhase === 'memorize') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setTimer(0);
        }
      } else if (gamePhase === 'recall') {
        if (interactionMode === 'recognize') {
          if (e.key >= '1' && e.key <= '8') {
            const idx = parseInt(e.key, 10) - 1;
            if (candidates[idx] && !eliminated.includes(idx)) handleRecognizeTap(candidates[idx], idx);
          } else if (e.key === 'a' || e.key === 'A') {
            if (candidates[0] && !eliminated.includes(0)) handleRecognizeTap(candidates[0], 0);
          } else if (e.key === 'b' || e.key === 'B') {
            if (candidates[1] && !eliminated.includes(1)) handleRecognizeTap(candidates[1], 1);
          } else if (e.key === 'c' || e.key === 'C') {
            if (candidates[2] && !eliminated.includes(2)) handleRecognizeTap(candidates[2], 2);
          } else if (e.key === 'd' || e.key === 'D') {
            if (candidates[3] && !eliminated.includes(3)) handleRecognizeTap(candidates[3], 3);
          }
        } else if (interactionMode === 'produce') {
          if (e.key === '1') forceCorrect();
          else if (e.key === '2') handleProduceMiss();
        }
      } else if (gamePhase === 'reveal' && testedEntry) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          browserSpeak(testedEntry.word);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, magicReady, magicFlashing, gamePhase, interactionMode, candidates, eliminated, testedEntry, startMagicFlash, handleRecognizeTap, forceCorrect, handleProduceMiss]);

  // ── Game-lifecycle: new responder (NEW_TURN) → fresh turn refs + fresh
  // memorize beat. If the round already resolved for the previous responder,
  // give the new one the next round (the answer was already revealed).
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = choral/practice mode
    mistakesRef.current = 0;
    awardedRef.current = false;
    streakRef.current = 0; // fresh responder → fresh streak
    winCuedRef.current = false;
    if (roundResolvedRef.current) {
      roundResolvedRef.current = false;
      if (roundIndex >= TOTAL_ROUNDS) {
        setGamePhase('slideComplete');
      } else {
        setRoundIndex((r) => r + 1);
      }
    } else {
      replayMemorize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Empty / loading states (spec §5) ──────────────────────────────────
  const sourceCount = usingFrozen ? frozenEntries.length : poolEntries.length;
  const floorForMode = mode === 'magic_eyes' ? 1 : MIN_GRID_ITEMS;

  // Legacy MagicEyes slide data (image/question/answer) fallback: keep old
  // teacher-authored flows working when the pool is empty.
  const legacyMagicEyes = mode === 'magic_eyes' && !loading && sourceCount === 0 && !!data?.image;
  const [legacyPhase, setLegacyPhase] = useState<'flash' | 'recall' | 'reveal'>('flash');
  const [legacyTimer, setLegacyTimer] = useState(data?.timer || FLASH_SECONDS);
  useEffect(() => {
    if (!legacyMagicEyes || legacyPhase !== 'flash') return;
    if (legacyTimer > 0) {
      const t = setInterval(() => setLegacyTimer((v: number) => v - 1), 1000);
      return () => clearInterval(t);
    }
    setLegacyPhase('recall');
  }, [legacyMagicEyes, legacyPhase, legacyTimer]);
  useEffect(() => {
    if (!legacyMagicEyes) return;
    const action = state.lastAction;
    if (!action) return;
    if (action.type === 'RESTART' || action.type === 'SHOW_AGAIN' || action.type === 'RESET_GAME') {
      setLegacyPhase('flash');
      setLegacyTimer(data?.timer || FLASH_SECONDS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction, legacyMagicEyes]);

  if (legacyMagicEyes) {
    return (
      <div className="h-full bg-slate-900 flex flex-col font-display relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full p-8 z-30 flex justify-between items-center pointer-events-none">
          <div className="bg-black/40 backdrop-blur px-6 py-3 rounded-2xl border border-white/20 flex items-center gap-4 text-white">
            <div className={`p-2 rounded-xl ${legacyPhase === 'flash' ? 'bg-blue-500' : 'bg-purple-600'} transition-colors`}>
              {legacyPhase === 'flash' ? <Eye size={24} /> : <EyeOff size={24} />}
            </div>
            <div>
              <h1 className="text-2xl font-bold">Magic Eyes</h1>
              <p className="text-white/60 text-sm font-sans">{legacyPhase === 'flash' ? 'Memorize the details!' : legacyPhase === 'recall' ? 'What did you see?' : 'Did you get it?'}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 relative flex items-center justify-center bg-black">
          <img src={data.image} alt="Magic Eyes Target"
            className={`w-full h-full object-cover transition-all duration-1000 ${legacyPhase === 'recall' ? 'blur-[100px] opacity-30 scale-110' : 'blur-0 opacity-100 scale-100'}`} />
          {legacyPhase === 'recall' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 animate-fade-in">
              <h2 className="text-6xl font-black text-white drop-shadow-[0_4px_20px_rgba(168,85,247,0.5)] text-center max-w-4xl leading-tight">
                {data.question || 'What did you see?'}
              </h2>
            </div>
          )}
          {legacyPhase === 'reveal' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-green-500 text-white px-12 py-6 rounded-3xl shadow-2xl z-30 flex items-center gap-6">
              <div className="text-xl font-bold uppercase tracking-widest bg-green-600 px-3 py-1 rounded-lg">Answer</div>
              <div className="text-4xl font-black">{data.answer}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading || grid.length === 0) {
    const notReady = !loading && sourceCount < floorForMode;
    return (
      <div className="h-full bg-indigo-950 flex flex-col items-center justify-center text-white text-center px-8">
        <Eye size={56} className="text-indigo-500/60 mb-4" />
        <h1 className="text-4xl font-display font-bold text-indigo-300 mb-2">
          {mode === 'magic_eyes' ? 'Magic Eyes' : "What's Missing?"}
        </h1>
        <p className="text-indigo-400 text-xl max-w-xl">
          {loading ? 'Loading…' : notReady
            ? "Content isn't ready for this round yet. Generate the exercise pool for this unit."
            : 'Loading…'}
        </p>
        {notReady && (
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-indigo-700 hover:bg-indigo-600 rounded-xl font-bold text-white">
            Skip Slide
          </button>
        )}
      </div>
    );
  }

  const memorizeSeconds = isMagic ? FLASH_SECONDS : MEMORIZE_SECONDS;
  const testedWord = testedEntry?.word || '';

  return (
    <div className="h-full w-full bg-[#0A0E27] text-white flex flex-col p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none wm-container">
      {/* Ambient background glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#0A0E27] to-[#0A0E27] pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center mb-3 sm:mb-6 wm-header">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-500 ${
            gamePhase === 'memorize' ? 'bg-emerald-500 shadow-emerald-950/50' : 'bg-indigo-600 shadow-indigo-950/50'
          }`}>
            {gamePhase === 'memorize' ? <Eye size={26} className="text-white" /> : <EyeOff size={26} className="text-white" />}
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2">
              <span className="bg-indigo-950/80 border border-indigo-500/50 text-indigo-300 px-2 py-0.5 rounded-md text-[11px] font-bold">
                Round {roundIndex}/{TOTAL_ROUNDS}
              </span>
              <span className="text-slate-400 font-bold">{isMagic ? 'Magic Eyes' : "What's Missing"}</span>
            </div>
            <div className="text-xl sm:text-3xl font-black text-white flex items-center gap-3 wm-title">
              <span>
                {gamePhase === 'memorize'
                  ? (isMagic ? (magicReady ? 'Magic Eyes — Ready?' : 'Watch Closely!') : 'Memorize the Items!')
                  : gamePhase === 'recall'
                  ? (isMagic ? 'What did you see?' : interactionMode === 'produce' ? "What's missing? Say it!" : "What's Missing?")
                  : 'Revealed!'}
              </span>
              {pickedStudent && (
                <span className="text-xs sm:text-sm font-bold bg-amber-400/20 border border-amber-400/40 text-amber-300 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  {pickedStudent.name}'s Turn
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Timer / Progress Bar */}
        <div className="flex items-center gap-3">
          {mode === 'whats_missing' && gamePhase === 'memorize' && (
            <button
              onClick={() => setTimer(0)}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/50 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
              title="Ready! Hide now (or press Space)"
            >
              <EyeOff size={14} /> Hide Now
            </button>
          )}
          {gamePhase === 'memorize' && (!isMagic || magicFlashing) && (
            <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
              <div className="h-2 w-24 sm:w-32 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(timer / memorizeSeconds) * 100}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-emerald-400">{timer}s</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MEMORIZE / FLASH PHASE ═══ */}
      {gamePhase === 'memorize' && (
        <div className="flex-1 relative z-10 flex items-center justify-center overflow-hidden">
          {isMagic ? (
            magicReady ? (
              /* Camera Ready Gate (F2) */
              <div className="flex flex-col items-center justify-center p-6 sm:p-10 bg-slate-900/90 border-2 border-cyan-500/50 rounded-3xl shadow-2xl max-w-xl text-center animate-pop-in">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center mb-4 text-cyan-300">
                  <Eye size={40} className="animate-pulse" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">Magic Eyes! Watch Closely!</h2>
                <p className="text-slate-300 text-sm sm:text-base mb-6">The photo will flash for 3 seconds. Look at all the details!</p>
                <button
                  onClick={startMagicFlash}
                  className="px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-lg sm:text-xl shadow-xl shadow-cyan-950/50 active:scale-95 transition-all flex items-center gap-3 animate-bounce-subtle mx-auto"
                >
                  <Zap size={24} /> FLASH IMAGE (3s)
                </button>
                <span className="text-xs text-slate-500 mt-3">Teacher: tap button or press SPACE to flash</span>
              </div>
            ) : (
              /* Flash Image (image ONLY — no text label, solving F4) */
              <div className="w-full max-w-2xl aspect-video bg-white rounded-3xl shadow-2xl p-4 sm:p-6 flex flex-col items-center justify-center wm-shutter border-4 border-cyan-400 animate-fade-in">
                <img src={grid[0]?.image} alt="Flash target" className="w-full h-full object-contain drop-shadow-md" />
              </div>
            )
          ) : (
            /* What's Missing Grid (4-8 items) */
            <div className={`grid gap-3 sm:gap-6 w-full max-w-6xl max-h-[70vh] wm-card-grid ${
              grid.length <= 4 ? 'grid-cols-2 max-w-3xl' : 'grid-cols-2 sm:grid-cols-4'
            }`}>
              {grid.map((item, i) => (
                <div key={i} className="aspect-[4/3] rounded-2xl sm:rounded-3xl shadow-xl bg-white flex flex-col items-center justify-center p-3 sm:p-4 wm-grid-card border border-slate-100">
                  <img src={item.image} alt={item.word} className="h-2/3 object-contain drop-shadow-sm mb-2" />
                  <h3 className="text-base sm:text-2xl font-display font-bold text-slate-800 text-center truncate w-full px-1">
                    {item.word}
                  </h3>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ RECALL + REVEAL PHASE ═══ */}
      {(gamePhase === 'recall' || gamePhase === 'reveal' || gamePhase === 'slideComplete') && (
        <div className="flex-1 relative z-10 flex flex-col items-center justify-center gap-4 sm:gap-6 overflow-hidden">
          {isMagic ? (
            /* Magic Eyes Shutter / Revealed Image */
            gamePhase === 'reveal' ? (
              <div className="w-full max-w-2xl aspect-video rounded-3xl overflow-hidden shadow-2xl relative border-4 border-emerald-400 shadow-emerald-500/20 bg-white p-3 sm:p-4 wm-shutter animate-pop-in">
                <img src={grid[0]?.image} alt={grid[0]?.word} className="w-full h-full object-contain" />
              </div>
            ) : (
              /* Mystery Frosted Shutter (NO color leak, solving F1) */
              <div className="w-full max-w-2xl aspect-video rounded-3xl overflow-hidden shadow-2xl relative bg-slate-950 border-4 border-cyan-500/30 flex items-center justify-center wm-shutter">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-indigo-950/90 to-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-4 border-cyan-400/50 border-dashed animate-spin-slow flex items-center justify-center mb-2 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                    <EyeOff size={32} className="text-cyan-400" />
                  </div>
                  <p className="text-cyan-300 font-bold text-base sm:text-lg tracking-widest uppercase">Mystery Lens Closed</p>
                  <p className="text-slate-400 text-xs sm:text-sm mt-0.5">What did you see in the photo?</p>
                </div>
              </div>
            )
          ) : (
            /* What's Missing: Grid with missing aperture */
            <div className={`grid gap-2.5 sm:gap-4 w-full max-h-[55vh] wm-card-grid ${
              grid.length <= 4 ? 'grid-cols-2 max-w-3xl' : 'grid-cols-2 sm:grid-cols-4 max-w-6xl'
            }`}>
              {grid.map((item, i) => {
                const isMissing = i === missingIndex;
                const revealed = isMissing && gamePhase !== 'recall';
                return (
                  <div
                    key={i}
                    className={`aspect-[4/3] rounded-2xl sm:rounded-3xl shadow-xl transition-all duration-500 relative wm-grid-card ${
                      isMissing && !revealed
                        ? 'bg-indigo-950/60 border-2 border-dashed border-cyan-400/60 shadow-cyan-950/50'
                        : 'bg-white border border-slate-100'
                    }`}
                  >
                    <div className={`w-full h-full p-2.5 sm:p-3 flex flex-col items-center justify-center transition-opacity duration-300 ${
                      isMissing && !revealed ? 'opacity-0' : 'opacity-100'
                    }`}>
                      <img src={item.image} alt={revealed ? item.word : ''} className="h-2/3 object-contain drop-shadow-sm mb-1.5" />
                      {(!isMissing || revealed) && (
                        <h3 className="text-sm sm:text-xl font-display font-bold text-slate-800 text-center truncate w-full px-1">
                          {item.word}
                        </h3>
                      )}
                    </div>
                    {isMissing && !revealed && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <HelpCircle size={44} className="text-cyan-400 animate-bounce mb-1" />
                        <span className="text-[11px] font-bold text-cyan-300 tracking-wider uppercase">Missing</span>
                      </div>
                    )}
                    {revealed && (
                      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl border-4 border-emerald-400 pointer-events-none animate-pop-in" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Produce-mode oral challenge bar (1-tap oral verification, solving F1) */}
          {interactionMode === 'produce' && gamePhase === 'recall' && (
            <div className="flex flex-col items-center gap-2.5 w-full max-w-lg animate-fade-in wm-produce-bar">
              <div className="bg-fuchsia-950/70 border-2 border-fuchsia-500/50 text-white text-lg sm:text-2xl font-display font-bold px-6 py-3 rounded-2xl text-center shadow-lg">
                {pickedStudent ? `${pickedStudent.name}, say the missing word!` : 'Say the missing word loud!'}
              </div>
              {firstLetterHint && testedWord && (
                <div className="bg-amber-400 text-slate-950 font-black text-base sm:text-xl px-4 py-1.5 rounded-xl animate-pop-in shadow-md">
                  Hint: starts with “{testedWord.charAt(0).toUpperCase()}”
                </div>
              )}
              {/* On-board oral evaluation buttons */}
              <div className="flex items-center gap-3 mt-1">
                <button
                  onClick={forceCorrect}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm sm:text-base shadow-lg active:scale-95 flex items-center gap-2 transition-all wm-produce-btn"
                >
                  <Check size={18} strokeWidth={3} /> ✓ Correct
                </button>
                <button
                  onClick={handleProduceMiss}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm sm:text-base shadow-lg active:scale-95 flex items-center gap-2 transition-all wm-produce-btn"
                >
                  <X size={18} strokeWidth={3} /> ✗ Try Again
                </button>
                <button
                  onClick={revealAnswer}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs sm:text-sm shadow active:scale-95 flex items-center gap-1.5 transition-all wm-produce-btn"
                >
                  <Eye size={16} /> Reveal
                </button>
              </div>
            </div>
          )}

          {/* Recognize-mode Candidate Dock (with letter badges, images, and text labels, solving F3/F4) */}
          {interactionMode === 'recognize' && gamePhase === 'recall' && (
            <div className="flex flex-col items-center gap-2 sm:gap-3 w-full max-w-5xl animate-fade-in">
              <p className="text-indigo-200 text-sm sm:text-lg font-display font-bold text-center">
                {isMagic ? 'Which item did you see in the photo?' : 'Which item is missing? Tap the answer!'}
              </p>
              <div className="flex gap-2 sm:gap-3 flex-wrap justify-center w-full wm-cand-dock">
                {candidates.map((cand, i) => {
                  const isEliminated = eliminated.includes(i);
                  const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                  return (
                    <button
                      key={i}
                      onClick={() => handleRecognizeTap(cand, i)}
                      disabled={isEliminated}
                      className={`flex items-center gap-2.5 px-3.5 sm:px-5 py-2 sm:py-3 rounded-xl sm:rounded-2xl bg-slate-900/90 border-2 border-slate-700 hover:border-cyan-400 hover:bg-slate-800 shadow-lg transition-all duration-200 wm-cand-btn ${
                        isEliminated
                          ? 'opacity-20 scale-90 cursor-not-allowed border-slate-800'
                          : 'hover:scale-105 active:scale-95'
                      } ${feedback === 'incorrect' ? 'animate-shake' : ''}`}
                    >
                      <span className="w-6 h-6 rounded-md bg-slate-800 text-cyan-400 font-mono text-xs font-black flex items-center justify-center border border-slate-700">
                        {labels[i] || i + 1}
                      </span>
                      {cand.image && (
                        <img
                          src={cand.image}
                          alt={cand.label || ''}
                          className="h-8 w-8 sm:h-11 sm:w-11 object-contain drop-shadow"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                        />
                      )}
                      <span className="font-display font-bold text-sm sm:text-lg text-white">
                        {cand.label || `Option ${i + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reveal Feedback Strip with Choral Echo & Audio Pronunciation (solving F4/F3) */}
          {gamePhase === 'reveal' && testedEntry && (
            <div className={`px-6 sm:px-8 py-3 rounded-2xl sm:rounded-3xl shadow-2xl flex items-center gap-4 sm:gap-6 animate-bounce-subtle ${
              feedback === 'correct' ? 'bg-emerald-600 border-2 border-emerald-400' : 'bg-amber-600 border-2 border-amber-400'
            } text-white`}>
              {feedback === 'correct' ? <Check size={30} strokeWidth={3} className="text-white shrink-0" /> : <Lightbulb size={30} className="shrink-0" />}
              <div className="text-left">
                <div className="text-lg sm:text-2xl font-display font-black">
                  {feedback === 'correct'
                    ? (pickedStudent ? `Nice one, ${pickedStudent.name}!` : 'Awesome!')
                    : `It was: ${testedEntry.word}`}
                </div>
                <div className="text-xs sm:text-sm text-emerald-100 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                  <Users size={15} /> Everyone say: <span className="underline font-black text-white text-sm sm:text-base">{testedEntry.word}</span>
                </div>
              </div>
              <img src={testedEntry.image} alt={testedEntry.word} className="h-12 w-12 sm:h-14 sm:w-14 object-contain bg-white/20 rounded-xl p-1 shrink-0" />
              <button
                onClick={() => browserSpeak(testedEntry.word)}
                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors shrink-0"
                title="Listen again (Space)"
              >
                <Volume2 size={20} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Already-scored chip */}
      {alreadyScoredChip && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-800/95 border border-slate-700 text-white px-5 py-2 rounded-full font-bold shadow-2xl animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      {/* 2nd-miss micro-explanation card */}
      {showExplanation && testedEntry && gamePhase === 'recall' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-400/80 p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm text-center">
            <Lightbulb size={36} className="text-amber-400 mb-2 animate-bounce" />
            <img src={testedEntry.image} alt={testedEntry.word} className="h-28 object-contain drop-shadow mb-3 bg-white/10 rounded-2xl p-2" />
            <p className="text-2xl sm:text-3xl font-display font-black text-white">{testedEntry.word}</p>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">Here's what it was!</p>
          </div>
        </div>
      )}

      {/* Slide complete overlay */}
      {gamePhase === 'slideComplete' && (
        <div
          onClick={() => setGamePhase('reveal')}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in cursor-pointer"
        >
          <div className="bg-slate-900 border-2 border-indigo-500/50 p-8 sm:p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center animate-bounce-subtle text-center max-w-lg">
            <div className="w-24 h-24 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mb-4 border border-indigo-400/40">
              <Sparkles size={48} />
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-2">
              {pickedStudent ? `Great memory, ${pickedStudent.name}!` : 'Great memory, everyone!'}
            </h2>
            <p className="text-lg text-slate-400 font-medium">Memory round complete!</p>
            <p className="text-xs text-slate-500 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      {/* Responsive phone-landscape floor styling */}
      <style>{`
        @media (max-height: 450px) {
          .wm-container { padding: 0.35rem 0.75rem !important; }
          .wm-header { margin-bottom: 0.25rem !important; padding: 0.25rem 0 !important; }
          .wm-title { font-size: 1.1rem !important; }
          .wm-card-grid { gap: 0.35rem !important; max-height: 140px !important; }
          .wm-grid-card { padding: 0.25rem !important; border-radius: 0.75rem !important; }
          .wm-cand-dock { gap: 0.35rem !important; margin-top: 0.25rem !important; }
          .wm-cand-btn { padding: 0.25rem 0.5rem !important; min-height: 38px !important; border-radius: 0.5rem !important; }
          .wm-shutter { max-height: 135px !important; }
          .wm-produce-bar { margin-top: 0.25rem !important; gap: 0.35rem !important; }
          .wm-produce-btn { padding: 0.35rem 0.75rem !important; font-size: 0.875rem !important; border-radius: 0.5rem !important; }
        }
        @keyframes wm-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: wm-shake 0.4s ease-in-out; }
        @keyframes wm-pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: wm-pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>
    </div>
  );
};

export default BoardWhatsMissing;

