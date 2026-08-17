// BoardWordSearch — vocabulary word-search shell (PRACTICE phase).
//
// Adapted from a solo ESL word-search game into the live classroom loop
// (LIVE_GAME_LIFECYCLE.md). One shared grid per round persists across turns:
//
//   • OPEN mode (default, no responder): students raise hands, tell the
//     teacher, and the teacher taps the word's first + last letter on the
//     board. Locking opens a "Who found it?" roster picker → addPoints.
//   • COLLABORATIVE (wheel-picked responder): the student at the board taps;
//     found words auto-score via scoreForAttempt to the picked student.
//   • RELAY: same board; a team-turn indicator alternates on every found
//     word (teams come from assignTeams — BoardShell renders the rails).
//
// Escalation by round: r1 words visible on clue cards + →↓ directions only;
// r2 image-only clues (tap to reveal + audio) + 6 directions + biased fill;
// r3 all 8 directions. Clue button (REVEAL_HINT) circles an unfound word's
// first letter and HALVES that word's award (min 1) — the original game's
// −100/−200 clue penalty rescaled into the unified 1–5 economy.
//
// Lifecycle: standard 4 must-dos. NEW_TURN resets turn refs but NOT the grid
// (the collaborative board accumulates found words across students). Wrong
// swipes (≥3 letters) cost −1 via addPoints when a responder is picked; they
// carry no analytics write (no objective to attach a generic miss to).
//
// Content: useEscalatingPool (IMAGE_SELECT + MEANING_MATCH merged per
// objective) → vocabulary_items fallback (production pools are empty on many
// units) → frozen data.words. See wordSearch/content.ts.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Check, RefreshCcw, Lightbulb, Play, Pause, Plus, Star, ChevronRight, Hand, Users } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useEscalatingPool } from '../useEscalatingPool';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playCue } from './playCue';
import { useSpeech } from './useSpeech';
import { filterPresent } from '../../../services/attendanceLogic';
import { getVocabulary } from '../../../services/manifest';
import { playAudioUrl } from '../../../services/SpeechService';
import type { ContextualControlsSpec } from '../lessonDirector';
import {
  buildGrid,
  hashString,
  matchSegment,
  mulberry32,
  snapLine,
  DIRECTIONS_EASY,
  DIRECTIONS_MEDIUM,
  DIRECTIONS_ALL,
  type Cell,
  type SearchGrid,
} from './wordSearch/gridEngine';
import {
  detectClueMode,
  frozenToWords,
  poolToWords,
  takeRound,
  toGridWords,
  vocabularyToWords,
  type SearchWord,
} from './wordSearch/content';

// ── Config (flow block data) ───────────────────────────────────────────────
const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
};

export type WordSearchMode = 'open' | 'collaborative' | 'relay';

// ── Contextual controls contract ───────────────────────────────────────────
export const WORD_SEARCH_ACTION_TYPES = {
  hint: 'REVEAL_HINT',
  reveal: 'REVEAL_ANSWER',
  forceCorrect: 'MARK_CORRECT',
  skip: 'SKIP_ROUND',
  nextRound: 'NEXT_ROUND',
  reset: 'RESET_GAME',
  endSlide: 'SLIDE_COMPLETE',
  playPause: 'PLAY_PAUSE',
  addTime: 'ADD_TIME_30',
} as const;

