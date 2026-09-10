// BoardListenTap v3 — multi-type listen recognition + production game.
//
// UI REBUILT FROM STITCH DESIGN (games-v3 §5, stitch/10-listen-tap/):
//   #1 options-phase (audio-cue banner + 2x2 landscape photo cards + footer
//      HUD) and #2 correct-feedback (emerald MATCHED TARGET + dimmed losers +
//      hands-free auto-advance bar).
// Fidelity log lives in docs/audit/games-v3/10-listen-tap.md §6.
//
// Consumes LISTEN_SELECT, MINIMAL_PAIR_SWIPE, and DICTATION via
// useEscalatingPool. Lifecycle: standard single-item (mistakesRef +
// awardedRef, reset on turnId). Scoring: dual-write — addPoints(id, delta) +
// recordAttempt(...) per event.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Volume2, Check, X, Flame, ChevronRight, Keyboard, Lightbulb,
  Headphones, CheckCircle2, Timer, Zap, Flag,
} from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { useEscalatingPool } from '../useEscalatingPool';
import { logAttempt } from './scoreAttempt';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem } from '../../../types/exercise';

// ── Levenshtein distance (for DICTATION scoring) ─────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const DICTATION_PASS_THRESHOLD = 0.6;

type Phase = 'listen' | 'options' | 'feedback' | 'preview';
type RoundKind = 'LISTEN_SELECT' | 'MINIMAL_PAIR_SWIPE' | 'DICTATION';

