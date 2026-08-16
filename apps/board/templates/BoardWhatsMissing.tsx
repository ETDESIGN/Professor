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
import { Eye, EyeOff, HelpCircle, Lightbulb, Check } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeStudent } from '../../../services/boardLearner';
import { playCue } from './playCue';
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
const shuffle = <T,>(a: T[]): T[] => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  replay: 'SHOW_AGAIN', // 'START_MEMORIZE' / 'RESTART' accepted as legacy aliases
  nextRound: 'NEXT_ROUND',
  endSlide: 'SLIDE_COMPLETE',
  produceSubmit: 'WM_SUBMIT_ANSWER',
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

  // ── Lifecycle refs (the 4 must-dos) ───────────────────────────────────
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const roundResolvedRef = useRef(false);
  const missedThisSlideRef = useRef<Map<string, string[]>>(new Map());
  // Slide-scoped streak for the picked responder (consecutive correct
  // rounds; reset on a wrong answer and a new turn). Passed as the 4th arg
  // to scoreForAttempt — 3 = 1.25x, 5 = 1.5x.
  const streakRef = useRef(0);
  // Latch so the win cue plays exactly once per slide completion (our own
  // SLIDE_COMPLETE broadcast echoes back into the lastAction listener).
  const winCuedRef = useRef(false);

  // ── Interaction mode for the current round (spec §4) ──────────────────
  // whats_missing escalates recognize → produce in the second half of the
  // slide, capped by the objective's mastery rung (buildRound already clamps
  // rungByObjective). magic_eyes is always rung-1 recognition.
  const testedEntry: GridEntry | null = grid.length > 0 ? grid[missingIndex] : null;
  const interactionMode: InteractionMode = useMemo(() => {
    if (mode === 'magic_eyes') return 'recognize';
    const baseline = roundIndex <= Math.ceil(TOTAL_ROUNDS / 2) ? 1 : 4;
    if (baseline < 4) return 'recognize';
    const objRung = testedEntry ? (rungByObjective[testedEntry.objectiveId] ?? 1) : 1;
    return objRung >= 4 ? 'produce' : 'recognize';
  }, [mode, roundIndex, testedEntry, rungByObjective]);

  // ── Round setup (snapshot items into the board once per round) ────────
  const setupSigRef = useRef('');
  useEffect(() => {
    const source = usingFrozen ? frozenEntries : poolEntries;
    if (source.length === 0) return;
    const sig = `${mode}|${roundIndex}|${source.map((e) => e.objectiveId).join(',')}`;
    if (setupSigRef.current === sig) return;
    setupSigRef.current = sig;

    const gridSize = mode === 'magic_eyes' ? 1 : Math.min(MAX_GRID_ITEMS, source.length);
    // magic_eyes flashes ONE item per round — cycle through the entries so
    // consecutive rounds don't repeat the same image.
    const roundGrid = mode === 'magic_eyes'
      ? [source[(roundIndex - 1) % source.length]]
      : source.slice(0, gridSize);
    const idx = Math.floor(Math.random() * roundGrid.length);
    const entry = roundGrid[idx];

    // Candidate tray: the tested item's own options[] set (correct image +
    // its distractors), shuffled. Frozen data has no options[] — use the
    // whole grid's images as the candidate set instead.
    let cands: Candidate[];
    const poolItem = poolItemByObjective.get(entry.objectiveId);
    const c = poolItem?.content as any;
    const correctImage = c?.options?.[c.correct_index]?.image_url || entry.image;
    if (Array.isArray(c?.options) && c.options.length > 0) {
      cands = c.options.map((o: any) => ({
        image: String(o.image_url || ''),
        label: o.label,
        isCorrect: String(o.image_url || '') === String(correctImage),
      })).filter((cd: Candidate) => cd.image);
    } else {
      cands = roundGrid.map((g) => ({ image: g.image, isCorrect: g.image === entry.image }));
    }

    setGrid(roundGrid);
    setMissingIndex(idx);
    setCandidates(shuffle(cands));
    setEliminated([]);
    setFirstLetterHint(false);
    setShowExplanation(false);
    setFeedback(null);
    setGamePhase('memorize');
    setTimer(mode === 'magic_eyes' ? FLASH_SECONDS : MEMORIZE_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roundIndex, usingFrozen, frozenEntries, poolEntries, poolItemByObjective]);

  // ── Memorize/flash countdown → recall ─────────────────────────────────
  useEffect(() => {
    if (gamePhase !== 'memorize' || grid.length === 0) return;
    if (timer > 0) {
      const t = setInterval(() => setTimer((v) => v - 1), 1000);
      return () => clearInterval(t);
    }
    setGamePhase('recall');
  }, [gamePhase, timer, grid.length]);

  // ── Dual-write + cognitive capture helper ─────────────────────────────
  const doScoring = useCallback((correctness: 'correct' | 'partial' | 'incorrect', points: number, objectiveId: string, word: string) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (points !== 0) addPoints(picked, points);
    const difficulty = testedEntry
      ? effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode)
      : 1;
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId,
      exerciseType: 'IMAGE_SELECT',
      difficulty,
    }).catch(() => {});
    if (unitId && word) gradeStudent(picked, unitId, word, correctness !== 'incorrect').catch(() => {});
    if (correctness === 'incorrect') pushToRemediation(objectiveId, picked);
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
  }, []);

  const checkSlideComplete = useCallback(() => {
    // Dead-time compression: these are pure celebration holds (the reveal
    // strip already shows the answer) — ≤900ms, down from 2200ms.
    if (roundIndex >= TOTAL_ROUNDS) {
      setTimeout(() => {
        setGamePhase('slideComplete');
        triggerAction('SLIDE_COMPLETE', { forced: false });
      }, 900);
    } else {
      setTimeout(() => setRoundIndex((r) => r + 1), 900);
    }
  }, [roundIndex, triggerAction]);

  // ── Answer handlers ───────────────────────────────────────────────────
  const handleRecognizeTap = useCallback((cand: Candidate, candIndex: number) => {
    if (gamePhase !== 'recall' || !testedEntry) return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    if (cand.isCorrect) {
      awardedRef.current = true;
      const difficulty = effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode);
      streakRef.current += 1; // bumped before scoring so the award sees it
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
      streakRef.current += 1; // bumped before scoring so the award sees it
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
      // Produce-mode (speech) miss — same feedback weight as recognize mode.
      mistakesRef.current += 1;
      doScoring('incorrect', -MISTAKE_PENALTY, testedEntry.objectiveId, testedEntry.word);
      playCue('wrong');
      streakRef.current = 0;
      setFirstLetterHint(true); // narrowed hint: reveal the first letter
      setFeedback('incorrect');
      setTimeout(() => setFeedback(null), 700);
      if (mistakesRef.current >= 2) {
        playCue('reveal');
        setShowExplanation(true);
        setTimeout(() => setShowExplanation(false), 2500);
      }
    }
  }, [gamePhase, testedEntry, interactionMode, poolItemByObjective, doScoring, finishRound, checkSlideComplete, showAlreadyScored]);

  // ── Teacher controls ──────────────────────────────────────────────────
  const replayMemorize = useCallback(() => {
    if (gamePhase === 'slideComplete') return;
    setEliminated([]);
    setFirstLetterHint(false);
    setShowExplanation(false);
    setFeedback(null);
    setGamePhase('memorize');
    setTimer(mode === 'magic_eyes' ? FLASH_SECONDS : MEMORIZE_SECONDS);
  }, [gamePhase, mode]);

  const advanceRound = useCallback((opts?: { silent?: boolean }) => {
    if (gamePhase === 'slideComplete') return;
    if (roundIndex >= TOTAL_ROUNDS) {
      setGamePhase('slideComplete');
      // Natural end (NEXT_ROUND on the last round) celebrates via the inbound
      // SLIDE_COMPLETE echo; a silent skip ({ silent: true }) stays quiet.
      triggerAction('SLIDE_COMPLETE', { forced: !!opts?.silent ? true : false });
    } else {
      setRoundIndex((r) => r + 1);
    }
  }, [roundIndex, gamePhase, triggerAction]);

  // Auto-dismiss the terminal celebration after 6s. SLIDE_COMPLETE already
  // broadcast (above); this only hides the overlay so the board isn't stuck.
  useEffect(() => {
    if (gamePhase !== 'slideComplete') return;
    const t = setTimeout(() => setGamePhase('reveal'), 6000);
    return () => clearTimeout(t);
  }, [gamePhase]);

  const skipRound = useCallback(() => {
    // Skip: no penalty, no remediation push — just advance (no win cue).
    advanceRound({ silent: true });
  }, [advanceRound]);

  const revealHint = useCallback(() => {
    if (gamePhase !== 'recall') return;
    if (interactionMode === 'produce') {
      setFirstLetterHint(true);
    } else {
      // Eliminate one wrong candidate.
      setEliminated((prev) => {
        const idx = candidates.findIndex((c, i) => !c.isCorrect && !prev.includes(i));
        return idx === -1 ? prev : [...prev, idx];
      });
    }
  }, [gamePhase, interactionMode, candidates]);

  const forceCorrect = useCallback(() => {
    // Teacher override (defensible oral answer): award as clean correct.
    if (gamePhase !== 'recall' || !testedEntry) return;
    if (awardedRef.current) { showAlreadyScored(); return; }
    awardedRef.current = true;
    const difficulty = effectiveDifficulty(poolItemByObjective.get(testedEntry.objectiveId) ?? null, interactionMode);
    streakRef.current += 1; // teacher-confirmed oral answer counts toward the streak
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
    switch (action.type) {
      case 'SKIP_ROUND': skipRound(); break;
      case 'REVEAL_HINT': revealHint(); break;
      case 'MARK_CORRECT': forceCorrect(); break;
      case 'SHOW_AGAIN':
      case 'START_MEMORIZE': // legacy commander/remote alias
      case 'RESTART':        // legacy MagicEyes alias
        replayMemorize(); break;
      case 'NEXT_ROUND': advanceRound(); break;
      case 'REVEAL':
        playCue('reveal'); // legacy "give up, show it" — still a reveal beat
        finishRound(false);
        break;
      case 'WM_SUBMIT_ANSWER': handleProduceSubmit(String(action.payload?.text ?? '')); break;
      case 'RESET_GAME':
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
        // Forced End from the remote/commander AND our own natural-completion
        // broadcast (optimistic lastAction echo) both land here — a single
        // win-cue site, latched so it plays exactly once. The only forced:true
        // producer is a skip path, which stays silent.
        setGamePhase('slideComplete');
        if (action.payload?.forced !== true && !winCuedRef.current) {
          winCuedRef.current = true;
          playCue('win');
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

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
    if (action.type === 'REVEAL') setLegacyPhase('reveal');
    else if (action.type === 'RESTART' || action.type === 'SHOW_AGAIN' || action.type === 'RESET_GAME') {
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

  const isMagic = mode === 'magic_eyes';
  const memorizeSeconds = isMagic ? FLASH_SECONDS : MEMORIZE_SECONDS;
  const testedWord = testedEntry?.word || '';

  return (
    <div className="h-full bg-indigo-950 flex flex-col relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-800/50 to-transparent"></div>

      {/* Header */}
      <div className="relative z-10 p-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-2xl ${gamePhase === 'memorize' ? 'bg-emerald-500' : 'bg-indigo-600'} text-white shadow-lg transition-colors duration-500`}>
            {gamePhase === 'memorize' ? <Eye size={28} /> : <EyeOff size={28} />}
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-white">
              {gamePhase === 'memorize' ? (isMagic ? 'Magic Eyes — Memorize!' : 'Memorize!')
                : gamePhase === 'recall' ? (isMagic ? 'What did you see?' : interactionMode === 'produce' ? "What's missing? Say it!" : "What's Missing?")
                : 'Revealed!'}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-indigo-300 text-sm font-bold">Round {roundIndex}/{TOTAL_ROUNDS}</span>
              {interactionMode === 'produce' && gamePhase === 'recall' && (
                <span className="text-xs font-bold uppercase tracking-wider bg-fuchsia-500/30 text-fuchsia-200 px-2 py-0.5 rounded-full">Spell it!</span>
              )}
              <div className="h-2 w-40 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full transition-all duration-1000 linear ${gamePhase === 'memorize' ? 'bg-emerald-400' : 'bg-transparent'}`}
                  style={{ width: gamePhase === 'memorize' ? `${(timer / memorizeSeconds) * 100}%` : '0%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MEMORIZE / FLASH PHASE ═══ */}
      {gamePhase === 'memorize' && (
        <div className="flex-1 relative z-10 px-8 pb-8 flex items-center justify-center">
          {isMagic ? (
            <div className="w-full max-w-3xl aspect-video bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center justify-center">
              <img src={grid[0]?.image} alt={grid[0]?.word} className="max-h-[70%] object-contain drop-shadow-md mb-4" />
              <h3 className="text-4xl font-display font-bold text-slate-800">{grid[0]?.word}</h3>
            </div>
          ) : (
            <div className={`grid gap-6 w-full max-w-7xl ${grid.length <= 4 ? 'grid-cols-2 max-w-4xl' : 'grid-cols-4'}`}>
              {grid.map((item, i) => (
                <div key={i} className="aspect-[4/3] rounded-3xl shadow-2xl bg-white flex flex-col items-center justify-center p-4">
                  <img src={item.image} alt={item.word} className="h-2/3 object-contain drop-shadow-md mb-3" />
                  <h3 className="text-2xl font-display font-bold text-slate-800">{item.word}</h3>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ RECALL + REVEAL PHASE ═══ */}
      {(gamePhase === 'recall' || gamePhase === 'reveal' || gamePhase === 'slideComplete') && (
        <div className="flex-1 relative z-10 px-8 pb-6 flex flex-col items-center justify-center gap-6">
          {/* Grid with the missing tile (whats_missing) or blurred flash (magic_eyes) */}
          {isMagic ? (
            <div className="w-full max-w-3xl aspect-video rounded-3xl overflow-hidden shadow-2xl relative">
              <img src={grid[0]?.image} alt="" className={`w-full h-full object-cover transition-all duration-1000 ${gamePhase === 'reveal' ? 'blur-0 opacity-100' : 'blur-[80px] opacity-40 scale-110'}`} />
              {gamePhase === 'reveal' && (
                <div className="absolute inset-0 rounded-3xl border-8 border-yellow-400 pointer-events-none"></div>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 w-full ${grid.length <= 4 ? 'grid-cols-2 max-w-4xl' : 'grid-cols-4 max-w-7xl'}`}>
              {grid.map((item, i) => {
                const isMissing = i === missingIndex;
                const revealed = isMissing && gamePhase !== 'recall';
                return (
                  <div key={i}
                    className={`aspect-[4/3] rounded-3xl shadow-2xl transition-all duration-500 relative
                      ${isMissing && !revealed ? 'bg-indigo-900/50 border-4 border-dashed border-indigo-500/50' : 'bg-white'}`}>
                    <div className={`w-full h-full p-3 flex flex-col items-center justify-center transition-opacity duration-300 ${isMissing && !revealed ? 'opacity-0' : 'opacity-100'}`}>
                      <img src={item.image} alt={revealed ? item.word : ''} className="h-2/3 object-contain drop-shadow-md mb-2" />
                      {/* Labels hidden during recall (keeps produce mode honest) */}
                      {(!isMissing || revealed) && <h3 className="text-xl font-display font-bold text-slate-800">{item.word}</h3>}
                    </div>
                    {isMissing && !revealed && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <HelpCircle size={64} className="text-indigo-500/50 animate-bounce" />
                      </div>
                    )}
                    {revealed && (
                      <div className="absolute inset-0 rounded-3xl border-8 border-yellow-400 pointer-events-none"></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Produce-mode prompt (teacher types the student's answer on the Baton) */}
          {interactionMode === 'produce' && gamePhase === 'recall' && (
            <div className="flex flex-col items-center gap-2">
              <div className="bg-fuchsia-600/30 border-2 border-fuchsia-400/50 text-white text-2xl font-display font-bold px-8 py-4 rounded-2xl">
                {pickedStudent ? `${pickedStudent.name}, say the missing word!` : 'Say the missing word!'}
              </div>
              {firstLetterHint && testedWord && (
                <div className="bg-yellow-400 text-yellow-950 font-bold text-xl px-6 py-2 rounded-xl animate-pop-in">
                  Hint: starts with “{testedWord.charAt(0).toUpperCase()}”
                </div>
              )}
              <p className="text-indigo-300 text-sm">Teacher: type the answer on the Baton to submit.</p>
            </div>
          )}

          {/* Recognize-mode candidate tray */}
          {interactionMode === 'recognize' && gamePhase === 'recall' && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-indigo-200 text-xl font-display font-bold">
                {isMagic ? 'Which one was it?' : 'Which one is gone? Tap it!'}
              </p>
              <div className="flex gap-4 flex-wrap justify-center">
                {candidates.map((cand, i) => {
                  const isEliminated = eliminated.includes(i);
                  return (
                    <button key={i} onClick={() => handleRecognizeTap(cand, i)} disabled={isEliminated}
                      className={`w-36 h-28 rounded-2xl bg-white shadow-xl p-2 transition-all duration-300
                        ${isEliminated ? 'opacity-20 scale-90 cursor-not-allowed' : 'hover:scale-110 hover:-translate-y-1 active:scale-95'}
                        ${feedback === 'incorrect' ? 'animate-shake' : ''}`}>
                      <img src={cand.image} alt="" className="w-full h-full object-contain drop-shadow" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reveal feedback strip */}
          {gamePhase === 'reveal' && testedEntry && (
            <div className={`px-10 py-4 rounded-3xl shadow-2xl flex items-center gap-5 animate-bounce-subtle ${feedback === 'correct' ? 'bg-green-500' : 'bg-yellow-500'} text-white`}>
              {feedback === 'correct' ? <Check size={36} strokeWidth={4} /> : <Lightbulb size={36} />}
              <div className="text-left">
                <div className="text-2xl font-display font-black">
                  {feedback === 'correct'
                    ? (pickedStudent ? `Nice one, ${pickedStudent.name}!` : 'Correct!')
                    : `It was: ${testedEntry.word}`}
                </div>
              </div>
              <img src={testedEntry.image} alt={testedEntry.word} className="h-16 w-16 object-contain bg-white/20 rounded-xl p-1" />
            </div>
          )}
        </div>
      )}

      {/* Already-scored chip (spec: make the award latch visible) */}
      {alreadyScoredChip && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-800/90 text-white px-5 py-2 rounded-full font-bold animate-fade-in">
          🔁 already scored this turn
        </div>
      )}

      {/* 2nd-miss micro-explanation card */}
      {showExplanation && testedEntry && gamePhase === 'recall' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-fade-in max-w-md">
            <Lightbulb size={40} className="text-amber-500 mb-3" />
            <img src={testedEntry.image} alt={testedEntry.word} className="h-32 object-contain drop-shadow mb-3" />
            <p className="text-3xl font-display font-bold text-slate-800">{testedEntry.word}</p>
            <p className="text-slate-500 mt-1">Here's what it was!</p>
          </div>
        </div>
      )}

      {/* Slide complete overlay — click to dismiss */}
      {gamePhase === 'slideComplete' && (
        <div
          onClick={() => setGamePhase('reveal')}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mb-6">
              <Eye size={64} strokeWidth={2.5} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">
              {pickedStudent ? `Great memory, ${pickedStudent.name}!` : 'Great memory, everyone!'}
            </h2>
            <p className="text-2xl text-slate-500 font-medium">Ready for the next slide.</p>
            <p className="text-sm text-slate-400 mt-4 animate-pulse">tap to dismiss</p>
          </div>
        </div>
      )}

      <style>{`
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
