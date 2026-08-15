// BoardSpeedQuiz v2 — multi-type timed assessment (ASSESS phase).
//
// Rewritten per speedquiz-teambattle-v2-spec.md:
//   • Consumes 6 exercise types: MEANING_MATCH, SPELL_CLOZE, LISTEN_SELECT,
//     ERROR_SPOT, STORY_COMPREHENSION, WORD_BANK_BUILD (spec Part A).
//   • Question composition: proportional-to-type-distribution + mastery-weighted
//     within type (spec A1) via useQuizComposition hook.
//   • One-shot per question (awardedRef per turn, no retry loop — spec B1).
//   • Dual-write on every answer + timeout: addPoints (leaderboard) +
//     recordAttempt (analytics) + gradeObjective (FSRS).
//   • WORD_BANK_BUILD: tile-assembly UI reusing BoardUnscramble's LCS partial
//     credit. Timer runs underneath; on timeout, score whatever was placed.
//   • SLIDE_COMPLETE after last question resolves.
//   • Misses push to pushToRemediation (spec D1).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Trophy, Check, X, Flame, Star, Volume2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useQuizComposition, type QuizQuestion } from '../quizEngine';
import { computeLCSPartialCredit } from './BoardUnscramble';
import { scoreForAttempt, MISTAKE_PENALTY } from './scoringDefaults';
import { usePickedStudent } from './usePickedStudent';
import { recordAttempt } from '../../../services/attemptsLog';
import { gradeObjective } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';
import type { PoolItem } from '../../../types/exercise';

type Phase = 'ready' | 'answering' | 'reveal' | 'results';

// Shaped tiles (reused from Team Battle for ASSESS-phase consistency).
const SHAPES = [
  { bg: 'bg-rose-500', sym: '▲' },
  { bg: 'bg-blue-500', sym: '◆' },
  { bg: 'bg-amber-400 text-slate-900', sym: '●' },
  { bg: 'bg-green-500', sym: '■' },
];

