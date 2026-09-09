// BoardWordSearch — vocabulary word-search shell (PRACTICE phase), v3 redesign.
//
// Visual system: games-v3 Stitch pilot (docs/audit/games-v3/26-word-search.md
// §5–§6; export in docs/audit/games-v3/stitch/stitch_esl_classroom_word_search_display).
// Night palette + neon accents, Fredoka display type, SVG glow strokes over a
// CSS-sized square grid, right-hand target/found token rail, slim bottom HUD.
//
// The v3 redesign also fixes the audit findings (§3 of the audit file):
//   F0  grid sizing is pure CSS (aspect-square, no measured boxPx) — the old
//       chicken-and-egg collapse (0–13 px grid on the projector) is deleted by
//       construction. Selection strokes are an SVG overlay in grid-unit
//       coordinates, so they stay locked to the cells at ANY container size.
//   F1  "Time!" state at 0:00 — frozen grid, remaining targets, teacher choice.
//   F2  (commander side) ContextualControls now emits NEXT_ROUND.
//   F3  Clue targets the ARMED token (teacher taps a word first); the hint
//       ring persists until found; halved award only on that word.
//   F4  the round timer PAUSES while the "Who found it?" picker is open.
//   F5  a celebration beat (~1.8 s) runs before the round summary enters.
//   F6  streaks are per student (collab) / per team (relay); open mode shows a
//       class combo instead — no global streak windfall (owner decision).
//   F7  Reveal / Mark-Correct act on the armed token (or first unfound).
//   F8  relay turn advances only on credited finds, never on teacher reveals.
//   F9  grid build retries deterministic seeds; still-unplaceable words are
//       auto-revealed so a round can never become unfinishable.
//   F11 found progress lives in the large HUD tokens, not small text.
//   F13 dead awardedThisTurnRef removed (the found-map is the latch).
//   F15 a mid-game pool refetch keeps the dealt round on screen (the loading
//       gate only applies before the first successful deal); the fetch itself
//       is now error-safe in useBoardPool.
//   Owner decisions 2026-09-10: first miss warns (amber + strategy hint) and
//   only the second+ miss costs −1; honest result variants (class-found
//   celebration vs teacher-revealed recap); Starter/Explorer presets.
//
// Lifecycle: standard 4 must-dos (LIVE_GAME_LIFECYCLE.md). NEW_TURN resets
// turn refs but NOT the grid — the collaborative board accumulates across
// students. Content: useEscalatingPool → vocabulary_items → frozen data.words
// (wordSearch/content.ts).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Check, RefreshCcw, Lightbulb, Play, Pause, Plus, Star, ChevronRight,
  Hand, Users, Volume2, Clock, Eye, Bell,
} from 'lucide-react';
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
import Avatar from '../../../components/shared/Avatar';
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
export type WordSearchPreset = 'starter' | 'explorer';

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
    revealHint:   { label: 'Clue', enabled: true, onTrigger: noop },
    forceCorrect: { label: 'Mark Correct', enabled: true, onTrigger: noop },
    skip:         { label: 'Skip Round', enabled: true, onTrigger: noop },
    nextRound:    { label: 'Next Round', enabled: true, onTrigger: noop },
    endSlide:     { label: 'End', enabled: true, onTrigger: noop },
    playPause:    { label: 'Play/Pause', enabled: true, onTrigger: noop },
    addTime:      { label: '+30s', enabled: true, onTrigger: noop },
  },
};

// ── Types ──────────────────────────────────────────────────────────────────
type Stage = 'preview' | 'play' | 'celebrating' | 'summary' | 'final';
interface FoundEntry {
  cells: Cell[];
  byStudentId: string | null;
  award: number;
  revealed: boolean;
}
interface RoundStats { credited: number; revealed: number; misses: number; hints: number; }
const ZERO_STATS: RoundStats = { credited: 0, revealed: 0, misses: 0, hints: 0 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** v3 fonts (Fredoka display + JetBrains Mono numerals), injected once. */
function useV3Fonts() {
  useEffect(() => {
    if (document.getElementById('ws-v3-fonts')) return;
    const l = document.createElement('link');
    l.id = 'ws-v3-fonts';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=JetBrains+Mono:wght@700;800&display=swap';
    document.head.appendChild(l);
  }, []);
}

// ── Token / preview cards ──────────────────────────────────────────────────
interface TokenCardProps {
  word: SearchWord;
  found: FoundEntry | undefined;
  /** Show the English word on the unfound face (Starter, or round 1). */
  showWord: boolean;
  finderName: string | null;
  hinted: boolean;
  armed: boolean;
  onArm: () => void;
  unitId: string;
}

const TokenCard: React.FC<TokenCardProps> = ({ word, found, showWord, finderName, hinted, armed, onArm, unitId }) => {
  const { play } = useSpeech({ text: word.word, audioUrl: word.audioUrl, lang: 'en', unitId });
  const isFound = !!found;

  return (
    <button
      onClick={onArm}
      disabled={isFound}
      className={`ws-token relative w-full text-left rounded-2xl border-2 flex items-center gap-3 p-3 transition-all active:scale-[0.98]
        ${isFound
          ? 'bg-emerald-600/90 border-emerald-400/90 shadow-[0_0_22px_2px_rgba(16,185,129,0.35)]'
          : armed
            ? 'bg-white border-sky-400 ring-4 ring-sky-400/40 shadow-lg'
            : 'bg-white/95 border-slate-200 shadow-lg hover:border-sky-300'}`}
    >
      {word.imageUrl ? (
        <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-xl overflow-hidden bg-slate-100 border shrink-0">
          <img src={word.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="w-14 h-14 lg:w-16 lg:h-16 rounded-xl bg-sky-100 text-sky-600 font-black items-center justify-center flex text-2xl shrink-0">
          {showWord ? word.word.slice(0, 1) : '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {isFound ? (
          <>
            <div className="flex items-center gap-2">
              <span className="ws-mono font-extrabold tracking-wider text-white text-lg lg:text-xl truncate">{word.word.toUpperCase()}</span>
              <span className="w-6 h-6 rounded-full bg-white text-emerald-600 flex items-center justify-center font-black text-sm shrink-0">✓</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 bg-emerald-700/60 w-fit px-2 py-0.5 rounded-full border border-emerald-400/30">
              {found!.byStudentId && <span className="text-[10px] font-bold text-emerald-50 truncate">Solved by {finderName ?? 'the class'}</span>}
              {!found!.byStudentId && <span className="text-[10px] font-bold text-emerald-100/80">Shown by the teacher</span>}
            </div>
          </>
        ) : showWord ? (
          <div className="ws-mono font-extrabold tracking-wider text-slate-800 text-lg lg:text-xl truncate">{word.word.toUpperCase()}</div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="ws-mono font-extrabold tracking-[0.2em] text-slate-500 text-base lg:text-lg whitespace-nowrap">
              {word.letters.split('').map(() => '_').join(' ')}
            </span>
          </div>
        )}
        {!isFound && (
          <div className="flex items-center gap-2 mt-1">
            {!showWord && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{word.letters.length} letters</span>}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); play(); }}
              className="w-6 h-6 rounded-full bg-slate-100 hover:bg-sky-100 border border-slate-200 text-slate-500 hover:text-sky-600 flex items-center justify-center"
              title="Hear the word"
            >
              <Volume2 size={13} />
            </span>
          </div>
        )}
      </div>
      {hinted && !isFound && (
        <span className="absolute top-1.5 right-1.5 bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">½ pts</span>
      )}
      {armed && !isFound && (
        <span className="absolute bottom-1.5 right-1.5 bg-sky-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">TARGET</span>
      )}
    </button>
  );
};

