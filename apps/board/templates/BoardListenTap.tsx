// BoardListenTap v2 — multi-type listen recognition + production game.
//
// Rewritten per listentap-v2-spec.md. Consumes LISTEN_SELECT,
// MINIMAL_PAIR_SWIPE, and DICTATION via useEscalatingPool.
//
// Round types:
//   LISTEN_SELECT (rung 2): audio → tap matching image (current mechanic).
//   MINIMAL_PAIR_SWIPE (rung 2): audio → pick left/right of near-sounds.
//   DICTATION (rung 4): audio → teacher types answer on Remote-Baton.
//
// Lifecycle: standard single-item (mistakesRef + awardedRef, reset on turnId).
// Scoring: dual-write — addPoints(id, delta) + recordAttempt(...) per event.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, X, Flame, ChevronRight, Keyboard, Lightbulb } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { playCue } from './playCue';
import { usePickedStudent } from './usePickedStudent';
import { useEscalatingPool } from '../useEscalatingPool';
import { recordAttempt } from '../../../services/attemptsLog';
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
const TILE_COLORS = [
  { bg: 'bg-[#FF6B6B]', border: 'border-[#FF6B6B]' },
  { bg: 'bg-[#4ECDC4]', border: 'border-[#4ECDC4]' },
  { bg: 'bg-[#FFD93D]', border: 'border-[#FFD93D]' },
  { bg: 'bg-[#A78BFA]', border: 'border-[#A78BFA]' },
];

type Phase = 'listen' | 'options' | 'feedback' | 'preview';
type RoundKind = 'LISTEN_SELECT' | 'MINIMAL_PAIR_SWIPE' | 'DICTATION';