const noop = () => {};
export const WORD_SEARCH_CONTROLS: ContextualControlsSpec = {
  shellType: 'WORD_SEARCH',
  controls: {
    revealHint:   { label: 'Clue', enabled: true, onTrigger: noop }, // circles a first letter, halves that word's award
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    skip:         { label: 'Skip Round', enabled: true, onTrigger: noop },
    nextRound:    { label: 'Next', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
    playPause:    { label: 'Play/Pause', enabled: true, onTrigger: noop },
    addTime:      { label: '+30s', enabled: true, onTrigger: noop },
  },
};

// ── Types ──────────────────────────────────────────────────────────────────
type Stage = 'preview' | 'play' | 'summary' | 'final';
interface FoundEntry {
  cells: Cell[];
  byStudentId: string | null;
  award: number;
  revealed: boolean;
}
interface RoundStats { credited: number; revealed: number; misses: number; hints: number; }
const ZERO_STATS: RoundStats = { credited: 0, revealed: 0, misses: 0, hints: 0 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Clue card (used by the preview screen and the play flanks) ─────────────
interface ClueCardProps {
  word: SearchWord;
  found: boolean;
  /** Show the English word without a tap (round 1 / text mode / found). */
  showWord: boolean;
  /** Clue face when the word is hidden: L1 meaning (text mode) or nothing (image mode). */
  meaningClue: boolean;
  hinted: boolean;
  unitId: string;
  compact?: boolean;
  onReveal?: () => void;
}

const ClueCard: React.FC<ClueCardProps> = ({ word, found, showWord, meaningClue, hinted, unitId, compact }) => {
  const [tapped, setTapped] = useState(false);
  const { play } = useSpeech({ text: word.word, audioUrl: word.audioUrl, lang: 'en', unitId });
  const wordVisible = showWord || found || tapped;

  return (
    <button
      onClick={() => { setTapped(true); play(); }}
      className={`relative bg-white rounded-2xl border-2 shadow-lg transition-all active:scale-95 overflow-hidden flex flex-col items-center
        ${compact ? 'w-32 xl:w-36 p-2' : 'w-40 p-3'}
        ${found ? 'border-emerald-400' : 'border-slate-200 hover:border-sky-300'}`}
    >
      {word.imageUrl ? (
        <div className={`w-full rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center ${compact ? 'h-20 xl:h-24' : 'h-28'}`}>
          <img src={word.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className={`w-full rounded-xl bg-sky-100 text-sky-700 font-black flex items-center justify-center ${compact ? 'h-20 xl:h-24 text-3xl' : 'h-28 text-4xl'}`}>
          {meaningClue && word.meaning ? word.meaning : word.word.slice(0, 1)}
        </div>
      )}
      <div className={`w-full text-center truncate font-bold mt-1 ${compact ? 'text-sm' : 'text-lg'} ${wordVisible ? 'text-slate-800' : 'text-transparent select-none'}`}>
        {word.word}
      </div>
      {!wordVisible && (
        <div className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {meaningClue && word.meaning ? 'tap for English' : 'tap to hear it'}
        </div>
      )}
      {found && (
        <span className="absolute -top-1 -right-1 w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-pop-in">
          <Check size={16} strokeWidth={3} />
        </span>
      )}
      {hinted && !found && (
        <span className="absolute top-1 left-1 bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded-full" title="Clue used — half points for this word">
          ½ pts
        </span>
      )}
    </button>
  );
};

// ── Component ──────────────────────────────────────────────────────────────
const BoardWordSearch: React.FC<{ data: any }> = ({ data }) => {
  const { state, triggerAction, addPoints, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phaseTag = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // Config from the frozen block data.
  const TOTAL_ROUNDS = clampInt(data?.rounds, 1, 5, 3);
  const WORDS_PER_ROUND = clampInt(data?.wordsPerRound, 3, 6, 5);
  const rawSeconds = Number(data?.seconds);
  const SECONDS = Number.isFinite(rawSeconds) && rawSeconds >= 0 ? Math.min(3600, Math.round(rawSeconds)) : 120;
  const TIMED = SECONDS > 0;
  const MODE: WordSearchMode =
    data?.mode === 'relay' ? 'relay' : data?.mode === 'collaborative' ? 'collaborative' : 'open';

  // ── Content: escalating pool → vocabulary_items → frozen data.words ─────
  const [roundIndex, setRoundIndex] = useState(1);
  const { items, loading: poolLoading } = useEscalatingPool({
    unitId,
    shellType: 'WORD_SEARCH',
    phase: phaseTag,
    roster,
    roundIndex,
    totalRounds: TOTAL_ROUNDS,
    roundSize: WORDS_PER_ROUND,
  });

  const poolWords = useMemo(() => poolToWords(items), [items]);
  const vocabWords = useMemo(
    () => (poolWords.length > 0 ? [] : vocabularyToWords(getVocabulary(state.activeUnit?.manifest))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unitId, poolWords.length],
  );
  const frozenWords = useMemo(() => frozenToWords(Array.isArray(data?.words) ? data.words : []), [data?.words]);

  const fallbackSource = vocabWords.length > 0 ? vocabWords : frozenWords;
  const roundWords: SearchWord[] = useMemo(() => {
    if (poolWords.length > 0) return poolWords; // escalating pool already dealt this round
    return takeRound(fallbackSource, roundIndex, WORDS_PER_ROUND, mulberry32(hashString(`${unitId}|deal`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolWords, fallbackSource, roundIndex, WORDS_PER_ROUND, unitId]);

  const clueMode = useMemo(() => detectClueMode(roundWords), [roundWords]);

  // ── Game state ──────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('preview');
  const [grid, setGrid] = useState<SearchGrid | null>(null);
  const [found, setFound] = useState<Record<string, FoundEntry>>({});
  const [roundStats, setRoundStats] = useState<RoundStats>(ZERO_STATS);
  const [sel, setSel] = useState<{ anchor: Cell; cells: Cell[] } | null>(null);
  const [hintCell, setHintCell] = useState<Cell | null>(null);
  const [clueWordIds, setClueWordIds] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [credit, setCredit] = useState<{ wordId: string; award: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [timerRunning, setTimerRunning] = useState(TIMED);
  const [roundBonus, setRoundBonus] = useState(0);
  const [lastFinderName, setLastFinderName] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [finalStars, setFinalStars] = useState(0);
  const [relayIdx, setRelayIdx] = useState(0);

  // ── Lifecycle refs (the 4 must-dos) ─────────────────────────────────────
  const mistakesRef = useRef(0);
  const streakRef = useRef(0);
  const awardedThisTurnRef = useRef<Set<string>>(new Set());
  const clueUsedRef = useRef<Set<string>>(new Set());
  const lastFinderRef = useRef<{ id: string; name: string } | null>(null);
  const playStartRef = useRef(0);
  const resetCountRef = useRef(0);
  const buildSigRef = useRef('');
  const dragRef = useRef(false);
  const gridElRef = useRef<HTMLDivElement | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const [boxPx, setBoxPx] = useState(0);
  const totalsRef = useRef({ found: 0, revealed: 0, total: 0, misses: 0, hints: 0 });

  // Relay teams: derived from the roster's team values (assignTeams uses
  // TEAM_COLORS; we just need the distinct sorted labels).
  const relayTeams = useMemo(() => {
    const teams = new Set<string>();
    for (const s of filterPresent(state.students || [])) {
      if (s.team) teams.add(String(s.team));
    }
    return [...teams].sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.students]);

  const nameOf = useCallback((studentId: string) => {
    const s = (state.students || []).find((st: any) => st.id === studentId);
    return s?.name || s?.full_name || s?.display_name || 'Student';
  }, [state.students]);

  const speakWord = useCallback((word: SearchWord) => {
    playAudioUrl(word.audioUrl, word.word, 'en').catch(() => {});
  }, []);

  const flashMessage = useCallback((text: string, good: boolean) => {
    setMessage({ text, good });
    setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 1800);
  }, []);

  // ── Analytics + FSRS (triple-write, minus remediation on success) ───────
  const writeAnalytics = useCallback((studentId: string, word: SearchWord, correctness: 'correct') => {
    const student = (state.students || []).find((s: any) => s.id === studentId);
    const realObjective = UUID_RE.test(word.objectiveId);
    recordAttempt({
      rosterId: studentId,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId: realObjective ? word.objectiveId : undefined,
      exerciseType: word.exerciseType,
      difficulty: word.difficulty,
    }).catch(() => {});
    if (unitId && realObjective) {
      gradeObjective(studentId, unitId, word.objectiveId, true, 'receptive').catch(() => {});
    }
  }, [state.students, state.activeClassId, unitId]);

  // ── Award pipeline ──────────────────────────────────────────────────────
  const awardWord = useCallback((studentId: string, word: SearchWord, award: number) => {
    addPoints(studentId, award);
    awardedThisTurnRef.current.add(word.id);
    lastFinderRef.current = { id: studentId, name: nameOf(studentId) };
    setLastFinderName(nameOf(studentId));
    writeAnalytics(studentId, word, 'correct');
  }, [addPoints, nameOf, writeAnalytics]);

  /**
   * Lock a word as found. `revealed` (teacher Reveal) locks without points;
   * `creditStudentId` forces the recipient (MARK_CORRECT); otherwise the
   * wheel-picked responder gets it — or, in open mode, the credit picker opens.
   */
  const lockWord = useCallback((word: SearchWord, cells: Cell[], opts: { revealed?: boolean; creditStudentId?: string } = {}) => {
    const picked = state.quickWheelWinner;
    const awardTo = opts.creditStudentId ?? picked ?? null;

    let award = 0;
    if (!opts.revealed) {
      streakRef.current += 1;
      const base = scoreForAttempt(mistakesRef.current, word.difficulty, 1, streakRef.current);
      award = clueUsedRef.current.has(word.id) ? Math.max(1, Math.floor(base / 2)) : base;
    }

    setFound((prev) => (prev[word.id] ? prev : {
      ...prev,
      [word.id]: { cells, byStudentId: opts.revealed ? null : awardTo, award, revealed: !!opts.revealed },
    }));
    if (opts.revealed) {
      totalsRef.current.revealed += 1;
      setRoundStats((s) => ({ ...s, revealed: s.revealed + 1 }));
      playCue('reveal');
      speakWord(word);
      flashMessage(`It was ${word.word.toUpperCase()}`, false);
    } else {
      totalsRef.current.found += 1;
      setRoundStats((s) => ({ ...s, credited: s.credited + 1 }));
      playCue('correct');
      speakWord(word);
      if (streakRef.current === 3 || streakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      if (awardTo) {
        awardWord(awardTo, word, award);
        flashMessage(`${nameOf(awardTo)} found ${word.word.toUpperCase()}! +${award}`, true);
      } else {
        setCredit({ wordId: word.id, award });
      }
    }
    if (MODE === 'relay' && relayTeams.length >= 2) {
      setRelayIdx((i) => (i + 1) % relayTeams.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quickWheelWinner, awardWord, nameOf, speakWord, flashMessage, triggerConfetti, MODE, relayTeams.length]);

  const onMiss = useCallback(() => {
    mistakesRef.current += 1;
    streakRef.current = 0;
    totalsRef.current.misses += 1;
    setRoundStats((s) => ({ ...s, misses: s.misses + 1 }));
    playCue('wrong');
    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 600);
    const picked = state.quickWheelWinner;
    if (picked) addPoints(picked, -MISTAKE_PENALTY);
  }, [state.quickWheelWinner, addPoints]);

  // ── Grid rebuild per round (buildSig dedupe; persists across turns) ─────
  useEffect(() => {
    if (roundWords.length === 0) return;
    const sig = `${unitId}|${roundIndex}|${resetCountRef.current}|${roundWords.map((w) => w.id).join(',')}`;
    if (buildSigRef.current === sig) return;
    buildSigRef.current = sig;

    const directions = roundIndex === 1 ? DIRECTIONS_EASY : roundIndex === 2 ? DIRECTIONS_MEDIUM : DIRECTIONS_ALL;
    const g = buildGrid(toGridWords(roundWords), {
      directions,
      seed: hashString(sig),
      fillBias: roundIndex >= 2,
    });
    setGrid(g);
    totalsRef.current.total += roundWords.length;

    // Fresh round state (the grid persists across student turns, not rounds).
    setFound({});
    clueUsedRef.current = new Set();
    setClueWordIds(new Set());
    setRoundStats(ZERO_STATS);
    setSel(null);
    setHintCell(null);
    setCredit(null);
    setRoundBonus(0);
    setLastFinderName(null);
    lastFinderRef.current = null;
    setTimeLeft(SECONDS);
    setTimerRunning(TIMED);
    setStage('preview');
    mistakesRef.current = 0;
    streakRef.current = 0;
    awardedThisTurnRef.current.clear();
    playStartRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundWords, roundIndex, unitId]);

  // ── Selection: tap-first/tap-last + pointer drag (grid container) ───────
  const cellFromEvent = useCallback((e: React.PointerEvent): Cell | null => {
    const el = gridElRef.current;
    if (!el || !grid) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * grid.size);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * grid.size);
    if (row < 0 || row >= grid.size || col < 0 || col >= grid.size) return null;
    return { row, col };
  }, [grid]);

  const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;

  const onGridPointerDown = useCallback((e: React.PointerEvent) => {
    if (stage !== 'play' || credit) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    // Capture so pointermove/up keep targeting the grid even outside it.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (sel && sel.cells.length === 1 && !sameCell(sel.anchor, cell)) {
      // Tap-tap completion: extend the anchored line to this cell.
      setSel({ anchor: sel.anchor, cells: snapLine(sel.anchor, cell, grid?.size ?? 8) });
      dragRef.current = false;
    } else {
      setSel({ anchor: cell, cells: [cell] });
      dragRef.current = true;
    }
  }, [stage, credit, cellFromEvent, sel, grid]);

  const onGridPointerMove = useCallback((e: React.PointerEvent) => {
    if (!sel || !dragRef.current || !grid) return;
    const cell = cellFromEvent(e);
    if (!cell || sameCell(sel.anchor, cell)) {
      setSel((prev) => (prev ? { ...prev, cells: [prev.anchor] } : prev));
      return;
    }
    setSel((prev) => (prev ? { ...prev, cells: snapLine(prev.anchor, cell, grid.size) } : prev));
  }, [sel, grid, cellFromEvent]);

  const validateSelection = useCallback((cells: Cell[]) => {
    if (!grid) { setSel(null); return; }
    if (cells.length === 1) return; // tap-mode: keep the anchor, waiting for the second tap
    if (cells.length < 3) { setSel(null); return; } // 2-letter taps are noise, never a miss

    // Re-tap on an already-found word is a silent no-op, never a miss.
    const spelled = cells.map((c) => grid.cells[c.row]?.[c.col] ?? '').join('');
    const reversed = spelled.split('').reverse().join('');
    const alreadyFound = roundWords.some((w) => found[w.id] && (w.letters === spelled || w.letters === reversed));
    if (alreadyFound) { setSel(null); return; }

    const candidates = roundWords.filter((w) => !found[w.id]).map((w) => ({ id: w.id, letters: w.letters }));
    const hit = matchSegment(cells, grid, candidates);
    if (hit) {
      const word = roundWords.find((w) => w.id === hit.id);
      if (word) lockWord(word, cells);
    } else {
      onMiss();
    }
    setSel(null);
  }, [grid, roundWords, found, lockWord, onMiss]);

  const onGridPointerUp = useCallback(() => {
    dragRef.current = false;
    if (!sel) return;
    validateSelection(sel.cells);
  }, [sel, validateSelection]);

  // ── Timer (pure decrement; side effects live in effects, not updaters) ──
  useEffect(() => {
    if (stage !== 'play' || !TIMED || !timerRunning) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [stage, timerRunning, TIMED]);

  useEffect(() => {
    if (stage === 'play' && timeLeft === 0 && timerRunning) setTimerRunning(false);
  }, [timeLeft, timerRunning, stage]);

  useEffect(() => {
    if (stage === 'play' && playStartRef.current === 0) playStartRef.current = Date.now();
  }, [stage]);

  // ── Grid box: measure the wrapper, force a TRUE pixel square ────────────
  // aspect-square + max-h-full gets clamped into a rectangle by short
  // containers (commander preview), which desyncs the pill geometry from the
  // letters — pills mix % of width and % of height as one unit, which is only
  // exact for a perfect square. A measured square + pixel math is exact in
  // every container. The wrapper only mounts in the play stage, so this must
  // re-run on stage changes.
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBoxPx(Math.max(0, Math.floor(Math.min(r.width, r.height))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage]);

  // Hint ring auto-clears.
  useEffect(() => {
    if (!hintCell) return;
    const t = setTimeout(() => setHintCell(null), 3500);
    return () => clearTimeout(t);
  }, [hintCell]);

  // ── Round completion → summary + time bonus ─────────────────────────────
  useEffect(() => {
    if (stage !== 'play' || roundWords.length === 0) return;
    if (Object.keys(found).length < roundWords.length) return;

    let bonus = 0;
    if (TIMED && timeLeft > 0) {
      const frac = timeLeft / SECONDS;
      bonus = frac >= 0.66 ? 3 : frac >= 0.33 ? 2 : 1;
    }
    setRoundBonus(bonus);
    setElapsedSec(TIMED ? SECONDS - timeLeft : Math.max(0, Math.round((Date.now() - playStartRef.current) / 1000)));
    if (bonus > 0 && lastFinderRef.current) {
      addPoints(lastFinderRef.current.id, bonus); // speed bonus to the round-closer
    }
    setStage('summary');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, stage, roundWords]);

  // ── Finish / stars ──────────────────────────────────────────────────────
  const computeStars = useCallback(() => {
    const t = totalsRef.current;
    if (t.total === 0) return 0;
    const ratio = t.found / t.total;
    if (ratio >= 1 && t.misses <= 1 && t.hints === 0) return 5;
    if (ratio >= 1 && t.misses <= 3 && t.hints <= 1) return 4;
    if (ratio >= 0.8) return 3;
    if (ratio >= 0.6) return 2;
    return 1;
  }, []);

  const finish = useCallback((silent: boolean) => {
    setFinalStars(computeStars());
    setStage('final');
    if (!silent) {
      triggerConfetti();
      playCue('win');
    }
    triggerAction('SLIDE_COMPLETE', { forced: silent });
  }, [computeStars, triggerConfetti, triggerAction]);

  const advanceRound = useCallback((silent: boolean) => {
    if (stage === 'final') return;
    if (roundIndex >= TOTAL_ROUNDS) {
      finish(silent);
    } else {
      setRoundIndex((r) => r + 1); // grid effect rebuilds + returns to preview
    }
  }, [stage, roundIndex, TOTAL_ROUNDS, finish]);

  const startRound = useCallback(() => {
    setStage('play');
    playStartRef.current = Date.now();
    setTimerRunning(TIMED && timeLeft > 0 ? true : timerRunning);
  }, [TIMED, timeLeft, timerRunning]);

  // ── Teacher actions ─────────────────────────────────────────────────────
  const giveClue = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const unfound = roundWords.filter((w) => !found[w.id]);
    if (unfound.length === 0) return;
    const word = unfound[Math.floor(Math.random() * unfound.length)];
    const placement = grid.placements.find((p) => p.wordId === word.id);
    setHintCell(placement?.cells[0] ?? null);
    clueUsedRef.current.add(word.id);
    setClueWordIds((prev) => new Set(prev).add(word.id));
    totalsRef.current.hints += 1;
    setRoundStats((s) => ({ ...s, hints: s.hints + 1 }));
    playCue('reveal');
  }, [stage, grid, roundWords, found]);

  const revealAnswer = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const word = roundWords.find((w) => !found[w.id]);
    if (!word) return;
    const placement = grid.placements.find((p) => p.wordId === word.id);
    if (!placement) return;
    lockWord(word, placement.cells, { revealed: true });
  }, [stage, grid, roundWords, found, lockWord]);

  const markCorrect = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const word = roundWords.find((w) => !found[w.id]);
    if (!word) return;
    const placement = grid.placements.find((p) => p.wordId === word.id);
    if (!placement) return;
    lockWord(word, placement.cells, {
      creditStudentId: state.quickWheelWinner ?? undefined, // open mode → credit picker
    });
  }, [stage, grid, roundWords, found, lockWord, state.quickWheelWinner]);

  const resetGame = useCallback(() => {
    resetCountRef.current += 1; // reshuffles the grid with the same word set
    setRoundIndex(1);
    setFinalStars(0);
    setRelayIdx(0);
    totalsRef.current = { found: 0, revealed: 0, total: 0, misses: 0, hints: 0 };
    mistakesRef.current = 0;
    streakRef.current = 0;
    awardedThisTurnRef.current.clear();
    // Round state itself resets in the grid-build effect (sig includes the counter).
  }, []);

  // ── Credit picker (open mode) ───────────────────────────────────────────
  const resolveCredit = useCallback((studentId: string | null) => {
    if (!credit) return;
    if (studentId) {
      const word = roundWords.find((w) => w.id === credit.wordId);
      if (word) awardWord(studentId, word, credit.award);
      flashMessage(`${nameOf(studentId)} found ${word?.word ?? ''}! +${credit.award}`, true);
    }
    setCredit(null);
  }, [credit, roundWords, awardWord, nameOf, flashMessage]);

  // ── Remote/commander action listener ────────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'REVEAL_HINT': giveClue(); break;
      case 'REVEAL_ANSWER': revealAnswer(); break;
      case 'MARK_CORRECT': markCorrect(); break;
      case 'SKIP_ROUND': advanceRound(true); break;
      case 'NEXT_ROUND':
        if (stage === 'summary') advanceRound(false);
        else if (stage === 'play') advanceRound(true); // teacher abandons the round
        break;
      case 'PLAY_PAUSE': setTimerRunning((r) => !r); break;
      case 'ADD_TIME_30': setTimeLeft((t) => t + 30); break;
      case 'RESET_GAME': resetGame(); break;
      case 'SLIDE_COMPLETE':
        if (stage !== 'final') {
          setFinalStars(computeStars());
          setStage('final');
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Game-lifecycle: NEW_TURN → fresh turn refs (grid persists) ──────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = open class / practice
    mistakesRef.current = 0;
    streakRef.current = 0;
    awardedThisTurnRef.current.clear();
    // Deliberately NOT resetting the grid/found words — the collaborative
    // board accumulates across turns; only per-turn scoring state is fresh.
  }, [turnId]);

  // ── Empty / loading state (after ALL hooks — Rules of Hooks) ────────────
  const presentStudents = useMemo(
    () => filterPresent(state.students || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.students],
  );
  const contentEmpty = !poolLoading && roundWords.length === 0;
  if (poolLoading || contentEmpty) {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-bold text-slate-500 mb-2">Word Search</h1>
        <p className="text-slate-600 text-xl max-w-xl">
          {poolLoading ? 'Loading…' : "This unit has no vocabulary words yet. Add vocabulary (or generate the exercise pool) first."}
        </p>
        {contentEmpty && (
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Slide
          </button>
        )}
      </div>
    );
  }

  // ── Derived render data ─────────────────────────────────────────────────
  const size = grid?.size ?? 8;
  const foundCount = Object.keys(found).length;
  const isFinalRound = roundIndex >= TOTAL_ROUNDS;
  const selCells = sel?.cells ?? [];
  const selKeySet = new Set(selCells.map((c) => `${c.row},${c.col}`));
  const timePct = TIMED ? Math.max(0, Math.min(100, (timeLeft / SECONDS) * 100)) : 100;

  // Pill geometry in pixels of the measured square box (boxPx) — always in
  // lockstep with the letter cells, in every container size.
  const pillStyle = (cells: Cell[], tone: 'sel' | 'found' | 'revealed'): React.CSSProperties => {
    if (!boxPx) return { display: 'none' };
    const cell = boxPx / size;
    const a = cells[0];
    const b = cells[cells.length - 1];
    const x0 = (a.col + 0.5) * cell;
    const y0 = (a.row + 0.5) * cell;
    const x1 = (b.col + 0.5) * cell;
    const y1 = (b.row + 0.5) * cell;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    const bg = tone === 'sel'
      ? 'rgba(250, 204, 21, 0.45)'
      : tone === 'found' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(148, 163, 184, 0.35)';
    return {
      position: 'absolute',
      left: `${x0}px`,
      top: `${y0}px`,
      width: `${len}px`,
      height: `${cell * 0.94}px`,
      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      background: bg,
      border: tone === 'sel' ? '2px solid rgba(234, 179, 8, 0.9)' : '2px solid rgba(255,255,255,0.35)',
      borderRadius: '9999px',
      pointerEvents: 'none',
    };
  };

  const leftCards = roundWords.filter((_, i) => i % 2 === 0);
  const rightCards = roundWords.filter((_, i) => i % 2 === 1);
  const showWordOnCards = clueMode === 'text' || roundIndex === 1;
  const meaningClue = clueMode === 'text' && roundIndex >= 2;

  const modeChip = MODE === 'relay' && relayTeams.length >= 2 ? (
    <span className="flex items-center gap-2 bg-fuchsia-500/20 border border-fuchsia-400/40 text-fuchsia-200 px-4 py-2 rounded-xl font-bold text-sm">
      <Users size={16} /> {relayTeams[relayIdx % relayTeams.length]}'s turn
    </span>
  ) : pickedStudent ? (
    <span className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 px-4 py-2 rounded-xl font-bold text-sm">
      🎯 {pickedStudent.name} is searching
    </span>
  ) : (
    <span className="flex items-center gap-2 bg-sky-500/20 border border-sky-400/40 text-sky-200 px-4 py-2 rounded-xl font-bold text-sm">
      <Hand size={16} /> Hands up — tell the teacher
    </span>
  );

  return (
    <div className="h-full w-full bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col p-4 lg:p-6 font-display relative overflow-hidden">

      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-3 shrink-0">
        <div className="bg-white/10 px-5 py-2.5 rounded-2xl flex items-center gap-4 border border-white/10">
          <div className="w-11 h-11 rounded-xl bg-duo-green flex items-center justify-center text-white text-2xl font-black">W</div>
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">Word Search</h1>
            <p className="text-slate-400 text-sm">
              {stage === 'final' ? 'Complete!' : `${isFinalRound ? 'Final round' : `Round ${roundIndex}/${TOTAL_ROUNDS}`} — find ${roundWords.length} words`}
            </p>
          </div>
          <div className="flex gap-1.5 ml-2">
            {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${i + 1 === roundIndex ? 'bg-duo-green' : i + 1 < roundIndex ? 'bg-duo-green/40' : 'bg-slate-600'}`} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 items-center">
          {modeChip}
          <button onClick={() => triggerAction('RESET_GAME')}
            className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white" title="New grid (same words)">
            <RefreshCcw size={18} />
          </button>
        </div>
      </div>

      {/* ═══ PREVIEW — the round's words, INPUT moment ═══ */}
      {stage === 'preview' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-fade-in">
          <h2 className="text-3xl lg:text-5xl font-black text-white text-center">
            {isFinalRound ? 'FINAL ROUND' : `ROUND ${roundIndex} / ${TOTAL_ROUNDS}`}
          </h2>
          <p className="text-slate-400 text-lg -mt-4">Find these {roundWords.length} words hidden in the grid</p>
          <div className="flex flex-wrap justify-center gap-4 max-w-4xl">
            {roundWords.map((w) => (
              <ClueCard key={w.id} word={w} found={false} showWord hinted={false} meaningClue={false} unitId={unitId} />
            ))}
          </div>
          <button onClick={startRound}
            className="px-12 py-4 bg-duo-green hover:brightness-110 text-white text-2xl font-bold rounded-2xl shadow-[0_6px_0_0_#47a325] active:translate-y-1 active:shadow-none transition-all flex items-center gap-3">
            <Play size={28} fill="currentColor" /> Start Round
          </button>
        </div>
      )}

      {/* ═══ PLAY — grid + clue flanks + HUD ═══ */}
      {stage === 'play' && grid && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 flex flex-col xl:flex-row items-center justify-center gap-4 min-h-0">
            {/* Left flank (3 cards on a 5-word round) */}
            <div className="flex xl:flex-col gap-2 overflow-x-auto max-xl:order-2 max-xl:pt-2">
              {leftCards.map((w) => (
                <ClueCard key={w.id} word={w} found={!!found[w.id]} showWord={showWordOnCards}
                  meaningClue={meaningClue} hinted={clueWordIds.has(w.id)} unitId={unitId} compact />
              ))}
            </div>

            {/* The grid — wrapper measured; box forced to an exact square */}
            <div ref={gridWrapRef} className="flex-1 w-full flex items-center justify-center min-h-0">
              <div
                ref={gridElRef}
                onPointerDown={onGridPointerDown}
                onPointerMove={onGridPointerMove}
                onPointerUp={onGridPointerUp}
                onPointerCancel={() => { dragRef.current = false; setSel(null); }}
                className={`relative rounded-3xl bg-slate-800/70 border border-slate-700 shadow-2xl touch-none select-none ${wrongFlash ? 'animate-shake' : ''}`}
                style={{ width: boxPx || undefined, height: boxPx || undefined, cursor: stage === 'play' ? 'pointer' : 'default' }}
              >
                {/* Locked + selection pills (letters render above) */}
                {Object.entries(found).map(([wordId, entry]) => (
                  <div key={`pill-${wordId}`} style={pillStyle(entry.cells, entry.revealed ? 'revealed' : 'found')} />
                ))}
                {sel && selCells.length > 1 && (
                  <div key="sel-pill" style={pillStyle(selCells, 'sel')} />
                )}

                {/* Hint ring on a first letter */}
                {hintCell && boxPx > 0 && (
                  <div
                    className="absolute rounded-full border-4 border-amber-400 animate-ping-soft pointer-events-none z-20"
                    style={{
                      left: (hintCell.col + 0.5) * (boxPx / size),
                      top: (hintCell.row + 0.5) * (boxPx / size),
                      width: (boxPx / size) * 0.95,
                      height: (boxPx / size) * 0.95,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}

                {/* Letters */}
                <div className="absolute inset-0 grid z-10" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
                  {grid.cells.map((row, r) =>
                    row.map((letter, c) => {
                      const inSel = selKeySet.has(`${r},${c}`);
                      return (
                        <div key={`${r}-${c}`}
                          className={`flex items-center justify-center font-black transition-colors
                            ${inSel ? 'text-slate-900' : 'text-slate-200'}`}
                          style={{ fontSize: boxPx ? (boxPx / size) * 0.52 : undefined, lineHeight: 1 }}>
                          {letter}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            </div>

            {/* Right flank (2 cards on a 5-word round) */}
            <div className="flex xl:flex-col gap-2 overflow-x-auto max-xl:order-3">
              {rightCards.map((w) => (
                <ClueCard key={w.id} word={w} found={!!found[w.id]} showWord={showWordOnCards}
                  meaningClue={meaningClue} hinted={clueWordIds.has(w.id)} unitId={unitId} compact />
              ))}
            </div>
          </div>

          {/* ── HUD ── */}
          <div className="shrink-0 mt-3 flex items-center gap-4 max-xl:flex-col">
            <div className="flex gap-2 items-center">
              <span className="bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl font-bold text-sm">
                {foundCount}/{roundWords.length} found
              </span>
              <span className="bg-white/5 text-slate-400 px-3 py-2 rounded-xl font-bold text-sm" title="Wrong selections this round">
                ✗ {roundStats.misses}
              </span>
              <span className="bg-white/5 text-slate-400 px-3 py-2 rounded-xl font-bold text-sm" title="Clues used this round (half points)">
                <Lightbulb size={14} className="inline mr-1" />{roundStats.hints}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2 w-full max-w-2xl mx-auto">
              {TIMED ? (
                <>
                  <button onClick={() => setTimerRunning((r) => !r)}
                    className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white" title="Play / pause timer">
                    {timerRunning ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <div className="flex-1 h-3.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className={`h-full transition-[width] duration-1000 ease-linear ${timePct <= 20 ? 'bg-rose-500' : 'bg-sky-400'}`}
                      style={{ width: `${timePct}%` }}
                    />
                  </div>
                  <span className={`font-mono font-bold text-sm w-12 text-right ${timePct <= 20 ? 'text-rose-400' : 'text-sky-300'}`}>
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </span>
                  <button onClick={() => setTimeLeft((t) => t + 30)}
                    className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white" title="Add 30 seconds">
                    <Plus size={16} />
                  </button>
                </>
              ) : (
                <span className="text-slate-500 font-bold text-sm mx-auto">Untimed — take your time</span>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => triggerAction('REVEAL_HINT')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-sm flex items-center gap-2 active:scale-95">
                <Lightbulb size={16} /> Clue
              </button>
              <button onClick={() => triggerAction('REVEAL_ANSWER')}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-sm active:scale-95">
                Reveal a word
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUMMARY — round stats + time bonus tally ═══ */}
      {stage === 'summary' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle max-w-xl w-full mx-4">
            <div className="w-24 h-24 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mb-4">
              <Check size={52} strokeWidth={4} />
            </div>
            <h2 className="text-4xl font-black text-slate-800 mb-1">COMPLETE!</h2>
            <p className="text-slate-500 font-medium mb-6">
              {isFinalRound ? 'That was the last round' : `Round ${roundIndex} of ${TOTAL_ROUNDS}`}
            </p>

            <div className="grid grid-cols-2 gap-3 w-full mb-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-emerald-600">{roundStats.credited}</div>
                <div className="text-xs font-bold text-emerald-700/70 uppercase tracking-wide">Words found</div>
              </div>
              <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-sky-600">{elapsedSec}s</div>
                <div className="text-xs font-bold text-sky-700/70 uppercase tracking-wide">Time</div>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-rose-500">{roundStats.misses}</div>
                <div className="text-xs font-bold text-rose-700/70 uppercase tracking-wide">Misses</div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                <div className="text-3xl font-black text-amber-500">{roundStats.hints}</div>
                <div className="text-xs font-bold text-amber-700/70 uppercase tracking-wide">Clues</div>
              </div>
            </div>

            {roundBonus > 0 && lastFinderName ? (
              <div className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white rounded-2xl px-5 py-3 mb-4 flex items-center justify-between animate-pop-in">
                <span className="font-bold">⚡ Time bonus</span>
                <span className="font-black">+{roundBonus} → {lastFinderName}</span>
              </div>
            ) : roundStats.revealed > 0 ? (
              <div className="w-full bg-slate-100 text-slate-500 rounded-2xl px-5 py-3 mb-4 text-sm font-bold text-center">
                {roundStats.revealed} word{roundStats.revealed === 1 ? '' : 's'} revealed by the teacher (no points)
              </div>
            ) : null}

            <button onClick={() => advanceRound(false)}
              className="px-10 py-4 bg-duo-green hover:brightness-110 text-white text-xl font-bold rounded-2xl shadow-[0_6px_0_0_#47a325] active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
              {isFinalRound ? 'See Results' : 'Next Round'} <ChevronRight size={22} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ FINAL — stars ═══ */}
      {stage === 'final' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-fade-in">
          <h2 className="text-5xl font-black text-white">THE END</h2>
          <div className="flex gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                size={56}
                className={`animate-star-pop ${i < finalStars ? 'text-amber-400' : 'text-slate-700'}`}
                fill={i < finalStars ? 'currentColor' : 'none'}
                style={{ animationDelay: `${i * 0.22}s` }}
              />
            ))}
          </div>
          <div className="bg-white/10 border border-white/10 rounded-2xl px-8 py-4 text-center">
            <div className="text-slate-400 text-sm font-bold uppercase tracking-widest">Class result</div>
            <div className="text-white text-xl font-bold">
              {totalsRef.current.found} / {totalsRef.current.total} words found
              {totalsRef.current.misses > 0 && <span className="text-slate-400"> · {totalsRef.current.misses} misses</span>}
              {totalsRef.current.hints > 0 && <span className="text-slate-400"> · {totalsRef.current.hints} clues</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={resetGame}
              className="px-8 py-3.5 bg-duo-green hover:brightness-110 text-white text-lg font-bold rounded-2xl shadow-[0_5px_0_0_#47a325] active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
              <RefreshCcw size={20} /> Play Again
            </button>
            <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="px-8 py-3.5 bg-slate-700 hover:bg-slate-600 text-white text-lg font-bold rounded-2xl active:scale-95 transition-all">
              Next Slide →
            </button>
          </div>
          <p className="text-slate-500 text-sm">Points are already on the class leaderboard.</p>
        </div>
      )}

      {/* ═══ CREDIT PICKER (open mode: who found it?) ═══ */}
      {credit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-[3rem] shadow-2xl flex flex-col items-center max-w-2xl w-full mx-4">
            <h3 className="text-2xl font-black text-slate-800 mb-1">Who found it?</h3>
            <p className="text-slate-500 font-medium mb-5">
              {roundWords.find((w) => w.id === credit.wordId)?.word.toUpperCase()} · +{credit.award} pts
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-h-[40vh] overflow-y-auto">
              {presentStudents.map((s: any) => (
                <button key={s.id} onClick={() => resolveCredit(s.id)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-emerald-100 border-2 border-transparent hover:border-emerald-400 px-4 py-2.5 rounded-2xl font-bold text-slate-700 transition-all active:scale-95">
                  {s.avatar ? <img src={s.avatar} alt="" className="w-7 h-7 rounded-full" /> : <span className="w-7 h-7 rounded-full bg-sky-200 text-sky-700 flex items-center justify-center text-sm">{(s.name || '?').slice(0, 1)}</span>}
                  {s.name || 'Student'}
                </button>
              ))}
            </div>
            <button onClick={() => resolveCredit(null)}
              className="mt-5 px-6 py-2.5 text-slate-400 hover:text-slate-600 font-bold">
              No credit
            </button>
          </div>
        </div>
      )}

      {/* Floating feedback */}
      {message && (
        <div className={`absolute top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-2.5 rounded-full font-bold text-lg shadow-xl animate-pop-in
          ${message.good ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-200'}`}>
          {message.text}
        </div>
      )}
      {sel && selCells.length === 1 && stage === 'play' && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 bg-slate-800/90 text-slate-200 px-4 py-1.5 rounded-full text-sm font-bold pointer-events-none">
          tap the last letter of the word…
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
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }

        @keyframes ping-soft {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.25); opacity: 0.6; }
        }
        .animate-ping-soft { animation: ping-soft 1s ease-in-out infinite; }

        @keyframes star-pop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          70% { transform: scale(1.25) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        .animate-star-pop { animation: star-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both; }
      `}</style>
    </div>
  );
};

export default BoardWordSearch;