// ── Preview card (round-preview stage) — the BIG portrait treatment from the
// Stitch round_preview screen: photo fills the card, hover lift, speaker on
// tap; the word strip appears only when the round shows words (Starter / r1 /
// text-mode units).
interface PreviewCardProps {
  word: SearchWord;
  showWord: boolean;
  unitId: string;
}

const PreviewCard: React.FC<PreviewCardProps> = ({ word, showWord, unitId }) => {
  const { play } = useSpeech({ text: word.word, audioUrl: word.audioUrl, lang: 'en', unitId });
  return (
    <button
      onClick={() => play()}
      className="ws-preview-card group relative w-32 h-44 sm:w-44 sm:h-56 lg:w-52 lg:h-64 xl:w-56 xl:h-72 bg-white rounded-3xl p-2.5 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)] transition-all duration-300 hover:scale-[1.04] hover:-translate-y-1.5 active:scale-95 flex flex-col"
    >
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden bg-slate-100">
        {word.imageUrl ? (
          <img src={word.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-sky-100 text-sky-500 font-black flex items-center justify-center text-5xl">
            {showWord ? word.word.slice(0, 1) : '?'}
          </div>
        )}
      </div>
      {showWord ? (
        <div className="shrink-0 pt-2 pb-0.5 flex items-center justify-center gap-1.5">
          <span className="ws-mono font-extrabold tracking-wider text-slate-800 text-sm lg:text-base truncate">{word.word.toUpperCase()}</span>
        </div>
      ) : (
        <div className="shrink-0 pt-2 pb-0.5 flex items-center justify-center gap-1.5">
          <span className="ws-mono font-extrabold tracking-[0.18em] text-slate-400 text-xs lg:text-sm">{word.letters.split('').map(() => '_').join(' ')}</span>
        </div>
      )}
      <span className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-slate-900/70 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Hear the word">
        <Volume2 size={14} />
      </span>
    </button>
  );
};

// ── Component ──────────────────────────────────────────────────────────────
const BoardWordSearch: React.FC<{ data: any }> = ({ data }) => {
  useV3Fonts();
  const { state, triggerAction, addPoints, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phaseTag = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Config from the frozen block data ────────────────────────────────────
  const TOTAL_ROUNDS = clampInt(data?.rounds, 1, 5, 3);
  const WORDS_PER_ROUND = clampInt(data?.wordsPerRound, 3, 6, 5);
  const rawSeconds = Number(data?.seconds);
  const SECONDS = Number.isFinite(rawSeconds) && rawSeconds >= 0 ? Math.min(3600, Math.round(rawSeconds)) : 120;
  const TIMED = SECONDS > 0;
  const MODE: WordSearchMode =
    data?.mode === 'relay' ? 'relay' : data?.mode === 'collaborative' ? 'collaborative' : 'open';
  const PRESET: WordSearchPreset =
    data?.preset === 'explorer' ? 'explorer' : data?.preset === 'starter' ? 'starter'
      : (WORDS_PER_ROUND >= 5 ? 'explorer' : 'starter');

  // ── Content: escalating pool → vocabulary_items → frozen data.words ──────
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
    if (poolWords.length > 0) return poolWords;
    return takeRound(fallbackSource, roundIndex, WORDS_PER_ROUND, mulberry32(hashString(`${unitId}|deal`)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolWords, fallbackSource, roundIndex, WORDS_PER_ROUND, unitId]);

  const clueMode = useMemo(() => detectClueMode(roundWords), [roundWords]);

  // ── Game state ───────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('preview');
  const [grid, setGrid] = useState<SearchGrid | null>(null);
  const [found, setFound] = useState<Record<string, FoundEntry>>({});
  const [roundStats, setRoundStats] = useState<RoundStats>(ZERO_STATS);
  const [sel, setSel] = useState<{ anchor: Cell; cells: Cell[] } | null>(null);
  const [hintWordId, setHintWordId] = useState<string | null>(null);
  const [clueWordIds, setClueWordIds] = useState<Set<string>>(new Set());
  const [armedWordId, setArmedWordId] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [credit, setCredit] = useState<{ wordId: string; award: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [timerRunning, setTimerRunning] = useState(TIMED);
  const [timeUp, setTimeUp] = useState(false);
  const [roundBonus, setRoundBonus] = useState(0);
  const [lastFinderName, setLastFinderName] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [finalStars, setFinalStars] = useState(0);
  const [relayIdx, setRelayIdx] = useState(0);
  const [classScore, setClassScore] = useState(0);

  // ── Lifecycle refs (the 4 must-dos) ──────────────────────────────────────
  const mistakesRef = useRef(0);
  /** Per-key streaks: studentId (collab/open scoring) or `team:<label>` (relay). */
  const streaksRef = useRef<Record<string, number>>({});
  /** Open-mode class combo — display/confetti only, never an individual bonus. */
  const comboRef = useRef(0);
  const lastFinderRef = useRef<{ id: string; name: string } | null>(null);
  const clueUsedRef = useRef<Set<string>>(new Set());
  const playStartRef = useRef(0);
  const resetCountRef = useRef(0);
  const buildSigRef = useRef('');
  const dragRef = useRef(false);
  const gridElRef = useRef<HTMLDivElement | null>(null);
  const totalsRef = useRef({ found: 0, revealed: 0, total: 0, misses: 0, hints: 0 });
  /** F15: once a round has dealt, a pool refetch must not blank the board. */
  const hadContentRef = useRef(false);
  const timerWasRunningRef = useRef(false);
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Relay teams: distinct sorted labels from the roster (assignTeams).
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

  // ── Analytics + FSRS (triple-write) ──────────────────────────────────────
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

  // ── Award pipeline ───────────────────────────────────────────────────────
  const awardWord = useCallback((studentId: string, word: SearchWord, award: number) => {
    addPoints(studentId, award);
    setClassScore((c) => c + award);
    lastFinderRef.current = { id: studentId, name: nameOf(studentId) };
    setLastFinderName(nameOf(studentId));
    writeAnalytics(studentId, word, 'correct');
  }, [addPoints, nameOf, writeAnalytics]);

  /**
   * Lock a word as found. `revealed` (teacher Reveal / time-up / unplaceable)
   * locks without points; `creditStudentId` forces the recipient
   * (MARK_CORRECT); otherwise the wheel-picked responder gets it — or, in open
   * mode, the credit picker opens.
   */
  const lockWord = useCallback((word: SearchWord, cells: Cell[], opts: { revealed?: boolean; creditStudentId?: string } = {}) => {
    const picked = state.quickWheelWinner;
    const awardTo = opts.creditStudentId ?? picked ?? null;

    let award = 0;
    let streak = 0;
    if (!opts.revealed) {
      // F6: per-student (collab/open) / per-team (relay) streaks; open mode
      // scores without an individual streak bonus (the class combo is the
      // open-mode streak — display + confetti only).
      if (MODE === 'relay' && relayTeams.length >= 2) {
        const key = `team:${relayTeams[relayIdx % relayTeams.length]}`;
        streaksRef.current[key] = (streaksRef.current[key] ?? 0) + 1;
        streak = streaksRef.current[key];
      } else if (MODE !== 'open' && awardTo) {
        streaksRef.current[awardTo] = (streaksRef.current[awardTo] ?? 0) + 1;
        streak = streaksRef.current[awardTo];
      } else {
        comboRef.current += 1;
      }
      const base = scoreForAttempt(mistakesRef.current, word.difficulty, 1, streak);
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
      if ((MODE === 'open' && (comboRef.current === 3 || comboRef.current === 5)) || streak >= 3) {
        playCue('streak');
        triggerConfetti();
      }
      if (MODE === 'open' && comboRef.current === 3) {
        flashMessage('Class combo ×3! Great hunting!', true);
      }
      if (awardTo) {
        awardWord(awardTo, word, award);
        flashMessage(`${nameOf(awardTo)} found ${word.word.toUpperCase()}! +${award}`, true);
      } else {
        setCredit({ wordId: word.id, award });
        // F4: stop the clock while the teacher attributes the finder.
        timerWasRunningRef.current = timerRunning;
        if (TIMED) setTimerRunning(false);
      }
    }
    // F8: relay advances only on credited finds — a teacher reveal is a rescue,
    // not a consumed turn.
    if (!opts.revealed && MODE === 'relay' && relayTeams.length >= 2) {
      setRelayIdx((i) => (i + 1) % relayTeams.length);
    }
    if (hintWordId === word.id) setHintWordId(null);
    if (armedWordId === word.id) setArmedWordId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.quickWheelWinner, awardWord, nameOf, speakWord, flashMessage, triggerConfetti, MODE, relayTeams.length, relayIdx, timerRunning, TIMED, hintWordId, armedWordId]);

  const onMiss = useCallback(() => {
    mistakesRef.current += 1;
    comboRef.current = 0;
    const picked = state.quickWheelWinner;
    if (picked && MODE !== 'open') streaksRef.current[picked] = 0;
    if (picked && MODE === 'relay' && relayTeams.length >= 2) {
      streaksRef.current[`team:${relayTeams[relayIdx % relayTeams.length]}`] = 0;
    }
    totalsRef.current.misses += 1;
    setRoundStats((s) => ({ ...s, misses: s.misses + 1 }));
    playCue('wrong');
    setWrongFlash(true);
    setTimeout(() => setWrongFlash(false), 600);
    // Owner decision 2026-09-10: the FIRST miss warns (input slips are the
    // teacher's finger, not the child's knowledge); −1 starts on the second.
    if (mistakesRef.current === 1) {
      flashMessage('Look at the picture — say the first sound!', false);
    } else if (picked) {
      addPoints(picked, -MISTAKE_PENALTY);
      flashMessage('Look at the picture — say the first sound!', false);
    }
  }, [state.quickWheelWinner, addPoints, flashMessage, MODE, relayTeams.length, relayIdx]);

  // ── Grid rebuild per round (F9 placement guard; sig dedupe) ───────────────
  useEffect(() => {
    if (roundWords.length === 0) return;
    const sig = `${unitId}|${roundIndex}|${resetCountRef.current}|${roundWords.map((w) => w.id).join(',')}`;
    if (buildSigRef.current === sig) return;
    buildSigRef.current = sig;
    hadContentRef.current = true;

    const directionsFor = (r: number) => {
      if (PRESET === 'starter') return r === 1 ? DIRECTIONS_EASY : DIRECTIONS_MEDIUM;
      return r === 1 ? DIRECTIONS_EASY : r === 2 ? DIRECTIONS_MEDIUM : DIRECTIONS_ALL;
    };
    const directions = directionsFor(roundIndex);

    // F9: deterministic retry ladder — a word the engine can't place would
    // otherwise make the round unfinishable.
    let g: SearchGrid | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = buildGrid(toGridWords(roundWords), {
        directions,
        seed: hashString(sig) + attempt * 7919,
        fillBias: roundIndex >= 2,
      });
      if (candidate.unplaced.length === 0) { g = candidate; break; }
      g = candidate;
    }

    setFound({});
    clueUsedRef.current = new Set();
    setClueWordIds(new Set());
    setRoundStats(ZERO_STATS);
    setSel(null);
    setHintWordId(null);
    setArmedWordId(null);
    setCredit(null);
    setRoundBonus(0);
    setLastFinderName(null);
    lastFinderRef.current = null;
    setTimeLeft(SECONDS);
    setTimerRunning(TIMED);
    setTimeUp(false);
    setStage('preview');
    mistakesRef.current = 0;
    streaksRef.current = {};
    comboRef.current = 0;
    playStartRef.current = 0;
    totalsRef.current = { found: 0, revealed: 0, total: roundWords.length, misses: 0, hints: 0 };

    if (!g) return;
    setGrid(g);
    // Any word still unplaceable after the retries locks as revealed — the
    // round stays completable and the class still sees the word.
    for (const wid of g.unplaced) {
      const w = roundWords.find((x) => x.id === wid);
      if (!w) continue;
      console.warn('[wordsearch] word unplaceable, auto-revealed:', w.word);
      setFound((prev) => (prev[w.id] ? prev : { ...prev, [w.id]: { cells: [], byStudentId: null, award: 0, revealed: true } }));
      setRoundStats((s) => ({ ...s, revealed: s.revealed + 1 }));
      totalsRef.current.revealed += 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundWords, roundIndex, unitId, PRESET]);

  // ── Selection: tap-first/tap-last + pointer drag ──────────────────────────
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
    if (stage !== 'play' || credit || timeUp) return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (sel && sel.cells.length === 1 && !sameCell(sel.anchor, cell)) {
      setSel({ anchor: sel.anchor, cells: snapLine(sel.anchor, cell, grid?.size ?? 8) });
      dragRef.current = false;
    } else {
      setSel({ anchor: cell, cells: [cell] });
      dragRef.current = true;
    }
  }, [stage, credit, timeUp, cellFromEvent, sel, grid]);

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
    if (cells.length === 1) return;
    if (cells.length < 3) { setSel(null); return; }

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

  // ── Timer (pure decrement) + F1 time-up beat ──────────────────────────────
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
    if (stage === 'play' && TIMED && timeLeft === 0 && !timeUp) {
      setTimeUp(true);
      playCue('reveal');
      flashMessage('Time!', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, stage, TIMED]);

  useEffect(() => {
    if (stage === 'play' && playStartRef.current === 0) playStartRef.current = Date.now();
  }, [stage]);

  // ── Round completion → celebration beat → summary (F5) ────────────────────
  // Two separate effects: the first flips play → celebrating when the round is
  // complete; the SECOND schedules the summary timer on ENTERING celebrating.
  // (A single effect keyed on [found, stage] would schedule the timer and then
  // clear it immediately via its own cleanup when the stage flip re-ran it —
  // the board stayed stuck celebrating. Caught by the F0-gate Playwright run.)
  useEffect(() => {
    if (stage !== 'play' || roundWords.length === 0) return;
    if (Object.keys(found).length < roundWords.length) return;
    setStage('celebrating');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, stage, roundWords]);

  useEffect(() => {
    if (stage !== 'celebrating') return;
    summaryTimerRef.current = setTimeout(() => {
      let bonus = 0;
      if (TIMED && timeLeft > 0) {
        const frac = timeLeft / SECONDS;
        bonus = frac >= 0.66 ? 3 : frac >= 0.33 ? 2 : 1;
      }
      setRoundBonus(bonus);
      setElapsedSec(TIMED ? SECONDS - timeLeft : Math.max(0, Math.round((Date.now() - playStartRef.current) / 1000)));
      // F6/owner decision: the time bonus goes to the round closer only in
      // collaborative/relay; open mode celebrates as a class (no windfall).
      if (bonus > 0 && lastFinderRef.current && MODE !== 'open') {
        addPoints(lastFinderRef.current.id, bonus);
        setClassScore((c) => c + bonus);
      }
      setStage('summary');
    }, 1800);
    return () => { if (summaryTimerRef.current) { clearTimeout(summaryTimerRef.current); summaryTimerRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => () => { if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current); }, []);

  // ── Finish / stars (found-based; honest variants) ─────────────────────────
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

  const isRecap = useCallback(() => {
    const t = totalsRef.current;
    return t.total === 0 || t.found / t.total < 0.6;
  }, []);

  const finish = useCallback((silent: boolean) => {
    setFinalStars(computeStars());
    setStage('final');
    if (!silent && !isRecap()) {
      triggerConfetti();
      playCue('win');
    }
    triggerAction('SLIDE_COMPLETE', { forced: silent });
  }, [computeStars, isRecap, triggerConfetti, triggerAction]);

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

  // ── Teacher actions (F3/F7: armed-token targeting) ────────────────────────
  const targetWord = useCallback((needPlacement: boolean): SearchWord | null => {
    const armed = roundWords.find((w) => w.id === armedWordId && !found[w.id]);
    const first = roundWords.find((w) => !found[w.id]);
    const w = armed ?? first ?? null;
    if (!w || !grid) return null;
    if (needPlacement) {
      const placement = grid.placements.find((p) => p.wordId === w.id);
      if (!placement) return null;
    }
    return w;
  }, [roundWords, found, armedWordId, grid]);

  const giveClue = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const word = targetWord(false);
    if (!word) return;
    const placement = grid.placements.find((p) => p.wordId === word.id);
    // F3: the ring PERSISTS until the word is found (no 3.5 s vanish), and the
    // halved award lands only on this chosen word.
    setHintWordId(placement ? word.id : null);
    clueUsedRef.current.add(word.id);
    setClueWordIds((prev) => new Set(prev).add(word.id));
    totalsRef.current.hints += 1;
    setRoundStats((s) => ({ ...s, hints: s.hints + 1 }));
    playCue('reveal');
  }, [stage, grid, targetWord]);

  const revealAnswer = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const word = targetWord(true);
    if (!word) return;
    const placement = grid.placements.find((p) => p.wordId === word.id);
    if (!placement) return;
    lockWord(word, placement.cells, { revealed: true });
  }, [stage, grid, targetWord, lockWord]);

  const revealRemaining = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    for (const w of roundWords) {
      if (found[w.id]) continue;
      const placement = grid.placements.find((p) => p.wordId === w.id);
      if (placement) lockWord(w, placement.cells, { revealed: true });
    }
  }, [stage, grid, roundWords, found, lockWord]);

  const markCorrect = useCallback(() => {
    if (stage !== 'play' || !grid) return;
    const word = targetWord(true);
    if (!word) return;
    const placement = grid.placements.find((p) => p.wordId === word.id);
    if (!placement) return;
    lockWord(word, placement.cells, {
      creditStudentId: state.quickWheelWinner ?? undefined, // open mode → credit picker
    });
  }, [stage, grid, targetWord, lockWord, state.quickWheelWinner]);

  const resetGame = useCallback(() => {
    resetCountRef.current += 1; // reshuffles the grid with the same word set
    setRoundIndex(1);
    setFinalStars(0);
    setRelayIdx(0);
    setClassScore(0);
    totalsRef.current = { found: 0, revealed: 0, total: 0, misses: 0, hints: 0 };
    mistakesRef.current = 0;
    streaksRef.current = {};
    comboRef.current = 0;
    // Round state itself resets in the grid-build effect (sig includes the counter).
  }, []);

  // ── Credit picker (open mode; F4 timer pause) ─────────────────────────────
  const resolveCredit = useCallback((studentId: string | null) => {
    if (!credit) return;
    if (studentId) {
      const word = roundWords.find((w) => w.id === credit.wordId);
      if (word) awardWord(studentId, word, credit.award);
      flashMessage(`${nameOf(studentId)} found ${word?.word ?? ''}! +${credit.award}`, true);
    }
    setCredit(null);
    if (TIMED && timerWasRunningRef.current && timeLeft > 0) setTimerRunning(true);
    timerWasRunningRef.current = false;
  }, [credit, roundWords, awardWord, nameOf, flashMessage, TIMED, timeLeft]);

  // ── Remote/commander action listener ──────────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'REVEAL_HINT': giveClue(); break;
      case 'REVEAL_ANSWER': revealAnswer(); break;
      case 'MARK_CORRECT': markCorrect(); break;
      case 'SKIP_ROUND': advanceRound(true); break;
      case 'NEXT_ROUND':
        if (stage === 'summary' || stage === 'celebrating') advanceRound(false);
        else if (stage === 'play') advanceRound(true); // teacher abandons the round
        break;
      case 'PLAY_PAUSE': setTimerRunning((r) => !r); break;
      case 'ADD_TIME_30': setTimeLeft((t) => t + 30); setTimeUp(false); break;
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

  // ── Game-lifecycle: NEW_TURN → fresh turn refs (grid persists) ────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return; // no responder = open class / practice
    mistakesRef.current = 0;
    // Deliberately NOT resetting the grid/found words — the collaborative
    // board accumulates across turns; only per-turn scoring state is fresh.
  }, [turnId]);

  // ── Empty / loading state (after ALL hooks) ───────────────────────────────
  const presentStudents = useMemo(
    () => filterPresent(state.students || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.students],
  );
  const contentEmpty = !poolLoading && roundWords.length === 0;
  const showLoadingGate = poolLoading && !hadContentRef.current;
  if (showLoadingGate || contentEmpty) {
    return (
      <div className="h-full ws-root bg-[#070C18] flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-bold text-slate-500 mb-2">Word Search</h1>
        <p className="text-slate-600 text-xl max-w-xl">
          {poolLoading ? 'Loading…' : 'This unit has no vocabulary words yet. Add vocabulary (or generate the exercise pool) first.'}
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

  // ── Derived render data ───────────────────────────────────────────────────
  const size = grid?.size ?? 8;
  const foundCount = Object.keys(found).length;
  const isFinalRound = roundIndex >= TOTAL_ROUNDS;
  const selCells = sel?.cells ?? [];
  const selKeySet = new Set(selCells.map((c) => `${c.row},${c.col}`));
  const timePct = TIMED ? Math.max(0, Math.min(100, (timeLeft / SECONDS) * 100)) : 100;
  const showWordOnTokens = PRESET === 'starter' || roundIndex === 1 || clueMode === 'text';
  const directionsLabel = roundIndex === 1 ? '→ ↓' : PRESET === 'starter' ? '→ ↓ ← ↑' : roundIndex === 2 ? '6 ways' : '8 ways';

  // SVG stroke lines for a word path (grid-unit coordinates, viewBox 0 0 N N —
  // stretches with the card in ANY container, which is what kills F0).
  const strokeLines = (cells: Cell[], tone: 'sel' | 'found' | 'revealed', key: string) => {
    if (cells.length === 0) return null;
    const a = cells[0];
    const b = cells[cells.length - 1];
    const x1 = a.col + 0.5; const y1 = a.row + 0.5;
    const x2 = b.col + 0.5; const y2 = b.row + 0.5;
    const colors = tone === 'sel'
      ? { glow: '#F59E0B', core: '#FBBF24', hi: '#FFFBEB' }
      : tone === 'found'
        ? { glow: '#10B981', core: '#10B981', hi: '#ECFDF5' }
        : { glow: '#64748B', core: '#94A3B8', hi: '#F1F5F9' };
    return (
      <g key={key} strokeLinecap="round">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.glow} strokeOpacity={0.32} strokeWidth={0.86} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.core} strokeOpacity={0.85} strokeWidth={0.62} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.hi} strokeOpacity={0.9} strokeWidth={0.16} />
      </g>
    );
  };

  const modeChip = MODE === 'relay' && relayTeams.length >= 2 ? (
    <span className="flex items-center gap-2 bg-fuchsia-500/15 border border-fuchsia-400/40 text-fuchsia-200 px-4 py-2 rounded-full font-bold text-sm">
      <Users size={16} /> {relayTeams[relayIdx % relayTeams.length]}'s turn
    </span>
  ) : pickedStudent ? (
    <span className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 px-4 py-2 rounded-full font-bold text-sm">
      🎯 {pickedStudent.name} is searching
    </span>
  ) : (
    <span className="flex items-center gap-2 bg-[#111C3D] border border-sky-500/30 text-sky-200 px-4 py-2 rounded-full font-bold text-sm">
      <Hand size={16} /> Whole class — hands up
    </span>
  );

  const timerPill = (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {TIMED && (
          <>
            <button onClick={() => setTimerRunning((r) => !r)}
              className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white" title="Play / pause timer">
              {timerRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full shadow-[0_0_20px_2px_rgba(56,189,248,0.35)] ${timePct <= 20 ? 'bg-rose-500 text-white' : 'bg-[#38BDF8] text-[#070C18]'}`}>
              <Clock size={18} strokeWidth={2.5} />
              <span className="ws-mono font-extrabold text-xl lg:text-2xl tracking-tight leading-none">
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
            <button onClick={() => { setTimeLeft((t) => t + 30); setTimeUp(false); }}
              className="p-1.5 rounded-lg bg-white/5 text-slate-300 hover:text-white" title="Add 30 seconds">
              <Plus size={14} />
            </button>
          </>
        )}
      </div>
      {TIMED && (
        <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
          <div className={`h-full transition-[width] duration-1000 ease-linear ${timePct <= 20 ? 'bg-rose-400' : 'bg-gradient-to-r from-sky-400 to-sky-200'}`} style={{ width: `${timePct}%` }} />
        </div>
      )}
    </div>
  );

  // Header. The BoardShell renders its phase badge (e.g. "PRACTICE")
  // absolutely at the center-stage's top-left (~164px wide, top-5 left-6) —
  // pl-40/lg:pl-48 keeps this header's W badge clear of it (owner review
  // 2026-09-10 caught the overlap).
  const header = (
    <header className="w-full flex items-center justify-between gap-4 pr-2 pl-40 lg:pl-48 h-14 lg:h-16 [@media(max-height:430px)]:h-11 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-[#FF2E79] flex items-center justify-center text-white font-bold text-xl lg:text-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] shrink-0">W</div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white truncate">Word Search</h1>
            <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-wider bg-slate-800/90 border border-slate-700 text-sky-300 whitespace-nowrap">
              {stage === 'final' ? 'Complete' : `${isFinalRound ? 'Final round' : `Round ${roundIndex}/${TOTAL_ROUNDS}`} · ${PRESET === 'starter' ? 'Starter' : 'Explorer'}`}
            </span>
          </div>
          <span className="text-[10px] lg:text-xs text-slate-400 font-medium whitespace-nowrap [@media(max-height:430px)]:hidden">{directionsLabel} directions</span>
        </div>
        <div className="hidden md:block ml-2">{modeChip}</div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {TIMED && stage !== 'preview' && timerPill}
        <button onClick={() => triggerAction('RESET_GAME')}
          className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white" title="New grid (same words)">
          <RefreshCcw size={16} />
        </button>
      </div>
    </header>
  );

  const railTokens = (compact = false) => (
    <div className={`flex xl:flex-col gap-2 overflow-x-auto xl:overflow-visible ${compact ? 'w-full' : 'w-full xl:w-[clamp(260px,26%,380px)] shrink-0'}`}>
      <div className="hidden xl:flex items-center justify-between pb-1 border-b border-slate-800 w-full shrink-0">
        <span className="text-xs font-bold tracking-wider uppercase text-slate-400">Target words</span>
        <span className="ws-mono text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full">
          {foundCount}/{roundWords.length}
        </span>
      </div>
      {roundWords.map((w) => (
        <div key={w.id} className="shrink-0 w-52 xl:w-full">
          <TokenCard
            word={w}
            found={found[w.id]}
            showWord={showWordOnTokens}
            finderName={found[w.id]?.byStudentId ? nameOf(found[w.id]!.byStudentId!) : null}
            hinted={clueWordIds.has(w.id)}
            armed={armedWordId === w.id}
            onArm={() => setArmedWordId((prev) => (prev === w.id ? null : w.id))}
            unitId={unitId}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="ws-root h-full w-full bg-[#070C18] flex flex-col p-3 lg:p-5 [@media(max-height:430px)]:p-1.5 relative overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% -10%, rgba(30,58,138,0.35) 0%, transparent 55%),' +
          'radial-gradient(circle at 10% 90%, rgba(17,28,68,0.6) 0%, transparent 45%),' +
          'radial-gradient(circle at 90% 85%, rgba(16,185,129,0.08) 0%, transparent 40%)',
      }}>

      {header}
      <div className="md:hidden shrink-0 mt-1 [@media(max-height:430px)]:hidden">{modeChip}</div>

      {/* ═══ PREVIEW — the round's words, INPUT moment (Stitch round_preview:
          big portrait photo cards, huge display title, difficulty chip) ═══ */}
      {stage === 'preview' && grid && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2.5 lg:gap-4 animate-fade-in px-2 overflow-y-auto [@media(max-height:430px)]:gap-1.5">
          <span className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-800/90 border border-sky-500/30 text-sky-300 font-bold text-[10px] lg:text-xs uppercase tracking-widest whitespace-nowrap">
            {PRESET === 'starter' ? 'Starter' : 'Explorer'} · {directionsLabel} only
          </span>
          <h2 className="text-3xl lg:text-5xl xl:text-6xl font-bold text-white text-center leading-none drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            Find these {roundWords.length} words
          </h2>
          <p className="text-sky-300/80 text-xs lg:text-base">Listen, say them, then search!</p>
          <div className="flex flex-wrap items-center justify-center gap-3 xl:gap-6 py-1 max-w-full">
            {roundWords.map((w) => (
              <PreviewCard key={w.id} word={w} showWord={showWordOnTokens} unitId={unitId} />
            ))}
          </div>
          <button onClick={startRound}
            className="px-10 lg:px-12 py-3 lg:py-4 bg-[#FF2E79] hover:brightness-110 text-white text-lg lg:text-2xl font-bold rounded-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all flex items-center gap-3">
            <Play size={24} fill="currentColor" /> Start Round
          </button>
        </div>
      )}

      {/* ═══ PLAY / CELEBRATING — grid + token rail + HUD ═══ */}
      {(stage === 'play' || stage === 'celebrating') && grid && (
        <>
          <main className="flex-1 min-h-0 flex flex-col xl:flex-row items-center justify-center gap-3 lg:gap-5 px-1 py-2">
            {/* compact rail (top strip) below xl — slim + shrink-0 so it can
                never crush the grid (the phone-floor F0-relapse the gate caught) */}
            <div className="xl:hidden w-full max-h-16 overflow-y-hidden shrink-0 [@media(max-height:430px)]:hidden">{railTokens(true)}</div>

            {/* The grid — pure CSS square (F0 fix); strokes are grid-unit SVG.
                Sizing is orientation-conditional: stacked (<xl) it takes the
                LEFTOVER height after the rail strip (flex-1 + basis 0 — no
                chicken-and-egg, no flex-crush); in the xl row it sizes from
                the container height (h-full + aspect). */}
            <div
              ref={gridElRef}
              onPointerDown={onGridPointerDown}
              onPointerMove={onGridPointerMove}
              onPointerUp={onGridPointerUp}
              onPointerCancel={() => { dragRef.current = false; setSel(null); }}
              className={`ws-gridcard relative flex-1 min-h-0 aspect-square max-w-full max-h-full xl:flex-none xl:h-full rounded-2xl lg:rounded-3xl bg-[#0F172A] border-2 border-slate-700/70 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] touch-none select-none ${wrongFlash ? 'animate-shake' : ''}`}
              style={{ cursor: stage === 'play' && !timeUp ? 'pointer' : 'default' }}
            >
              {/* subtle dot ambience */}
              <div className="absolute inset-0 rounded-2xl lg:rounded-3xl pointer-events-none opacity-20"
                style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '22px 22px' }} />

              {/* letters */}
              <div className="absolute inset-0 z-10 p-3 lg:p-5 grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
                {grid.cells.map((row, r) =>
                  row.map((letter, c) => {
                    const inSel = selKeySet.has(`${r},${c}`);
                    const inFound = Object.values(found).some((f) => f.cells.some((cc) => cc.row === r && cc.col === c));
                    return (
                      <div key={`${r}-${c}`}
                        className={`flex items-center justify-center font-semibold transition-colors
                          ${inSel ? 'text-amber-200' : inFound ? 'text-emerald-400' : 'text-slate-300'}`}
                        style={{
                          fontSize: `${(100 / size * (inSel ? 0.5 : 0.44)).toFixed(2)}cqw`,
                          textShadow: inSel ? '0 0 12px rgba(245,158,11,0.8)' : inFound ? '0 0 8px rgba(16,185,129,0.4)' : undefined,
                          lineHeight: 1,
                        }}>
                        {letter}
                      </div>
                    );
                  }),
                )}
              </div>

              {/* strokes: found + selection */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
                {Object.entries(found).map(([wordId, entry]) =>
                  strokeLines(entry.cells, entry.revealed ? 'revealed' : 'found', `f-${wordId}`))}
                {sel && selCells.length > 1 && strokeLines(selCells, 'sel', 'sel')}
              </svg>

              {/* persistent hint ring (F3): stays until the word is found */}
              {hintWordId && (() => {
                const placement = grid.placements.find((p) => p.wordId === hintWordId);
                if (!placement) return null;
                const c = placement.cells[0];
                return (
                  <div
                    className="absolute rounded-full border-[3px] border-amber-400 animate-ping-soft pointer-events-none z-30"
                    style={{
                      left: `${((c.col + 0.5) / size) * 100}%`,
                      top: `${((c.row + 0.5) / size) * 100}%`,
                      width: `${(1 / size) * 92}%`,
                      height: `${(1 / size) * 92}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              })()}

              {sel && selCells.length === 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 bg-slate-800/90 text-slate-200 px-3 py-1 rounded-full text-[11px] lg:text-sm font-bold pointer-events-none whitespace-nowrap">
                  tap the last letter…
                </div>
              )}
            </div>

            {/* rail beside the grid at xl+ */}
            <div className="hidden xl:flex h-full max-h-full">{railTokens(false)}</div>
          </main>

          {/* ── HUD ── */}
          <footer className="shrink-0 py-1 px-1 flex items-center justify-between gap-3 bg-[#0B132B]/95 border-t border-slate-800 rounded-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0 overflow-x-auto">
              <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-widest text-slate-500">Words</span>
              {roundWords.map((w, i) => (
                <div key={w.id} className="flex flex-col items-center shrink-0">
                  <div className={`w-8 h-8 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center font-bold text-xs lg:text-sm
                    ${found[w.id] && !found[w.id].revealed
                      ? 'bg-emerald-500 border-2 border-emerald-300 text-[#070C18] shadow-[0_0_22px_2px_rgba(16,185,129,0.35)]'
                      : found[w.id]
                        ? 'bg-slate-700 border-2 border-slate-600 text-slate-300'
                        : 'border-2 border-dashed border-slate-600 bg-slate-900/60 text-slate-500 ws-mono'}`}>
                    {found[w.id] && !found[w.id].revealed ? '✓' : found[w.id] ? '·' : i + 1}
                  </div>
                  {found[w.id] && !found[w.id].revealed && (
                    <span className="ws-mono text-[8px] lg:text-[9px] font-bold uppercase text-emerald-300 mt-0.5 tracking-tight max-w-12 truncate">{w.word}</span>
                  )}
                </div>
              ))}
              {MODE === 'open' && comboRef.current >= 2 && (
                <span className="ml-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold text-xs whitespace-nowrap">
                  🔥 Class combo ×{comboRef.current}
                </span>
              )}
              <span className="ml-1 flex items-center gap-1.5 text-slate-400 font-semibold text-xs lg:text-sm whitespace-nowrap">
                <span className={`w-2 h-2 rounded-full ${state.isConnected && state.sessionSyncHealthy ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                Class score: <span className="ws-mono text-white font-extrabold text-sm lg:text-base">{classScore}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => triggerAction('REVEAL_ANSWER')}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs lg:text-sm flex items-center gap-1.5 active:scale-95">
                <Eye size={15} /> <span className="hidden sm:inline">Reveal</span>
              </button>
              <button onClick={() => triggerAction('REVEAL_HINT')}
                className="px-4 lg:px-6 py-2 bg-[#FF2E79] hover:brightness-110 text-white rounded-xl font-bold text-sm lg:text-base flex items-center gap-2 shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all">
                <Lightbulb size={16} /> Clue
              </button>
            </div>
          </footer>
        </>
      )}

      {/* ═══ TIME'S UP overlay (F1) ═══ */}
      {timeUp && stage === 'play' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070C18]/70 backdrop-blur-[2px] animate-fade-in">
          <div className="bg-[#0B132B] border-2 border-rose-500/40 rounded-3xl shadow-2xl px-8 py-7 flex flex-col items-center max-w-lg mx-4">
            <div className="w-16 h-16 rounded-full bg-rose-500/15 border-2 border-rose-400/50 text-rose-400 flex items-center justify-center mb-3">
              <Bell size={30} />
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-1">Time!</h2>
            <p className="text-slate-400 font-semibold mb-5 text-center">
              {roundWords.length - foundCount > 0
                ? `${roundWords.length - foundCount} word${roundWords.length - foundCount === 1 ? ' is' : 's are'} still hiding — reveal them?`
                : 'Great hunting — everything was found!'}
            </p>
            <div className="flex gap-3">
              <button onClick={revealRemaining}
                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold flex items-center gap-2 active:scale-95 transition-all">
                <Eye size={18} /> Reveal remaining
              </button>
              <button onClick={() => advanceRound(true)}
                className="px-6 py-3 bg-[#FF2E79] hover:brightness-110 text-white rounded-2xl font-bold flex items-center gap-2 active:scale-95 transition-all">
                Next round <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SUMMARY — honest variants (class-found vs teacher-revealed) ═══ */}
      {stage === 'summary' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B132B] border border-slate-700 p-6 lg:p-9 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-xl w-full mx-4 max-h-[92%] overflow-y-auto">
            {roundStats.credited > 0 ? (
              <>
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-400/50 text-emerald-400 flex items-center justify-center mb-3">
                  <Check size={38} strokeWidth={3.5} />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-1">Great search!</h2>
                <p className="text-slate-400 font-medium mb-5">
                  {isFinalRound ? 'That was the last round' : `Round ${roundIndex} of ${TOTAL_ROUNDS}`}
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-sky-500/15 border-2 border-sky-400/50 text-sky-400 flex items-center justify-center mb-3">
                  <Eye size={34} />
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-1">Let's learn these words</h2>
                <p className="text-slate-400 font-medium mb-4 text-center">Say them together after the bell 🔔</p>
              </>
            )}

            <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{roundStats.credited}</div>
                <div className="text-[10px] font-bold text-emerald-300/70 uppercase tracking-wide">Words found</div>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-3 text-center">
                <div className="ws-mono text-2xl font-bold text-sky-400">{elapsedSec}s</div>
                <div className="text-[10px] font-bold text-sky-300/70 uppercase tracking-wide">Time</div>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-center">
                <div className="text-2xl font-bold text-rose-400">{roundStats.misses}</div>
                <div className="text-[10px] font-bold text-rose-300/70 uppercase tracking-wide">Misses</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{roundStats.hints}</div>
                <div className="text-[10px] font-bold text-amber-300/70 uppercase tracking-wide">Clues</div>
              </div>
            </div>

            {roundStats.credited > 0 && roundBonus > 0 && lastFinderName ? (
              <div className="w-full bg-gradient-to-r from-sky-500/80 to-indigo-500/80 text-white rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-between animate-pop-in">
                <span className="font-bold text-sm">⚡ Time bonus</span>
                <span className="ws-mono font-extrabold text-sm">
                  {MODE === 'open' ? `+${roundBonus} class celebration` : `+${roundBonus} → ${lastFinderName}`}
                </span>
              </div>
            ) : roundStats.revealed > 0 ? (
              <div className="w-full bg-slate-800/60 text-slate-400 rounded-2xl px-4 py-2.5 mb-4 text-xs font-bold text-center">
                {roundStats.revealed} word{roundStats.revealed === 1 ? '' : 's'} shown by the teacher — no points, still learned
              </div>
            ) : null}

            {roundStats.credited === 0 && (
              <div className="w-full flex flex-wrap justify-center gap-2 mb-4">
                {roundWords.map((w) => (
                  <button key={w.id} onClick={() => speakWord(w)}
                    className="ws-mono px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm flex items-center gap-1.5">
                    <Volume2 size={13} className="text-sky-400" /> {w.word.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => advanceRound(false)}
              className="px-8 lg:px-10 py-3 lg:py-3.5 bg-[#FF2E79] hover:brightness-110 text-white text-lg font-bold rounded-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:scale-95 transition-all flex items-center gap-2">
              {isFinalRound ? 'See Results' : 'Next Round'} <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ FINAL — stars for real success; calm recap otherwise ═══ */}
      {stage === 'final' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 lg:gap-5 animate-fade-in px-4">
          {!isRecap() ? (
            <>
              <h2 className="text-3xl lg:text-5xl font-bold text-white">Great search, class!</h2>
              <div className="flex gap-2 lg:gap-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={44} className={`animate-star-pop ${i < finalStars ? 'text-amber-400' : 'text-slate-700'}`}
                    fill={i < finalStars ? 'currentColor' : 'none'} style={{ animationDelay: `${i * 0.22}s` }} />
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl lg:text-4xl font-bold text-white">Let's learn these words</h2>
              <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {roundWords.map((w) => (
                  <button key={w.id} onClick={() => speakWord(w)}
                    className="ws-mono px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-sm flex items-center gap-1.5">
                    <Volume2 size={13} className="text-sky-400" /> {w.word.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-sky-300/80 font-semibold text-center">You found the tricky ones together — now you know them all!</p>
            </>
          )}
          <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-3 text-center">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">Class result</div>
            <div className="text-white text-base lg:text-lg font-bold">
              {totalsRef.current.found} / {totalsRef.current.total} words found
              {totalsRef.current.misses > 0 && <span className="text-slate-400"> · {totalsRef.current.misses} misses</span>}
              {totalsRef.current.hints > 0 && <span className="text-slate-400"> · {totalsRef.current.hints} clues</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={resetGame}
              className="px-6 lg:px-8 py-3 bg-[#FF2E79] hover:brightness-110 text-white text-base lg:text-lg font-bold rounded-2xl shadow-[0_0_24px_-2px_rgba(255,46,121,0.45)] active:translate-y-0.5 transition-all flex items-center gap-2">
              <RefreshCcw size={18} /> Play Again
            </button>
            <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
              className="px-6 lg:px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white text-base lg:text-lg font-bold rounded-2xl active:scale-95 transition-all">
              Next Slide →
            </button>
          </div>
          <p className="text-slate-500 text-xs">Points are already on the class leaderboard.</p>
        </div>
      )}

      {/* ═══ CREDIT PICKER (open mode) — attribution micro-state ═══ */}
      {credit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0B132B] border border-slate-700 p-6 lg:p-8 rounded-[2rem] shadow-2xl flex flex-col items-center max-w-2xl w-full mx-4">
            <div className="flex items-center gap-2 mb-2">
              <Pause size={16} className="text-sky-400" />
              <span className="text-sky-300 font-bold text-xs uppercase tracking-widest">Paused — choose the finder</span>
            </div>
            <h3 className="text-xl lg:text-2xl font-bold text-white mb-1">
              Who found {roundWords.find((w) => w.id === credit.wordId)?.word.toUpperCase()}?
            </h3>
            <p className="ws-mono text-emerald-400 font-extrabold mb-5">+{credit.award} pts</p>
            <div className="flex flex-wrap justify-center gap-2 max-h-[38vh] overflow-y-auto">
              {presentStudents.map((s: any) => (
                <button key={s.id} onClick={() => resolveCredit(s.id)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-emerald-600 border-2 border-transparent hover:border-emerald-400 px-4 py-2.5 rounded-2xl font-bold text-slate-200 hover:text-white transition-all active:scale-95">
                  <Avatar src={s.avatar} rosterId={s.id} name={s.name} size={30} />
                  {s.name || 'Student'}
                </button>
              ))}
            </div>
            <button onClick={() => resolveCredit(null)}
              className="mt-4 px-6 py-2 text-slate-400 hover:text-slate-200 font-bold text-sm">
              No credit — class point
            </button>
          </div>
        </div>
      )}

      {/* Floating feedback toast (header-center pill) */}
      {message && (
        <div className={`absolute top-16 lg:top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full font-bold text-sm lg:text-base shadow-xl animate-pop-in flex items-center gap-2 whitespace-nowrap
          ${message.good ? 'bg-emerald-500/95 text-white border-2 border-emerald-300/60' : 'bg-slate-800/95 text-slate-200 border border-slate-600'}`}>
          {message.good && <span className="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-black text-xs">✓</span>}
          {message.text}
        </div>
      )}

      <style>{`
        .ws-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .ws-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .ws-gridcard { container-type: size; }

        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in { animation: fade-in 0.35s ease-out; }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }

        @keyframes ping-soft {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.22); opacity: 0.65; }
        }
        .animate-ping-soft { animation: ping-soft 1.1s ease-in-out infinite; }

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
