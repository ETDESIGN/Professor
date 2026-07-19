// BoardSpeedQuiz — timed assessment (ASSESS phase).
// REBUILT FROM CLAUDE'S DESIGN DOC (speed-quiz-screen.md).
// State machine: READY → ANSWERING → REVEAL → (next Q or RESULTS)
// Key additions vs old impl: remote handlers, Ready beat, shaped tiles,
// Buzz prompt, explanation after reveal, streak counter, class-whisper.

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Trophy, Check, X, Flame, Star } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { gradeStudent } from '../../../services/boardLearner';
import { getVocabulary } from '../../../services/manifest';

type Phase = 'ready' | 'answering' | 'reveal' | 'results';

// Shaped tiles (reused from Team Battle for ASSESS-phase consistency).
const SHAPES = [
  { bg: 'bg-rose-500', sym: '▲' },
  { bg: 'bg-blue-500', sym: '◆' },
  { bg: 'bg-amber-400 text-slate-900', sym: '●' },
  { bg: 'bg-green-500', sym: '■' },
];

const BoardSpeedQuiz = ({ data }: { data: any }) => {
  const { state } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  const frozenQs = useMemo(() => (Array.isArray(data?.questions) ? data.questions : []), [data?.questions]);
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['MEANING_MATCH'], classWeak: true, roster, limit: 10 });

  // Vocab lookup for explanations.
  const vocabMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of getVocabulary(state.activeUnit?.manifest)) if (v.word) m.set(v.word.toLowerCase(), v);
    return m;
  }, [state.activeUnit?.manifest]);

  const questions = useMemo(() => {
    if (frozenQs.length > 0) return frozenQs;
    return poolItems.map(it => {
      const c: any = it.content;
      const correct = c?.options?.[c.correct_index];
      return { word: c?.prompt, text: `What does "${c?.prompt}" mean?`, cn: `${c?.prompt}是什么意思？`, options: c?.options || [], correctIdx: c.correct_index, correct };
    }).filter(q => q.options.length > 1);
  }, [frozenQs, poolItems]);

  const totalQ = questions.length;

  // ── State ──
  const [phase, setPhase] = useState<Phase>('ready');
  const [qIdx, setQIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [showWhisper, setShowWhisper] = useState(false);

  const TIME_PER_Q = data?.timer || 15;
  const currentQ = questions[qIdx];
  const isLastQ = qIdx + 1 >= totalQ;

  // ── Ready beat → answering ──
  useEffect(() => {
    if (phase !== 'ready' || !currentQ) return;
    const t = setTimeout(() => { setPhase('answering'); setTimeLeft(TIME_PER_Q); }, 700);
    return () => clearTimeout(t);
  }, [phase, qIdx, currentQ, TIME_PER_Q]);

  // ── Timer ──
  useEffect(() => {
    if (phase !== 'answering') return;
    if (timeLeft <= 0) { handleAnswer(-1); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [timeLeft, phase]);

  // ── Class-whisper cue ──
  useEffect(() => {
    if (phase === 'answering') {
      setShowWhisper(true);
      const t = setTimeout(() => setShowWhisper(false), 3000);
      return () => clearTimeout(t);
    }
  }, [phase, qIdx]);

  // ── Remote handlers (CRITICAL — was missing) ──
  useEffect(() => {
    const a = state.lastAction;
    if (!a) return;
    if (a.type === 'REVEAL_ANSWER' && phase === 'answering') handleAnswer(-1);
    else if ((a.type === 'NEXT_ROUND' || a.type === 'RESET_GAME') && phase === 'reveal') nextQuestion();
    else if (a.type === 'RESET_GAME' && phase === 'results') resetQuiz();
    // eslint-disable-next-line
  }, [state.lastAction]);

  // RULES OF HOOKS: all hooks above.
  if (loading || totalQ === 0) {
    return <div className="h-full flex flex-col items-center justify-center text-slate-400"><Zap size={48} className="text-red-500/30 mb-3" /><p className="font-display text-2xl font-bold">{loading ? 'Loading…' : 'No questions.'}</p></div>;
  }

  // ── Actions ──
  function handleAnswer(tileIdx: number) {
    if (phase !== 'answering') return;
    const isCorrect = tileIdx === currentQ.correctIdx;
    setSelectedTile(tileIdx);
    if (isCorrect) { setScore(s => s + 1); setStreak(s => s + 1); }
    else setStreak(0);

    // Per-student capture.
    const picked = state.quickWheelWinner;
    if (picked && unitId && currentQ.word) gradeStudent(picked, unitId, currentQ.word, isCorrect).catch(() => {});

    setPhase('reveal');
    // Auto-advance after 2.5s (teacher can narrate the explanation).
    setTimeout(() => nextQuestion(), 2500);
  }

  function nextQuestion() {
    if (isLastQ) { setPhase('results'); return; }
    setQIdx(i => i + 1);
    setSelectedTile(null);
    setStreak(0);
    setPhase('ready');
  }

  function resetQuiz() {
    setQIdx(0); setScore(0); setStreak(0); setSelectedTile(null); setPhase('ready');
  }

  // Timer ring values.
  const timerPct = timeLeft / TIME_PER_Q;
  const circ = 2 * Math.PI * 45;
  const dashOff = circ * (1 - timerPct);
  const timerColor = timeLeft <= 3 ? '#EF4444' : timeLeft <= 7 ? '#F97316' : '#22C55E';
  const streakTier = streak >= 10 ? 'mega' : streak >= 5 ? 'big' : streak >= 3 ? 'flame' : 'none';

  // Explanation for the reveal (from vocab manifest).
  const explanation = currentQ?.word ? (vocabMap.get(currentQ.word.toLowerCase())?.definition || '') : '';

  // ═══ RESULTS ═══
  if (phase === 'results') {
    const pct = Math.round((score / totalQ) * 100);
    const stars = pct >= 80 ? 3 : pct >= 50 ? 2 : 1;
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-rose-700 text-white p-6">
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}>
          <Trophy size={72} className="text-yellow-300 drop-shadow-lg mb-3" />
        </motion.div>
        <h2 className="font-display text-5xl font-black mb-2">Quiz Complete!</h2>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white/20 backdrop-blur-md rounded-3xl px-10 py-5 border border-white/20 text-center mb-3">
          <div className="text-6xl font-black mb-1">{score}/{totalQ}</div>
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
          <p className="font-display text-2xl text-slate-400 mb-1">Question {qIdx + 1} of {totalQ}</p>
          <p className="font-display text-6xl font-black text-red-400">Ready?</p>
          <p className="font-cn text-2xl text-slate-500 mt-1">准备好了吗？</p>
        </motion.div>
      </motion.div>
    );
  }

  // ═══ ANSWERING + REVEAL ═══
  return (
    <div className="h-full flex flex-col items-center justify-start p-4 pt-5 relative overflow-hidden">
      {/* Top bar: score + streak */}
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
          <span className="text-xs text-slate-400 font-bold">Q{qIdx + 1}/{totalQ}</span>
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
            strokeDasharray={circ} strokeDashoffset={phase === 'reveal' ? dashOff : dashOff}
            style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span animate={timeLeft <= 3 && phase === 'answering' ? { scale: [1, 1.15, 1] } : {}} transition={{ duration: 0.5, repeat: timeLeft <= 3 ? Infinity : 0 }}
            className="font-display text-4xl font-black tabular-nums" style={{ color: timerColor }}>
            {String(timeLeft).padStart(2, '0')}
          </motion.span>
        </div>
      </div>

      {/* Question */}
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl font-bold text-slate-200 mb-1 text-center">
        {currentQ.text}
      </motion.p>
      <p className="font-cn text-lg text-slate-400/60 mb-3">{currentQ.cn}</p>

      {/* Buzz prompt */}
      {phase === 'answering' && (
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="mb-2">
          <span className="font-display text-base font-bold text-red-400 uppercase tracking-widest">🔔 Buzz! Tap to answer</span>
        </motion.div>
      )}

      {/* Answer tiles (shaped) */}
      <div className="grid grid-cols-2 gap-3">
        {currentQ.options.map((opt: string, i: number) => {
          const isCorrect = i === currentQ.correctIdx;
          const isSelected = selectedTile === i;
          const shape = SHAPES[i % 4];
          return (
            <motion.button key={i} initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              onClick={() => handleAnswer(i)} disabled={phase !== 'answering'}
              className={`w-[200px] h-[70px] rounded-xl flex items-center justify-center gap-3 px-4 transition-all ${
                phase === 'reveal' && isCorrect ? 'bg-green-500/20 border-2 border-green-400 scale-105 shadow-[0_0_20px_rgba(34,197,94,.4)]' :
                phase === 'reveal' && isSelected ? 'bg-red-500/10 border-2 border-red-400 opacity-70' :
                `${shape.bg} text-white hover:scale-105`
              }`}>
              <span className="text-xl">{shape.sym}</span>
              <span className="font-display text-lg font-bold">{opt}</span>
              {phase === 'reveal' && isCorrect && <Check size={20} className="text-green-400" strokeWidth={4} />}
              {phase === 'reveal' && isSelected && !isCorrect && <X size={20} className="text-red-400" strokeWidth={4} />}
            </motion.button>
          );
        })}
      </div>

      {/* Reveal feedback: answer + explanation */}
      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-center max-w-md">
            <p className="font-display text-xl font-bold">
              {selectedTile === currentQ.correctIdx ? <span className="text-green-400">✓ Correct!</span> : <span className="text-slate-300">Answer: {currentQ.word} = {currentQ.correct}</span>}
            </p>
            {explanation && <p className="text-sm text-slate-400 mt-1">{explanation}</p>}
            {streakTier !== 'none' && streak === currentQ.correctIdx + 1 && (
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