const BoardSpeedQuiz = ({ data }: { data: any }) => {
  const { state, addPoints, pushToRemediation, triggerAction } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);
  const pickedStudent = usePickedStudent();

  // ── Quiz composition (multi-type, mastery-weighted) ──────────────────
  const TOTAL_Q = data?.totalQuestions || 8;
  const { questions, loading } = useQuizComposition(unitId, TOTAL_Q, roster);

  // ── State ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('ready');
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [showWhisper, setShowWhisper] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const mistakesRef = useRef(0);
  const awardedRef = useRef(false);

  // WORD_BANK_BUILD tile state
  const [placedTiles, setPlacedTiles] = useState<string[]>([]);

  const TIME_PER_Q = data?.timer || 15;
  const currentQ = questions[qIdx];
  const isLastQ = qIdx + 1 >= questions.length;
  const isWordBank = currentQ?.exerciseType === 'WORD_BANK_BUILD';

  // ── Ready beat → answering ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'ready' || !currentQ) return;
    const t = setTimeout(() => { setPhase('answering'); setTimeLeft(TIME_PER_Q); }, 700);
    return () => clearTimeout(t);
  }, [phase, qIdx, currentQ, TIME_PER_Q]);

  // ── Timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'answering') return;
    if (timeLeft <= 0) { handleTimeout(); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, phase]);

  // ── Class-whisper cue ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'answering') {
      setShowWhisper(true);
      const t = setTimeout(() => setShowWhisper(false), 3000);
      return () => clearTimeout(t);
    }
  }, [phase, qIdx]);

  // ── Auto-play audio for LISTEN_SELECT ────────────────────────────────
  useEffect(() => {
    if (phase === 'answering' && currentQ?.exerciseType === 'LISTEN_SELECT') {
      // Reference-based (2026-08-08): items may carry no stored audio_url —
      // playAudioUrl falls back to prompt_text via the cached TTS resolver.
      const c = (currentQ.item.content as any) || {};
      if (c.audio_url || c.prompt_text) playAudioUrl(c.audio_url, c.prompt_text).catch(() => {});
    }
  }, [phase, qIdx, currentQ]);

  // ── Remote handlers ──────────────────────────────────────────────────
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'REVEAL_ANSWER' && phase === 'answering') handleTimeout();
    else if ((a.type === 'NEXT_ROUND' || a.type === 'RESET_GAME') && phase === 'reveal') nextQuestion();
    else if (a.type === 'RESET_GAME' && phase === 'results') resetQuiz();
  }, [state.lastAction]);

  // ── Game-lifecycle: new turn (NEW_TURN) ──────────────────────────────
  const turnId = state.currentTurnId;
  useEffect(() => {
    if (turnId === null) return;
    mistakesRef.current = 0;
    awardedRef.current = false;
    setMistakes(0);
    setQIdx(0); setScore(0); setStreak(0); setSelectedTile(null); setPlacedTiles([]); setPhase('ready');
  }, [turnId]);

  // RULES OF HOOKS: all hooks above.
  if (loading || questions.length === 0) {
    return <div className="h-full flex flex-col items-center justify-center text-slate-400"><Zap size={48} className="text-red-500/30 mb-3" /><p className="font-display text-2xl font-bold">{loading ? 'Loading…' : 'No questions.'}</p></div>;
  }

  // ── Dual-write helper ────────────────────────────────────────────────
  const doDualWrite = useCallback((q: QuizQuestion, correctness: 'correct' | 'partial' | 'incorrect', points: number) => {
    const picked = state.quickWheelWinner;
    if (!picked) return;
    const student = (state.students || []).find((s: any) => s.id === picked);
    if (points !== 0) addPoints(picked, points);
    recordAttempt({
      rosterId: picked,
      classId: state.activeClassId,
      profileId: student?.claimed_profile_id ?? null,
      correctness,
      objectiveId: q.objectiveId,
      exerciseType: q.exerciseType,
      difficulty: q.difficulty,
    }).catch(() => {});
    // FSRS write
    if (unitId && !q.objectiveId.startsWith('frozen')) {
      const passed = correctness === 'correct' || correctness === 'partial';
      gradeObjective(picked, unitId, q.objectiveId, passed, 'receptive').catch(() => {});
    }
    // Remediation queue
    if (correctness === 'incorrect' || correctness === 'partial') {
      pushToRemediation(q.objectiveId, picked);
    }
  }, [state.quickWheelWinner, state.students, state.activeClassId, addPoints, unitId, pushToRemediation]);

  // ── Handle MCQ answer ────────────────────────────────────────────────
  function handleAnswer(tileIdx: number) {
    if (phase !== 'answering' || !currentQ || isWordBank) return;
    if (awardedRef.current) return;
    awardedRef.current = true;

    const isCorrect = tileIdx === (currentQ.item.content as any).correct_index;
    setSelectedTile(tileIdx);
    if (isCorrect) { setScore(s => s + 1); setStreak(s => s + 1); }
    else setStreak(0);

    const picked = state.quickWheelWinner;
    if (picked) {
      if (isCorrect) {
        const points = scoreForAttempt(0, currentQ.difficulty, 1.0);
        doDualWrite(currentQ, 'correct', points);
      } else {
        mistakesRef.current += 1;
        setMistakes(mistakesRef.current);
        doDualWrite(currentQ, 'incorrect', -MISTAKE_PENALTY);
      }
    }

    setPhase('reveal');
    setTimeout(() => nextQuestion(), 2500);
  }

  // ── Handle WORD_BANK_BUILD tile placement ────────────────────────────
  function handleTilePlace(word: string) {
    if (phase !== 'answering' || !isWordBank) return;
    setPlacedTiles(prev => [...prev, word]);
  }

  function handleTileRemove(idx: number) {
    if (phase !== 'answering' || !isWordBank) return;
    setPlacedTiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Handle timeout ───────────────────────────────────────────────────
  function handleTimeout() {
    if (awardedRef.current || !currentQ) return;
    awardedRef.current = true;

    const picked = state.quickWheelWinner;
    if (picked) {
      if (isWordBank) {
        // Score whatever was placed via LCS
        const targetSentence = (currentQ.item.content as any)?.target_sentence || '';
        const targetTiles = targetSentence.split(/\s+/).filter(Boolean);
        const strip = (s: string) => s.replace(/[.,!?;:]/g, '');
        const ratio = computeLCSPartialCredit(placedTiles.map(strip), targetTiles.map(strip));
        const correctness = ratio >= 1 ? 'correct' : ratio >= 0.5 ? 'partial' : 'incorrect';
        const points = scoreForAttempt(0, currentQ.difficulty, ratio);
        if (ratio >= 0.5) { setScore(s => s + 1); setStreak(s => s + 1); }
        else setStreak(0);
        doDualWrite(currentQ, correctness as any, points);
      } else {
        // MCQ timeout = wrong
        mistakesRef.current += 1;
        setMistakes(mistakesRef.current);
        setStreak(0);
        doDualWrite(currentQ, 'incorrect', -MISTAKE_PENALTY);
      }
    }

    setPhase('reveal');
    setTimeout(() => nextQuestion(), 2500);
  }

  // ── Next question / results ──────────────────────────────────────────
  function nextQuestion() {
    if (isLastQ) {
      setPhase('results');
      // Broadcast SLIDE_COMPLETE
      triggerAction('SLIDE_COMPLETE', { forced: false });
      return;
    }
    // Reset per-question scoring state. The awardedRef latch + mistake counter
    // are per-QUESTION, not per-turn — without this reset, Q2+ hit the
    // `if (awardedRef.current) return` guard in handleAnswer/handleTimeout and
    // silently no-op (audit F1, 2026-08-06). Only the turnId effect + resetQuiz
    // were clearing them, so every question after the first stopped scoring.
    awardedRef.current = false;
    mistakesRef.current = 0;
    setMistakes(0);
    setQIdx(i => i + 1);
    setSelectedTile(null);
    setPlacedTiles([]);
    setStreak(0);
    setPhase('ready');
  }

  function resetQuiz() {
    mistakesRef.current = 0;
    awardedRef.current = false;
    setMistakes(0);
    setQIdx(0); setScore(0); setStreak(0); setSelectedTile(null); setPlacedTiles([]); setPhase('ready');
  }

  // ── Render helpers ───────────────────────────────────────────────────
  const timerPct = timeLeft / TIME_PER_Q;
  const circ = 2 * Math.PI * 45;
  const dashOff = circ * (1 - timerPct);
  const timerColor = timeLeft <= 3 ? '#EF4444' : timeLeft <= 7 ? '#F97316' : '#22C55E';
  const streakTier = streak >= 10 ? 'mega' : streak >= 5 ? 'big' : streak >= 3 ? 'flame' : 'none';

  const getPromptText = (q: QuizQuestion) => {
    const c = q.item.content as any;
    switch (q.exerciseType) {
      case 'MEANING_MATCH': return `What does "${c.prompt}" mean?`;
      case 'SPELL_CLOZE': return c.sentence_with_blank || 'Fill in the blank:';
      case 'LISTEN_SELECT': return 'Listen and select the correct image:';
      case 'ERROR_SPOT': return `Find the error: "${c.sentence}"`;
      case 'STORY_COMPREHENSION': return c.prompt || 'Story question:';
      case 'WORD_BANK_BUILD': return `Build: "${c.target_sentence}"`;
      default: return 'Question:';
    }
  };

  const getPromptCn = (q: QuizQuestion) => {
    const c = q.item.content as any;
    switch (q.exerciseType) {
      case 'MEANING_MATCH': return `${c.prompt}是什么意思？`;
      case 'SPELL_CLOZE': return '填入正确的单词';
      case 'LISTEN_SELECT': return '听一听，选图片';
      case 'ERROR_SPOT': return '找出语法错误';
      case 'STORY_COMPREHENSION': return '故事理解题';
      case 'WORD_BANK_BUILD': return '用单词拼出句子';
      default: return '问题：';
    }
  };

  // ═══ RESULTS ═══
  if (phase === 'results') {
    const pct = Math.round((score / questions.length) * 100);
    const stars = pct >= 80 ? 3 : pct >= 50 ? 2 : 1;
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-rose-700 text-white p-6">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}>
          <Trophy size={72} className="text-yellow-300 drop-shadow-lg mb-3" />
        </motion.div>
        <h2 className="font-display text-5xl font-black mb-2">
          {pickedStudent ? `${pickedStudent.name}: Quiz Complete!` : 'Quiz Complete!'}
        </h2>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/20 backdrop-blur-md rounded-3xl px-10 py-5 border border-white/20 text-center mb-3">
          <div className="text-6xl font-black mb-1">{score}/{questions.length}</div>
          <div className="text-lg text-white/80">Correct · 正确率 {pct}%</div>
        </motion.div>
        <div className="text-4xl mb-3">{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
        {pct < 50 && <p className="text-white/70 text-lg mb-3">You tried your best today! 今天你尽力了！</p>}
        <button onClick={resetQuiz} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-full font-bold text-white transition-colors">Try Again</button>
      </div>
    );
  }

  if (!currentQ) return null;

  // ═══ READY BEAT ═══
  if (phase === 'ready') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center">
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="text-center">
          <p className="font-display text-2xl text-slate-400 mb-1">Question {qIdx + 1} of {questions.length}</p>
          <p className="font-display text-6xl font-black text-red-400">Ready?</p>
          <p className="font-cn text-2xl text-slate-500 mt-1">准备好了吗？</p>
        </motion.div>
      </motion.div>
    );
  }

  // ═══ ANSWERING + REVEAL ═══
  const content = currentQ.item.content as any;
  const isListenSelect = currentQ.exerciseType === 'LISTEN_SELECT';

  return (
    <div className="h-full flex flex-col items-center justify-start p-4 pt-5 relative overflow-hidden">
      {/* Top bar: score + streak */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
          <span className="text-xs text-slate-400 font-bold">Q{qIdx + 1}/{questions.length}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-green-400 font-bold">{score} correct</span>
        </div>
        <AnimatePresence>
          {streak >= 1 && (
            <motion.div initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1">
              {streak >= 3 && <Flame size={streak >= 5 ? 22 : 18} className="text-orange-400" />}
              <span className={`font-display font-black tabular-nums ${streak >= 5 ? 'text-2xl text-orange-400' : 'text-lg text-amber-400'}`}>{streak}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Timer ring */}
      <div className="relative mb-2" style={{ width: 100, height: 100 }}>
        <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={timerColor} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={dashOff}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span animate={timeLeft <= 3 && phase === 'answering' ? { scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.5, repeat: timeLeft <= 3 ? Infinity : 0 }}
            className="font-display text-4xl font-black tabular-nums" style={{ color: timerColor }}>
            {String(timeLeft).padStart(2, '0')}
          </motion.span>
        </div>
      </div>

      {/* Question prompt */}
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl font-bold text-slate-200 mb-1 text-center">
        {getPromptText(currentQ)}
      </motion.p>
      <p className="font-cn text-lg text-slate-400/60 mb-3">{getPromptCn(currentQ)}</p>

      {/* Audio play button for LISTEN_SELECT */}
      {isListenSelect && phase === 'answering' && (content.audio_url || content.prompt_text) && (
        <button onClick={() => playAudioUrl(content.audio_url, content.prompt_text).catch(() => {})} className="mb-2 flex items-center gap-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 rounded-full px-4 py-2">
          <Volume2 size={20} className="text-blue-300" />
          <span className="font-display text-sm font-bold text-blue-200">Tap to replay</span>
        </button>
      )}

      {/* Buzz prompt */}
      {phase === 'answering' && !isWordBank && (
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="mb-2">
          <span className="font-display text-base font-bold text-red-400 uppercase tracking-widest">🔔 Buzz! Tap to answer</span>
        </motion.div>
      )}

      {/* WORD_BANK_BUILD: tile assembly UI */}
      {isWordBank && phase === 'answering' && (
        <div className="w-full max-w-2xl mb-3">
          {/* Drop zone */}
          <div className="min-h-[80px] bg-slate-800/50 rounded-2xl border-4 border-dashed border-slate-700 flex flex-wrap items-center justify-center p-4 gap-3 mb-4">
            {placedTiles.length === 0 && (
              <div className="text-slate-600 font-bold text-lg uppercase tracking-widest">Tap words to place here</div>
            )}
            {placedTiles.map((word, i) => (
              <button key={i} onClick={() => handleTileRemove(i)} className="bg-white text-slate-900 text-2xl font-bold px-6 py-3 rounded-xl shadow-lg hover:bg-red-50 hover:text-red-500 transition-all">
                {word}
              </button>
            ))}
          </div>
          {/* Word bank */}
          <div className="flex flex-wrap justify-center gap-3">
            {(content.word_bank || []).map((word: string, i: number) => {
              const usedCount = placedTiles.filter(w => w === word).length;
              const totalCount = (content.word_bank || []).filter((w: string) => w === word).length;
              const isUsed = usedCount >= totalCount;
              return (
                <button key={i} onClick={() => !isUsed && handleTilePlace(word)} disabled={isUsed || phase !== 'answering'}
                  className={`text-2xl font-bold px-6 py-3 rounded-xl shadow-[0_4px_0_0_#0b5cb5] transition-all ${isUsed ? 'bg-slate-700 text-slate-500 opacity-50' : 'bg-blue-500 hover:bg-blue-400 text-white'}`}>
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* MCQ answer tiles (non-WORD_BANK_BUILD) */}
      {!isWordBank && content.options && (
        <div className="grid grid-cols-2 gap-3">
          {content.options.map((opt: any, i: number) => {
            const isCorrect = i === content.correct_index;
            const isSelected = selectedTile === i;
            const shape = SHAPES[i % 4];
            const optText = isListenSelect ? opt?.label || opt?.image_url : opt;
            return (
              <motion.button key={i} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                onClick={() => handleAnswer(i)} disabled={phase !== 'answering'}
                className={`w-[200px] h-[70px] rounded-xl flex items-center justify-center gap-3 px-4 transition-all ${
                  phase === 'reveal' && isCorrect ? 'bg-green-500/20 border-2 border-green-400 scale-105 shadow-[0_0_20px_rgba(34,197,94,.4)]' :
                  phase === 'reveal' && isSelected ? 'bg-red-500/10 border-2 border-red-400 opacity-70' :
                  `${shape.bg} text-white hover:scale-105`
                }`}>
                <span className="text-xl">{shape.sym}</span>
                {isListenSelect && opt?.image_url ? (
                  <img src={opt.image_url} alt="" className="w-12 h-12 object-contain" />
                ) : (
                  <span className="font-display text-lg font-bold">{optText}</span>
                )}
                {phase === 'reveal' && isCorrect && <Check size={20} className="text-green-400" strokeWidth={4} />}
                {phase === 'reveal' && isSelected && !isCorrect && <X size={20} className="text-red-400" strokeWidth={4} />}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Reveal feedback */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-center max-w-md">
            <p className="font-display text-xl font-bold">
              {selectedTile === content.correct_index || (isWordBank && placedTiles.length > 0) ? (
                <span className="text-green-400">✓ Correct!</span>
              ) : (
                <span className="text-slate-300">Answer: {currentQ.correctAnswer || content.target_sentence}</span>
              )}
            </p>
            {streakTier !== 'none' && (
              <p className="text-sm font-bold text-orange-400 mt-1">{streakTier === 'mega' ? '🔥 INCREDIBLE!' : streakTier === 'big' ? '🔥 Amazing!' : '🔥 Streak!'}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Class-whisper cue */}
      <AnimatePresence>
        {showWhisper && phase === 'answering' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
            <span className="text-sm">🤫</span>
            <span className="font-display text-xs font-bold text-slate-300">Whisper your answer!</span>
            <span className="font-cn text-xs text-slate-400/60">小声说答案</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BoardSpeedQuiz;