// ── Component ─────────────────────────────────────────────────────────────
const BoardListenTap = ({ data }: { data: any }) => {
  const { state, triggerAction, addPoints, triggerConfetti } = useSession();
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
  const poolItem = poolItems[round % Math.max(1, poolItems.length)];
  const roundKind: RoundKind = (poolItem?.exercise_type as RoundKind) || 'LISTEN_SELECT';

  const currentItem = useMemo(() => {
    if (frozenOptions.length > 0) {
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
    const student = (state.students || []).find((s: any) => s.id === picked);
    const pi = currentItem.poolItem;

    if (correctness === 'correct' || (correctness === 'partial' && partialRatio && partialRatio >= DICTATION_PASS_THRESHOLD)) {
      // 4th arg: the class streak — ≥3 = 1.25x, ≥5 = 1.5x (streaks now score).
      const pts = scoreForAttempt(mistakesRef.current, pi.difficulty, partialRatio ?? 1.0, classStreakRef.current);
      addPoints(picked, pts);
    } else if (correctness === 'incorrect') {
      addPoints(picked, -MISTAKE_PENALTY);
    }
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness: partialRatio != null && partialRatio < 1 && partialRatio >= DICTATION_PASS_THRESHOLD ? 'partial' : correctness,
      objectiveId: pi.objective_id,
      exerciseType: pi.exercise_type,
      difficulty: pi.difficulty,
    }).catch(() => {});
  }, [state.quickWheelWinner, state.activeClassId, state.students, addPoints, currentItem]);

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
        <div className="h-full flex flex-col items-center justify-center text-slate-400">
          <Volume2 size={48} className="text-green-500/30 mb-3" />
          <p className="font-display text-2xl font-bold">Content isn't ready for this round yet.</p>
          <button onClick={() => triggerAction('SLIDE_COMPLETE', { forced: true })}
            className="mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white">
            Skip Slide
          </button>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Volume2 size={48} className="text-green-500/30 mb-3" />
        <p className="font-display text-2xl font-bold">{loading ? 'Loading…' : 'No listening items.'}</p>
      </div>
    );
  }

  const kind = currentItem.kind;

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Streak counter */}
      <AnimatePresence>
        {classStreak >= 1 && (
          <motion.div initial={{ opacity: 0, scale: 0.5, x: 20 }} animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.5 }} className="absolute top-3 right-4 flex items-center gap-1.5 z-20">
            {classStreak >= 3 && <Flame size={classStreak >= 10 ? 32 : classStreak >= 5 ? 26 : 20}
              className={classStreak >= 5 ? 'text-orange-400' : 'text-amber-400'} />}
            <span className={`font-display font-black tabular-nums ${classStreak >= 10 ? 'text-4xl text-orange-300' : classStreak >= 5 ? 'text-3xl text-orange-400' : 'text-2xl text-amber-400'}`}>
              {classStreak}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round counter */}
      <div className="absolute top-3 left-4 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 z-20">
        <span className="text-sm text-slate-400 font-bold">Round {round + 1} · {kind.replace(/_/g, ' ')}</span>
      </div>

      {/* ═══ LISTEN PHASE ═══ */}
      <AnimatePresence mode="wait">
        {uiPhase === 'listen' && (
          <motion.div key="listen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center">
            <button onClick={playAudio} className="relative flex items-center justify-center mb-6" style={{ width: 200, height: 200 }}>
              {[0, 1, 2].map(i => (
                <motion.div key={i} className="absolute rounded-full border-2 border-green-400"
                  style={{ width: 100 + i * 45, height: 100 + i * 45 }}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }} />
              ))}
              <div className="relative w-[120px] h-[120px] rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,.4)]">
                <Volume2 size={56} className="text-green-400" />
              </div>
            </button>
            <p className="font-display text-4xl font-bold text-green-300">Listen!</p>
            <p className="font-cn text-2xl text-slate-400/60 mt-1">听！</p>
            {kind === 'DICTATION' && (
              <p className="mt-4 text-sm text-slate-500 flex items-center gap-2">
                <Keyboard size={16} /> Type the answer on the Remote
              </p>
            )}
          </motion.div>
        )}

        {/* ═══ OPTIONS PHASE (LISTEN_SELECT + MINIMAL_PAIR_SWIPE) ═══ */}
        {(uiPhase === 'options' || uiPhase === 'feedback') && kind !== 'DICTATION' && (
          <motion.div key="options" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center w-full">
            <p className="font-display text-2xl font-bold text-green-300 mb-1">
              {uiPhase === 'feedback' && selectedTile === correctIndex ? 'Yes! 太棒了!' :
               uiPhase === 'feedback' ? `The answer is: ${currentItem.options[correctIndex]?.label}` : 'Tap the answer!'}
            </p>

            {/* Tiles */}
            <div className={`flex items-stretch gap-4 ${currentItem.options.length === 2 ? '' : 'flex-wrap justify-center'}`}>
              {currentItem.options.map((opt: any, i: number) => {
                const isCorrect = i === correctIndex;
                const isSelected = selectedTile === i;
                const color = TILE_COLORS[i % TILE_COLORS.length];
                const showResult = uiPhase === 'feedback';
                const isHinted = hintActive && isCorrect && !isSelected;

                return (
                  <motion.button key={i}
                    initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    onClick={() => handleTap(i)} disabled={uiPhase !== 'options'}
                    className={`group relative rounded-2xl border-2 w-[160px] h-[200px] flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                      showResult && isCorrect ? 'border-green-400 bg-green-500/20 scale-110 shadow-[0_0_30px_rgba(34,197,94,.5)]' :
                      showResult && isSelected && !isCorrect ? 'border-red-400 bg-red-500/10' :
                      wrongFlash && isSelected ? 'border-red-400 bg-red-500/10' :
                      isHinted ? 'border-yellow-400 bg-yellow-500/20 animate-pulse shadow-lg' :
                      `${color.border} bg-white/5 hover:scale-105 hover:shadow-lg`
                    } ${uiPhase === 'options' ? 'cursor-pointer' : 'cursor-default'}`}>
                    {opt.image && String(opt.image).startsWith('http') ? (
                      <img src={opt.image} alt="" className="w-24 h-24 object-contain drop-shadow-lg"
                        onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                    ) : (
                      <span className="text-6xl">{opt.label?.charAt(0).toUpperCase() || '?'}</span>
                    )}
                    {showResult && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                        <div className="font-display text-lg font-bold text-white">{opt.label}</div>
                      </motion.div>
                    )}
                    {showResult && isCorrect && <Check size={24} className="absolute top-2 right-2 text-green-400" strokeWidth={4} />}
                    {(showResult || wrongFlash) && isSelected && !isCorrect && <X size={24} className="absolute top-2 right-2 text-red-400" strokeWidth={4} />}
                    {(showResult || wrongFlash) && isSelected && !isCorrect && (
                      <motion.div className="absolute inset-0 rounded-2xl border-2 border-red-400"
                        animate={{ x: [-4, 4, -4, 4, 0] }} transition={{ duration: 0.3 }} />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Feedback */}
            {uiPhase === 'feedback' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center">
                {selectedTile === correctIndex ? (
                  <p className="font-display text-xl text-green-300">
                    {classStreak >= 10 ? '🔥 INCREDIBLE! 太厉害了!' : classStreak >= 5 ? '🔥 Amazing! 太棒了!' : (pickedStudent ? `${pickedStudent.name} got it!` : 'Correct!')}
                  </p>
                ) : (
                  <p className="font-display text-lg text-slate-400">
                    {currentItem.options[correctIndex]?.label} {currentItem.promptText ? `· ${currentItem.promptText}` : ''}
                  </p>
                )}
              </motion.div>
            )}

            {/* Class-whisper cue */}
            <AnimatePresence>
              {showWhisper && uiPhase === 'options' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="mt-4 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2">
                  <span className="text-sm">🤫</span>
                  <span className="font-display text-sm font-bold text-slate-300">Class: whisper your answer!</span>
                  <span className="font-cn text-xs text-slate-400/60">全班：小声说答案！</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══ DICTATION FEEDBACK ═══ */}
        {uiPhase === 'feedback' && kind === 'DICTATION' && dictationResult && (
          <motion.div key="dictation-fb" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center text-center">
            <div className="text-5xl mb-3">{dictationResult.ratio >= DICTATION_PASS_THRESHOLD ? '✅' : '❌'}</div>
            <p className="font-display text-2xl font-bold text-white mb-2">"{dictationResult.text}"</p>
            <p className="text-lg text-slate-400">Target: <span className="text-green-300 font-bold">{(currentItem.poolItem?.content as any)?.correct_text}</span></p>
            <p className="text-sm text-slate-500 mt-1">Match: {Math.round(dictationResult.ratio * 100)}%</p>
          </motion.div>
        )}

        {/* ═══ PREVIEW PHASE ═══ */}
        {uiPhase === 'preview' && (
          <motion.div key="preview" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center">
            <div className="text-5xl mb-3">
              {kind === 'DICTATION' ? (dictationResult && dictationResult.ratio >= DICTATION_PASS_THRESHOLD ? '✅' : '📚')
                : selectedTile === correctIndex ? '✅' : '📚'}
            </div>
            <p className="font-display text-2xl font-bold text-slate-300 mb-2">
              {kind === 'DICTATION' ? (dictationResult && dictationResult.ratio >= DICTATION_PASS_THRESHOLD ? 'Well done!' : 'Good try!')
                : selectedTile === correctIndex ? 'Well done!' : 'Good try!'}
            </p>
            {nextStudent && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-5 py-2">
                <span className="text-sm text-slate-400">Next:</span>
                <span className="font-display text-lg font-bold text-green-300">{nextStudent}</span>
              </div>
            )}
            <button onClick={advanceRound}
              className="mt-4 flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-2xl font-bold text-lg active:scale-95 shadow-lg">
              Next Round <ChevronRight size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Micro-explanation overlay — 2nd consecutive miss teaching beat
          (BoardFlashMatch pattern): the correct option + the item's prompt. */}
      {showMicroExplanation && currentItem && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 pointer-events-none">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-md text-center">
            <Lightbulb size={40} className="text-amber-500 mb-3" />
            {currentItem.options[correctIndex]?.image && String(currentItem.options[correctIndex].image).startsWith('http') ? (
              <img src={currentItem.options[correctIndex].image} alt=""
                className="w-24 h-24 object-contain mb-2 drop-shadow-lg" />
            ) : null}
            <p className="text-3xl font-bold text-slate-800">{currentItem.options[correctIndex]?.label}</p>
            {currentItem.promptText && (
              <p className="text-lg text-slate-500 mt-1">You heard: “{currentItem.promptText}”</p>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default BoardListenTap;