const KIND_LABEL: Record<RoundKind, string> = {
  LISTEN_SELECT: 'Tap the picture',
  MINIMAL_PAIR_SWIPE: 'Which sound did you hear?',
  DICTATION: 'Spell it on the Remote',
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ── Component ─────────────────────────────────────────────────────────────
const BoardListenTap = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, pushToRemediation, triggerConfetti } = useSession();
  const pickedStudent = usePickedStudent();
  const unitId = state.activeUnit?.id || '';
  const phase = (state.activeSlideData?.phase || 'PRACTICE') as any;
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // ── Escalating pool ───────────────────────────────────────────────────
  const { items: poolItems, loading } = useEscalatingPool({
    unitId, shellType: 'LISTEN_TAP', phase, roster,
    roundIndex: 1, totalRounds: 1, roundSize: 20,
  });

  // ── Frozen fallback ───────────────────────────────────────────────────
  const frozenOptions = useMemo(() => (Array.isArray(data?.options) ? data.options : []), [data?.options]);

  // ── State ─────────────────────────────────────────────────────────────
  const [round, setRound] = useState(0);
  const [uiPhase, setUiPhase] = useState<Phase>('listen');
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [classStreak, setClassStreak] = useState(0);
  const [showWhisper, setShowWhisper] = useState(false);
  const [dictationInput, setDictationInput] = useState('');
  const [dictationResult, setDictationResult] = useState<{ text: string; ratio: number } | null>(null);
  const [hintActive, setHintActive] = useState(false);
  // 2nd-consecutive-miss teaching card: the correct option + the item's prompt
  // (pattern from BoardFlashMatch's micro-explanation overlay).
  const [showMicroExplanation, setShowMicroExplanation] = useState(false);
  // 1st-miss feedback: brief red shake on the wrong tile, then retry.
  const [wrongFlash, setWrongFlash] = useState(false);

  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);
  const classStreakRef = useRef(0);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Current item ──────────────────────────────────────────────────────
  // games-v3 audit (§2 "asked 'animal' five times"): dedupe the pool per
  // objective so multi-type pools don't re-serve one word in every variant
  // slot — the rotation then walks DISTINCT words.
  const distinctPoolItems = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof poolItems = [];
    for (const it of poolItems) {
      if (seen.has(it.objective_id)) continue;
      seen.add(it.objective_id);
      out.push(it);
    }
    return out;
  }, [poolItems]);
  const poolItem = distinctPoolItems[round % Math.max(1, distinctPoolItems.length)];
  const roundKind: RoundKind = (poolItem?.exercise_type as RoundKind) || 'LISTEN_SELECT';

  const currentItem = useMemo(() => {
    // games-v3 audit (§2): the frozen orchestration-era options previously
    // BYPASSED the pool entirely (single frozen word served forever). The
    // pool is primary; frozen options survive only as a no-pool fallback.
    if (frozenOptions.length > 0 && distinctPoolItems.length === 0) {
      return {
        audioUrl: data?.audioUrl,
        promptText: data?.targetWord || '',
        options: frozenOptions.map((o: any) => ({ image: o.img || '', label: o.label || '', correct: o.correct })),
        kind: 'LISTEN_SELECT' as RoundKind,
        poolItem: null as PoolItem | null,
      };
    }
    if (!poolItem) return null;
    const c = poolItem.content as any;
    return {
      audioUrl: c?.audio_url || '',
      promptText: c?.prompt_text || c?.prompt || '',
      options: (c?.options || []).map((o: any, i: number) => ({
        image: o?.image_url || '', label: o?.text || o?.label || '', correct: i === c.correct_index,
      })),
      kind: poolItem.exercise_type as RoundKind,
      poolItem,
    };
  }, [frozenOptions, data, poolItem]);

  const correctIndex = useMemo(() => currentItem?.options.findIndex((o: any) => o.correct) ?? -1, [currentItem]);

  // ── Dual-write helper ─────────────────────────────────────────────────
  const doDualWrite = useCallback((correctness: 'correct' | 'incorrect' | 'partial', partialRatio?: number) => {
    const picked = state.quickWheelWinner;
    if (!picked || !currentItem?.poolItem) return;
    const pi = currentItem.poolItem;

    if (correctness === 'correct' || (correctness === 'partial' && partialRatio && partialRatio >= DICTATION_PASS_THRESHOLD)) {
      // 4th arg: the class streak — ≥3 = 1.25x, ≥5 = 1.5x (streaks now score).
      const pts = scoreForAttempt(mistakesRef.current, pi.difficulty, partialRatio ?? 1.0, classStreakRef.current);
      addPoints(picked, pts);
    } else if (correctness === 'incorrect') {
      addPoints(picked, -MISTAKE_PENALTY);
    }
    // FIXPLAN P3.3 — unified triple-write: previously analytics-only, so this
    // game's objectives never reached the FSRS ladder or remediation queue.
    const verdict: 'correct' | 'incorrect' | 'partial' =
      partialRatio != null && partialRatio < 1 && partialRatio >= DICTATION_PASS_THRESHOLD ? 'partial' : correctness;
    logAttempt({
      state, picked, unitId,
      objectiveId: pi.objective_id,
      exerciseType: pi.exercise_type,
      difficulty: pi.difficulty,
      correctness: verdict,
      modality: 'receptive',
      pushToRemediation,
    });
  }, [state.quickWheelWinner, state.activeClassId, state.students, addPoints, currentItem, unitId, pushToRemediation]);

  // ── Remote/commander actions ──────────────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    switch (action.type) {
      case 'RESET_GAME':
      case 'NEXT_ROUND':
        advanceRound();
        break;
      case 'REVEAL_ANSWER':
      case 'SHOW_OPTIONS':
        if (uiPhase === 'listen') setUiPhase('options');
        break;
      case 'PLAY_AUDIO':
        playAudio();
        break;
      case 'SUBMIT_DICTATION':
        if (currentItem?.kind === 'DICTATION') {
          handleDictationSubmit(action.payload?.text || '');
        }
        break;
      case 'SKIP':
        advanceRound();
        break;
      case 'REVEAL_HINT':
        if (currentItem?.kind !== 'MINIMAL_PAIR_SWIPE') {
          setHintActive(true);
          setTimeout(() => setHintActive(false), 1500);
        } else {
          // Re-play audio for minimal pair
          playAudio();
        }
        break;
      case 'MARK_CORRECT':
        handleForceCorrect();
        break;
      case 'SLIDE_COMPLETE':
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Game-lifecycle: new turn ──────────────────────────────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    classStreakRef.current = 0;
    setClassStreak(0);
    setSelectedTile(null);
    setRound(r => r + 1);
    setUiPhase('listen');
    setDictationInput('');
    setDictationResult(null);
    setWrongFlash(false);
    setShowMicroExplanation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);

  // ── Auto-play audio on new round ──────────────────────────────────────
  useEffect(() => {
    if (uiPhase === 'listen' && currentItem) {
      const t = setTimeout(() => playAudio(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiPhase, round, currentItem]);

  // ── Auto-show options after audio (LISTEN_SELECT only) ────────────────
  useEffect(() => {
    if (uiPhase === 'listen' && currentItem?.kind === 'LISTEN_SELECT') {
      const t = setTimeout(() => { if (uiPhase === 'listen') setUiPhase('options'); }, 3000);
      return () => clearTimeout(t);
    }
  }, [uiPhase, round, currentItem?.kind]);

  // ── Auto-show options for MINIMAL_PAIR_SWIPE (after audio) ────────────
  useEffect(() => {
    if (uiPhase === 'listen' && currentItem?.kind === 'MINIMAL_PAIR_SWIPE') {
      const t = setTimeout(() => { if (uiPhase === 'listen') setUiPhase('options'); }, 2000);
      return () => clearTimeout(t);
    }
  }, [uiPhase, round, currentItem?.kind]);

  // ── Class-whisper cue ─────────────────────────────────────────────────
  useEffect(() => {
    if (uiPhase === 'options') {
      setShowWhisper(true);
      whisperTimer.current = setTimeout(() => setShowWhisper(false), 3000);
      return () => { if (whisperTimer.current) clearTimeout(whisperTimer.current); };
    }
  }, [uiPhase, round]);

  // ── Actions ───────────────────────────────────────────────────────────
  const playAudio = useCallback(() => {
    if (currentItem?.audioUrl || currentItem?.promptText) {
      playAudioUrl(currentItem.audioUrl, currentItem.promptText);
    }
  }, [currentItem]);

  const advanceRound = useCallback(() => {
    setSelectedTile(null);
    setUiPhase('listen');
    setDictationInput('');
    setDictationResult(null);
    setWrongFlash(false);
    setShowMicroExplanation(false);
    // Per-item attempt reset — each item is its own scored attempt (the
    // 2nd-miss reveal relies on mistakes counting per item, not per turn).
    mistakesRef.current = 0;
    awardedRef.current = false;
    setRound(r => r + 1);
    // Check if pool exhausted
    if (round >= poolItems.length - 1 && poolItems.length > 0) {
      playCue('win');
      triggerAction('SLIDE_COMPLETE', { forced: false });
    }
  }, [round, poolItems.length, triggerAction]);

  const handleTap = useCallback((index: number) => {
    if (uiPhase !== 'options' || !currentItem || wrongFlash) return;
    setSelectedTile(index);
    const isCorrect = index === correctIndex;

    if (isCorrect) {
      classStreakRef.current += 1;
      setClassStreak(classStreakRef.current);
      playCue('correct');
      if (classStreakRef.current === 3 || classStreakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      // Dual-write scoring (doDualWrite guards the picked student itself).
      if (!awardedRef.current) {
        awardedRef.current = true;
        doDualWrite('correct');
      }
      setUiPhase('feedback');
      // Pure celebration — compressed to ≤900ms (dead-time rule).
      setTimeout(() => setUiPhase('preview'), 900);
    } else {
      classStreakRef.current = 0;
      setClassStreak(0);
      mistakesRef.current += 1;
      doDualWrite('incorrect');
      if (mistakesRef.current >= 2) {
        // 2nd consecutive miss → teaching reveal: the correct option + the
        // item's prompt on a micro-explanation card, ~2.2s hold, then advance.
        playCue('reveal');
        setShowMicroExplanation(true);
        setUiPhase('feedback');
        setTimeout(() => {
          setShowMicroExplanation(false);
          advanceRound();
        }, 2200);
      } else {
        // 1st miss: brief wrong flash (no answer reveal), then retry.
        playCue('wrong');
        setWrongFlash(true);
        setTimeout(() => {
          setWrongFlash(false);
          setSelectedTile(null);
        }, 700);
      }
    }
  }, [uiPhase, currentItem, correctIndex, wrongFlash, doDualWrite, advanceRound, triggerConfetti]);

  const handleDictationSubmit = useCallback((text: string) => {
    if (!currentItem?.poolItem || awardedRef.current) return;
    const c = currentItem.poolItem.content as any;
    const correctText: string = c?.correct_text || '';
    const dist = levenshtein(text.toLowerCase().trim(), correctText.toLowerCase().trim());
    const maxLen = Math.max(text.length, correctText.length, 1);
    const ratio = Math.max(0, Math.min(1, 1 - dist / maxLen));
    const correct = ratio >= DICTATION_PASS_THRESHOLD;

    setDictationResult({ text, ratio });

    if (correct) {
      awardedRef.current = true;
      classStreakRef.current += 1;
      setClassStreak(classStreakRef.current);
      playCue('correct');
      if (classStreakRef.current === 3 || classStreakRef.current === 5) {
        playCue('streak');
        triggerConfetti();
      }
      doDualWrite(ratio < 1 ? 'partial' : 'correct', ratio);
      setUiPhase('feedback');
      // Teaching hold: shows the typed attempt vs the target + match %.
      setTimeout(() => setUiPhase('preview'), 3000);
    } else {
      mistakesRef.current += 1;
      classStreakRef.current = 0;
      setClassStreak(0);
      doDualWrite('incorrect');
      setUiPhase('feedback');
      if (mistakesRef.current >= 2) {
        // 2nd miss → teaching reveal (micro card over the dictation compare),
        // then advance.
        playCue('reveal');
        setShowMicroExplanation(true);
        setTimeout(() => {
          setShowMicroExplanation(false);
          advanceRound();
        }, 2200);
      } else {
        playCue('wrong');
        // Teaching hold: the compare view shows attempt vs target + match %.
        setTimeout(() => setUiPhase('preview'), 3000);
      }
    }
  }, [currentItem, doDualWrite, advanceRound, triggerConfetti]);

  const handleForceCorrect = useCallback(() => {
    if (awardedRef.current || !currentItem) return;
    awardedRef.current = true;
    classStreakRef.current += 1;
    setClassStreak(classStreakRef.current);
    playCue('correct');
    if (classStreakRef.current === 3 || classStreakRef.current === 5) {
      playCue('streak');
      triggerConfetti();
    }
    doDualWrite('correct');
    setUiPhase('feedback');
    // Pure celebration — compressed to ≤900ms (dead-time rule).
    setTimeout(() => setUiPhase('preview'), 900);
  }, [currentItem, doDualWrite, triggerConfetti]);

  // ── Derived ───────────────────────────────────────────────────────────
  const nextStudent = useMemo(() => {
    const remaining = state.students.filter(s => !state.turnsThisExercise?.includes(s.id));
    return (remaining[0] || state.students[0])?.name || '';
  }, [state.students, state.turnsThisExercise]);

  // ── RULES OF HOOKS: all hooks above, returns below ────────────────────
  if (loading || !currentItem) {
    if (!loading && !currentItem) {
      return (
        <div className="lt-root h-full flex flex-col items-center justify-center text-slate-400 bg-[#070C18]">
          <Headphones size={48} className="text-sky-500/30 mb-3" />
          <p className="text-2xl font-bold">Content isn't ready for this round yet.</p>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Slide
          </button>
        </div>
      );
    }
    return (
      <div className="lt-root h-full flex flex-col items-center justify-center text-slate-400 bg-[#070C18]">
        <Headphones size={48} className="text-sky-500/30 mb-3" />
        <p className="text-2xl font-bold">{loading ? 'Loading…' : 'No listening items.'}</p>
      </div>
    );
  }

  const kind = currentItem.kind;
  const total = Math.max(1, distinctPoolItems.length);
  const itemNum = (round % total) + 1;
  const correctLabel = currentItem.options[correctIndex]?.label || '';

  // ── Render pieces ─────────────────────────────────────────────────────

  // Header. BoardShell's phase pill sits top-left (~164px) — pl-40/lg:pl-48
  // keeps the game badge clear of it (same fix as Word Search, 2026-09-10).
  const header = (
    <header className="w-full flex items-center justify-between gap-3 pr-1 pl-40 lg:pl-48 h-12 lg:h-14 [@media(max-height:430px)]:h-9 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/40 flex items-center justify-center shadow-[0_0_18px_-4px_rgba(56,189,248,0.5)] shrink-0">
          <Headphones size={16} className="text-[#38BDF8]" />
        </div>
        <h1 className="text-lg lg:text-xl font-bold tracking-tight text-white truncate">Listen &amp; Tap</h1>
        <span className="hidden sm:inline px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold uppercase tracking-wider bg-slate-800/90 border border-slate-700 text-sky-300 whitespace-nowrap">
          Q{itemNum}/{total} · {KIND_LABEL[kind]}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {classStreak >= 2 && (
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950/60 border border-amber-500/50">
            <Flame size={14} className="text-amber-400" />
            <span className="lt-mono text-xs font-bold tracking-wider text-amber-300">STREAK {classStreak}</span>
          </motion.div>
        )}
        <button onClick={playAudio} title="Replay the audio"
          className="flex items-center gap-2 px-3 lg:px-5 py-1.5 lg:py-2 rounded-xl bg-slate-800/90 border border-[#38BDF8]/50 hover:bg-[#38BDF8]/15 hover:shadow-[0_0_16px_-2px_rgba(56,189,248,0.4)] transition-all active:scale-95">
          <Volume2 size={16} className="text-[#38BDF8]" />
          <span className="hidden md:inline text-xs lg:text-sm font-bold uppercase tracking-wide text-[#7DD3FC]">Replay Audio</span>
        </button>
        {(uiPhase === 'options' || uiPhase === 'listen') && (
          <button onClick={advanceRound} title="Skip this question"
            className="px-2.5 lg:px-4 py-1.5 lg:py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors active:scale-95">
            Skip
          </button>
        )}
      </div>
    </header>
  );

  // Audio-cue banner. NEVER renders promptText during listen/options — that
  // text IS the spoken target and would reveal the answer on the projector
  // (design adaptation; fidelity log). It appears only after answering.
  const banner = (
    <div className="w-full shrink-0 flex items-center justify-between gap-4 px-4 lg:px-6 py-2 lg:py-2.5 rounded-2xl bg-[#0B132B]/90 border border-[#38BDF8]/25 shadow-[0_0_24px_-8px_rgba(56,189,248,0.25)]">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          uiPhase === 'listen' ? 'bg-[#38BDF8]/20 border border-[#38BDF8]/60 shadow-[0_0_14px_-2px_rgba(56,189,248,0.5)]' : 'bg-slate-800 border border-slate-700'
        }`}>
          <Headphones size={18} className={uiPhase === 'listen' ? 'text-[#38BDF8]' : 'text-slate-400'} />
        </div>
        <div className="min-w-0">
          <p className="lt-mono text-[9px] lg:text-[10px] font-bold uppercase tracking-[0.18em] text-[#38BDF8] flex items-center gap-2">
            Auditory prompt
            <span className="hidden sm:flex items-end gap-[3px] h-3">
              {[0, 1, 2, 3].map(i => (
                <span key={i} className={`w-[3px] rounded-full bg-[#38BDF8] ${uiPhase === 'listen' ? 'lt-wave' : ''}`}
                  style={{ height: [12, 7, 14, 9][i], animationDelay: `${i * 0.12}s` }} />
              ))}
            </span>
          </p>
          <p className="text-sm lg:text-lg font-bold text-white truncate">
            {uiPhase === 'listen' ? (kind === 'DICTATION' ? 'Listen… then type what you heard.' : 'Listen carefully… then tap the matching picture.')
              : kind === 'DICTATION' ? 'Type what you heard on the Remote.'
              : uiPhase === 'feedback' && selectedTile === correctIndex ? 'You heard:'
              : uiPhase === 'feedback' ? 'The answer was:'
              : 'Which picture matches what you hear?'}
            {(uiPhase === 'feedback' || uiPhase === 'preview') && (
              <span className="text-[#7DD3FC]"> {correctLabel}</span>
            )}
          </p>
        </div>
      </div>
      {/* Feedback verdict badge (design #2) */}
      {uiPhase === 'feedback' && kind !== 'DICTATION' && (
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full border shrink-0 ${
            selectedTile === correctIndex
              ? 'bg-emerald-950/80 border-emerald-400/70 shadow-[0_0_16px_-4px_rgba(16,185,129,0.6)]'
              : 'bg-rose-950/80 border-rose-400/70'
          }`}>
          {selectedTile === correctIndex
            ? <CheckCircle2 size={16} className="text-emerald-400" />
            : <X size={16} className="text-rose-400" />}
          <span className={`lt-mono text-xs font-bold tracking-wider ${selectedTile === correctIndex ? 'text-emerald-300' : 'text-rose-300'}`}>
            {selectedTile === correctIndex ? 'CORRECT' : 'TRY AGAIN'}
          </span>
        </motion.div>
      )}
    </div>
  );

  // Option card (design #1: landscape photo card, letter badge, label plate;
  // design #2 states: correct = emerald MATCHED TARGET glow, others dimmed).
  const renderCard = (opt: any, i: number) => {
    const isCorrect = i === correctIndex;
    const isSelected = selectedTile === i;
    const showResult = uiPhase === 'feedback' || uiPhase === 'preview';
    const solvedCorrect = showResult && selectedTile === correctIndex;
    const isHinted = hintActive && isCorrect && !isSelected;
    const twoUp = currentItem.options.length === 2;

    return (
      <motion.button
        key={i}
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.07, duration: 0.28 }}
        onClick={() => handleTap(i)}
        disabled={uiPhase !== 'options'}
        className={`lt-card group relative min-h-0 flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200 ${
          solvedCorrect && isCorrect
            ? 'border-2 border-emerald-400 lt-glow-correct scale-[1.02]'
            : solvedCorrect
              ? 'border border-slate-700/60 opacity-40 grayscale-[30%]'
              : wrongFlash && isSelected
                ? 'border-2 border-rose-400 lt-shake bg-rose-950/30'
                : isSelected
                  ? 'border-2 border-[#38BDF8] lt-glow-sky'
                  : isHinted
                    ? 'border-2 border-amber-400 lt-pulse-hint bg-amber-950/20'
                    : 'border border-slate-700/80 bg-[#111C3D] hover:border-[#38BDF8]/60 hover:-translate-y-0.5'
        } ${uiPhase === 'options' ? 'cursor-pointer' : 'cursor-default'}`}>
        {/* Photo area (landscape — fills the card top) */}
        <div className="relative flex-1 min-h-0 overflow-hidden bg-[#0B132B]">
          {opt.image && String(opt.image).startsWith('http') ? (
            <img src={opt.image} alt="" className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.15')} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="lt-mono font-extrabold text-slate-600 text-5xl lg:text-7xl">
                {opt.label?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B132B] via-transparent to-black/25" />
          {/* Letter badge + option tag */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
            <span className={`w-7 h-7 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center lt-mono font-extrabold text-sm shadow-md ${
              solvedCorrect && isCorrect ? 'bg-emerald-400 text-slate-900'
                : isSelected ? 'bg-[#38BDF8] text-slate-900'
                : 'bg-[#070C18]/90 border border-slate-600 text-sky-300'
            }`}>{LETTERS[i]}</span>
            <span className="hidden md:inline lt-mono text-[9px] tracking-[0.14em] uppercase text-slate-300/80 bg-[#070C18]/80 px-2 py-0.5 rounded">
              Option {i + 1}
            </span>
          </div>
          {/* Correct verdict pill (design #2) */}
          {solvedCorrect && isCorrect && (
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 text-slate-900 lt-mono text-[10px] font-black tracking-wider uppercase shadow-[0_0_18px_-2px_rgba(16,185,129,0.8)]">
              <Check size={12} strokeWidth={4} /> Matched
            </motion.div>
          )}
          {wrongFlash && isSelected && (
            <div className="absolute top-2 right-2 z-10 w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center">
              <X size={16} strokeWidth={4} />
            </div>
          )}
        </div>
        {/* Label plate */}
        <div className={`shrink-0 h-10 lg:h-14 px-3 lg:px-4 flex items-center justify-between gap-2 border-t ${
          solvedCorrect && isCorrect ? 'bg-emerald-950/60 border-emerald-500/40'
            : isSelected ? 'bg-[#38BDF8]/10 border-[#38BDF8]/40'
            : 'bg-[#111C3D] border-slate-700/60'
        }`}>
          <span className={`lt-mono font-extrabold tracking-wide truncate ${twoUp ? 'text-xl lg:text-3xl' : 'text-base lg:text-2xl'} ${
            solvedCorrect && isCorrect ? 'text-emerald-300'
              : isSelected ? 'text-[#7DD3FC]' : 'text-white'
          }`}>
            {opt.label}
          </span>
          <CheckCircle2 size={twoUp ? 24 : 18} className={`shrink-0 ${
            solvedCorrect && isCorrect ? 'text-emerald-400' : isSelected ? 'text-[#38BDF8]' : 'text-slate-600'
          }`} />
        </div>
      </motion.button>
    );
  };

  // Footer HUD: progress dots + hands-free auto-advance bar (design #2) /
  // pink Next-Round CTA (preview) — the single hot-pink element per screen.
  const footer = (
    <footer className="w-full shrink-0 h-10 lg:h-12 flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {Array.from({ length: Math.min(total, 8) }).map((_, i) => {
          const done = i < itemNum - 1;
          const active = i === itemNum - 1;
          return (
            <div key={i} className={`flex items-center gap-1 px-2 py-0.5 rounded-md border lt-mono text-[10px] font-bold ${
              done ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-400'
                : active ? 'border-[#38BDF8] bg-[#38BDF8]/10 text-[#7DD3FC]'
                : 'border-slate-700/60 bg-slate-800/40 text-slate-500'
            }`}>
              {done && <Check size={10} strokeWidth={4} />}Q{i + 1}
            </div>
          );
        })}
        {total > 8 && <span className="lt-mono text-[10px] text-slate-500 font-bold">+{total - 8}</span>}
      </div>

      <div className="flex-1 max-w-md flex items-center justify-end gap-3">
        {/* Whisper cue (options phase, first 3s) */}
        <AnimatePresence>
          {showWhisper && uiPhase === 'options' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 whitespace-nowrap">
              <span className="text-xs">🤫</span>
              <span className="text-xs font-bold text-slate-300">Class: whisper your answer!</span>
            </motion.div>
          )}
        </AnimatePresence>

        {uiPhase === 'feedback' && (
          <div className="w-40 lg:w-64 flex flex-col gap-1">
            <span className="lt-mono text-[9px] lg:text-[10px] text-[#7DD3FC] font-bold tracking-wide flex items-center gap-1 justify-end">
              <Timer size={10} /> Next question…
            </span>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
              <div className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] to-emerald-400 lt-advance"
                style={{ animationDuration: showMicroExplanation ? '2.2s' : (kind === 'DICTATION' ? '3s' : '0.9s') }} />
            </div>
          </div>
        )}

        {uiPhase === 'preview' && (
          <motion.button initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={advanceRound}
            className="flex items-center gap-2 px-4 lg:px-7 py-2 rounded-xl bg-[#FF2E79] text-white font-bold text-sm lg:text-base tracking-wide shadow-[0_0_20px_-4px_rgba(255,46,121,0.6)] hover:shadow-[0_0_28px_-4px_rgba(255,46,121,0.8)] active:scale-95 transition-all">
            Next Round <ChevronRight size={18} />
          </motion.button>
        )}
      </div>
    </footer>
  );

  return (
    <div className="lt-root h-full w-full flex flex-col gap-2 lg:gap-3 p-2 lg:p-4 [@media(max-height:430px)]:gap-1.5 [@media(max-height:430px)]:p-1.5 relative overflow-hidden">
      <style>{`
        .lt-root { font-family: 'Fredoka', 'Baloo 2', ui-rounded, 'Segoe UI', system-ui, sans-serif; }
        .lt-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
        .lt-card { container-type: normal; }
        .lt-glow-correct { box-shadow: 0 0 30px -4px rgba(16,185,129,0.55), inset 0 0 24px rgba(16,185,129,0.12); }
        .lt-glow-sky { box-shadow: 0 0 24px -4px rgba(56,189,248,0.5), inset 0 0 20px rgba(56,189,248,0.1); }
        @keyframes lt-wave { 0%, 100% { transform: scaleY(0.5); opacity: 0.5; } 50% { transform: scaleY(1.15); opacity: 1; } }
        .lt-wave { animation: lt-wave 0.9s ease-in-out infinite; transform-origin: bottom; }
        @keyframes lt-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-7px); } 40%, 80% { transform: translateX(7px); } }
        .lt-shake { animation: lt-shake 0.4s ease-in-out; }
        @keyframes lt-pulse-hint { 0%, 100% { box-shadow: 0 0 8px -2px rgba(245,158,11,0.4); } 50% { box-shadow: 0 0 26px -2px rgba(245,158,11,0.75); } }
        .lt-pulse-hint { animation: lt-pulse-hint 0.8s ease-in-out infinite; }
        @keyframes lt-advance { from { width: 100%; } to { width: 0%; } }
        .lt-advance { animation-name: lt-advance; animation-timing-function: linear; animation-fill-mode: forwards; }
        @keyframes lt-ring { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.22); opacity: 0.12; } }
        .lt-ring { animation: lt-ring 1.8s ease-in-out infinite; }
      `}</style>

      {header}

      {/* ═══ LISTEN PHASE — big sky speaker moment (design's audio role) ═══ */}
      {uiPhase === 'listen' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 lg:gap-5">
          {banner}
          <button onClick={playAudio} className="relative flex items-center justify-center w-28 h-28 lg:w-44 lg:h-44 [@media(max-height:430px)]:w-20 [@media(max-height:430px)]:h-20 shrink-0">
            <span className="lt-ring absolute inset-0 rounded-full border-2 border-[#38BDF8]/60" />
            <span className="lt-ring absolute rounded-full border-2 border-[#38BDF8]/40" style={{ inset: '14%', animationDelay: '0.5s' }} />
            <span className="lt-ring absolute rounded-full border-2 border-[#38BDF8]/25" style={{ inset: '28%', animationDelay: '1s' }} />
            <span className="relative w-16 h-16 lg:w-24 lg:h-24 rounded-full bg-[#38BDF8]/15 border-2 border-[#38BDF8] flex items-center justify-center shadow-[0_0_44px_-6px_rgba(56,189,248,0.65)] active:scale-95 transition-transform">
              <Volume2 size={36} className="text-[#38BDF8] lg:hidden" />
              <Volume2 size={56} className="text-[#38BDF8] hidden lg:block" />
            </span>
          </button>
          <p className="text-2xl lg:text-4xl font-bold text-[#7DD3FC]">Listen!</p>
          {kind === 'DICTATION' && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Keyboard size={16} className="text-slate-500" /> Type the answer on the Remote
            </p>
          )}
        </div>
      )}

      {/* ═══ OPTIONS / FEEDBACK — photo card grid ═══ */}
      {(uiPhase === 'options' || uiPhase === 'feedback') && kind !== 'DICTATION' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2 lg:gap-3">
          {banner}
          <div className={`flex-1 min-h-0 grid gap-2.5 lg:gap-5 ${
            currentItem.options.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'
          }`}>
            {currentItem.options.map((opt: any, i: number) => renderCard(opt, i))}
          </div>
          {footer}
        </div>
      )}

      {/* ═══ DICTATION — remote-typing card + compare feedback ═══ */}
      {(uiPhase === 'listen' || uiPhase === 'options' || uiPhase === 'feedback') && kind === 'DICTATION' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2 lg:gap-3">
          {banner}
          <div className="flex-1 min-h-0 flex items-center justify-center">
            {uiPhase === 'feedback' && dictationResult ? (
              <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                className={`w-full max-w-2xl rounded-3xl border-2 p-6 lg:p-10 text-center ${
                  dictationResult.ratio >= DICTATION_PASS_THRESHOLD
                    ? 'border-emerald-400/70 bg-emerald-950/30 lt-glow-correct'
                    : 'border-rose-400/60 bg-rose-950/20'
                }`}>
                <div className="flex items-center justify-center gap-2 mb-3">
                  {dictationResult.ratio >= DICTATION_PASS_THRESHOLD
                    ? <CheckCircle2 size={28} className="text-emerald-400" />
                    : <X size={28} className="text-rose-400" />}
                  <span className={`lt-mono text-sm font-bold tracking-widest uppercase ${dictationResult.ratio >= DICTATION_PASS_THRESHOLD ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {dictationResult.ratio >= DICTATION_PASS_THRESHOLD ? 'Correct' : 'Not quite'}
                  </span>
                </div>
                <p className="lt-mono text-2xl lg:text-4xl font-extrabold text-white mb-2">“{dictationResult.text}”</p>
                <p className="text-sm lg:text-base text-slate-400">
                  Target: <span className="text-[#7DD3FC] font-bold">{(currentItem.poolItem?.content as any)?.correct_text}</span>
                  <span className="lt-mono ml-2 text-slate-500">{Math.round(dictationResult.ratio * 100)}% match</span>
                </p>
              </motion.div>
            ) : (
              <div className="w-full max-w-xl rounded-3xl border-2 border-dashed border-[#38BDF8]/40 bg-[#0B132B]/70 p-8 lg:p-12 text-center">
                <Keyboard size={40} className="text-[#38BDF8]/70 mx-auto mb-4" />
                <p className="text-xl lg:text-2xl font-bold text-white">Teacher: type what you heard on the Remote</p>
                <p className="lt-mono text-xs text-slate-500 mt-3 uppercase tracking-widest">Remote Baton · dictation mode</p>
              </div>
            )}
          </div>
          {footer}
        </div>
      )}

      {/* ═══ PREVIEW — transition beat with next student ═══ */}
      {uiPhase === 'preview' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 lg:gap-4">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`w-20 h-20 lg:w-28 lg:h-28 rounded-full flex items-center justify-center border-2 ${
              (kind === 'DICTATION' ? dictationResult && dictationResult.ratio >= DICTATION_PASS_THRESHOLD : selectedTile === correctIndex)
                ? 'border-emerald-400 bg-emerald-500/15 lt-glow-correct' : 'border-amber-400/70 bg-amber-500/10'
            }`}>
            {(kind === 'DICTATION' ? dictationResult && dictationResult.ratio >= DICTATION_PASS_THRESHOLD : selectedTile === correctIndex)
              ? <Check size={44} className="text-emerald-400" strokeWidth={3} />
              : <Lightbulb size={40} className="text-amber-400" />}
          </motion.div>
          <p className="text-2xl lg:text-3xl font-bold text-white">
            {(kind === 'DICTATION' ? dictationResult && dictationResult.ratio >= DICTATION_PASS_THRESHOLD : selectedTile === correctIndex)
              ? (classStreak >= 5 ? 'Amazing! Keep the streak burning!' : pickedStudent ? `${pickedStudent.name} got it!` : 'Well done!')
              : 'Good try — listen once more!'}
          </p>
          {nextStudent && (
            <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/5 border border-white/10">
              <Flag size={14} className="text-[#38BDF8]" />
              <span className="text-sm text-slate-400">Next:</span>
              <span className="font-bold text-[#7DD3FC]">{nextStudent}</span>
            </div>
          )}
          {footer}
        </div>
      )}

      {/* Micro-explanation overlay — 2nd consecutive miss teaching beat:
          the correct option + the item's prompt (v3 dark styling). */}
      {showMicroExplanation && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 pointer-events-none">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-[#111C3D] border-2 border-amber-400/60 p-6 lg:p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-md text-center">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={22} className="text-amber-400" />
              <span className="lt-mono text-xs font-bold tracking-widest uppercase text-amber-300">Remember this one</span>
            </div>
            {currentItem.options[correctIndex]?.image && String(currentItem.options[correctIndex].image).startsWith('http') ? (
              <img src={currentItem.options[correctIndex].image} alt=""
                className="w-28 h-28 object-cover rounded-2xl mb-3 border border-slate-600" />
            ) : null}
            <p className="lt-mono text-3xl lg:text-4xl font-extrabold text-white">{currentItem.options[correctIndex]?.label}</p>
            {currentItem.promptText && (
              <p className="text-base text-slate-400 mt-2">You heard: “{currentItem.promptText}”</p>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BoardListenTap;
