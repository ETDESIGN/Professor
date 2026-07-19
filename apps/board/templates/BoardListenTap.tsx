// BoardListenTap — Listen & Tap recognition drill (PRACTICE phase).
// REBUILT FROM CLAUDE'S DESIGN DOC (listen-and-tap-screen.md), not the HTML.
//
// State machine: LISTEN → OPTIONS → FEEDBACK → PREVIEW → next round
// Key design principles (from the doc):
//   1. "Listen!" phase BEFORE options appear (hear it, then discriminate).
//   2. Tiles have per-position colors (coral/teal/gold/violet) — not per-correctness.
//   3. Labels appear ONLY after the tap resolves (pure image recognition pre-answer).
//   4. Correct = localized celebration; wrong = gentle shake + correct reveal.
//   5. Streak tiers: x3 🔥, x5 bigger burst, x10+ full celebration.
//   6. Class-whisper cue ("全班：小声说答案！") engages non-turn students.
//   7. "Next: [name]" preview after feedback.
//   8. Bilingual: English only during guess; English+Chinese after resolution.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, X, Flame, ChevronRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { gradeStudent } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';
import { toPoolItem } from '../../../types/exercise';

type Phase = 'listen' | 'options' | 'feedback' | 'preview';

// Per-position tile colors (NOT per-correctness — from design doc B2).
const TILE_COLORS = [
  { bg: 'bg-[#FF6B6B]', border: 'border-[#FF6B6B]', text: 'text-[#FF6B6B]' },     // coral
  { bg: 'bg-[#4ECDC4]', border: 'border-[#4ECDC4]', text: 'text-[#4ECDC4]' },     // teal
  { bg: 'bg-[#FFD93D]', border: 'border-[#FFD93D]', text: 'text-[#FFD93D]' },     // gold
  { bg: 'bg-[#A78BFA]', border: 'border-[#A78BFA]', text: 'text-[#A78BFA]' },     // violet
];

const BoardListenTap = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  // Pool items (class-weak first).
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['LISTEN_SELECT'], classWeak: true, roster, limit: 10 });

  // Frozen fallback (from flow block data).
  const frozenOptions = useMemo(() => (Array.isArray(data?.options) ? data.options : []), [data?.options]);

  // ── State ──────────────────────────────────────────────────────────────
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('listen');
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [maxStreak] = useState(0);
  const [showWhisper, setShowWhisper] = useState(false);
  const whisperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current item (from pool or frozen).
  const poolItem = poolItems[round % Math.max(1, poolItems.length)];
  const usingPool = frozenOptions.length === 0 && !!poolItem;

  const currentItem = useMemo(() => {
    if (frozenOptions.length > 0) {
      return {
        audioUrl: data?.audioUrl,
        promptText: data?.targetWord || '',
        options: frozenOptions.map((o: any, i: number) => ({
          image: o.img || '', label: o.label || '', correct: o.correct,
        })),
      };
    }
    if (!poolItem) return null;
    const c = poolItem.content as any;
    return {
      audioUrl: c?.audio_url,
      promptText: c?.options?.[c.correct_index]?.text || c?.prompt_text || '',
      options: (c?.options || []).map((o: any, i: number) => ({
        image: o?.image_url || '', label: o?.text || o?.label || '', correct: i === c.correct_index,
      })),
    };
  }, [frozenOptions, data, poolItem]);

  const correctIndex = useMemo(() => currentItem?.options.findIndex((o: any) => o.correct) ?? -1, [currentItem]);

  // ── Remote controls ────────────────────────────────────────────────────
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    if (action.type === 'RESET_GAME' || action.type === 'NEXT_ROUND') {
      advanceRound();
    } else if (action.type === 'REVEAL_ANSWER' || action.type === 'SHOW_OPTIONS') {
      if (phase === 'listen') showOptions();
    } else if (action.type === 'PLAY_AUDIO') {
      playAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  // ── Auto-play audio on new round (Listen phase) ────────────────────────
  useEffect(() => {
    if (phase === 'listen' && currentItem) {
      const t = setTimeout(() => playAudio(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deits
  }, [phase, round, currentItem]);

  // ── Auto-show options after audio (2.5s after listen starts) ───────────
  useEffect(() => {
    if (phase === 'listen' && currentItem) {
      const t = setTimeout(() => { if (phase === 'listen') showOptions(); }, 3000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line
  }, [phase, round]);

  // ── Class-whisper cue (fades in when options appear, out after 3s) ─────
  useEffect(() => {
    if (phase === 'options') {
      setShowWhisper(true);
      whisperTimer.current = setTimeout(() => setShowWhisper(false), 3000);
      return () => { if (whisperTimer.current) clearTimeout(whisperTimer.current); };
    }
  }, [phase, round]);

  // ── Actions ────────────────────────────────────────────────────────────
  const playAudio = useCallback(() => {
    if (currentItem?.audioUrl || currentItem?.promptText) {
      playAudioUrl(currentItem.audioUrl, currentItem.promptText);
    }
  }, [currentItem]);

  const showOptions = useCallback(() => {
    setPhase('options');
  }, []);

  const handleTap = useCallback((index: number) => {
    if (phase !== 'options' || !currentItem) return;
    setSelectedTile(index);
    const isCorrect = index === correctIndex;

    if (isCorrect) {
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }

    // Per-student capture (if a student is picked).
    const selected = state.quickWheelWinner;
    if (selected && unitId && currentItem.promptText) {
      gradeStudent(selected, unitId, currentItem.promptText, isCorrect).catch(() => {});
    }

    setPhase('feedback');
    // Auto-advance to preview after 2.5s.
    setTimeout(() => setPhase('preview'), 2500);
  }, [phase, currentItem, correctIndex, state.quickWheelWinner, unitId]);

  const advanceRound = useCallback(() => {
    setSelectedTile(null);
    setPhase('listen');
    setRound(r => r + 1);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────
  const nextStudent = useMemo(() => {
    const remaining = state.students.filter(s => !state.turnsThisExercise?.includes(s.id));
    return (remaining[0] || state.students[0])?.name || '';
  }, [state.students, state.turnsThisExercise]);

  const streakTier = streak >= 10 ? 'mega' : streak >= 5 ? 'big' : streak >= 3 ? 'flame' : 'none';

  // ── RULES OF HOOKS: all hooks above, returns below ─────────────────────
  if (loading || !currentItem) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <Volume2 size={48} className="text-green-500/30 mb-3" />
        <p className="font-display text-2xl font-bold">{loading ? 'Loading…' : 'No listening items.'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Streak counter (top-right, persistent during round) */}
      <AnimatePresence>
        {streak >= 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute top-3 right-4 flex items-center gap-1.5 z-20"
          >
            {streak >= 3 && <Flame size={streak >= 10 ? 32 : streak >= 5 ? 26 : 20} className={streak >= 5 ? 'text-orange-400' : 'text-amber-400'} />}
            <span className={`font-display font-black tabular-nums ${streak >= 10 ? 'text-4xl text-orange-300' : streak >= 5 ? 'text-3xl text-orange-400' : 'text-2xl text-amber-400'}`}>
              {streak}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round counter (top-left) */}
      <div className="absolute top-3 left-4 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 z-20">
        <span className="text-sm text-slate-400 font-bold">Round {round + 1}</span>
      </div>

      {/* ═══ LISTEN PHASE ═══ */}
      <AnimatePresence mode="wait">
        {phase === 'listen' && (
          <motion.div key="listen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex flex-col items-center">
            {/* Pulsing speaker with concentric ripple rings */}
            <button onClick={playAudio} className="relative flex items-center justify-center mb-6" style={{ width: 200, height: 200 }}>
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border-2 border-green-400"
                  style={{ width: 100 + i * 45, height: 100 + i * 45 }}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
                />
              ))}
              <div className="relative w-[120px] h-[120px] rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,.4)]">
                <Volume2 size={56} className="text-green-400" />
              </div>
            </button>
            <p className="font-display text-4xl font-bold text-green-300">Listen!</p>
            <p className="font-cn text-2xl text-slate-400/60 mt-1">听！</p>
          </motion.div>
        )}

        {/* ═══ OPTIONS + FEEDBACK PHASE ═══ */}
        {(phase === 'options' || phase === 'feedback') && (
          <motion.div key="options" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full">
            {/* Instruction */}
            <p className="font-display text-2xl font-bold text-green-300 mb-1">
              {phase === 'feedback' && selectedTile === correctIndex ? 'Yes! 太棒了!' : phase === 'feedback' ? `The answer is: ${currentItem.options[correctIndex]?.label}` : 'Tap the answer!'}
            </p>

            {/* Tiles */}
            <div className={`flex items-stretch gap-4 ${currentItem.options.length === 2 ? '' : 'flex-wrap justify-center'}`}>
              {currentItem.options.map((opt: any, i: number) => {
                const isCorrect = i === correctIndex;
                const isSelected = selectedTile === i;
                const color = TILE_COLORS[i % TILE_COLORS.length];
                const showResult = phase === 'feedback';

                return (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    onClick={() => handleTap(i)}
                    disabled={phase !== 'options'}
                    className={`group relative rounded-2xl border-2 w-[160px] h-[200px] flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                      showResult && isCorrect ? 'border-green-400 bg-green-500/20 scale-110 shadow-[0_0_30px_rgba(34,197,94,.5)]' :
                      showResult && isSelected && !isCorrect ? 'border-red-400 bg-red-500/10' :
                      `${color.border} bg-white/5 hover:scale-105 hover:shadow-lg`
                    } ${phase === 'options' ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Image (visible during options + feedback) */}
                    {opt.image && String(opt.image).startsWith('http') ? (
                      <img src={opt.image} alt="" className="w-24 h-24 object-contain drop-shadow-lg" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
                    ) : (
                      <span className="text-6xl">{opt.label?.charAt(0).toUpperCase() || '?'}</span>
                    )}

                    {/* Label — appears ONLY after tap resolves (design doc B2) */}
                    {showResult && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
                        <div className="font-display text-lg font-bold text-white">{opt.label}</div>
                      </motion.div>
                    )}

                    {/* Result icons */}
                    {showResult && isCorrect && <Check size={24} className="absolute top-2 right-2 text-green-400" strokeWidth={4} />}
                    {showResult && isSelected && !isCorrect && <X size={24} className="absolute top-2 right-2 text-red-400" strokeWidth={4} />}

                    {/* Wrong tile shake */}
                    {showResult && isSelected && !isCorrect && (
                      <motion.div className="absolute inset-0 rounded-2xl border-2 border-red-400" animate={{ x: [-4, 4, -4, 4, 0] }} transition={{ duration: 0.3 }} />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Feedback extras (after resolution) */}
            {phase === 'feedback' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center">
                {selectedTile === correctIndex ? (
                  <p className="font-display text-xl text-green-300">
                    {streakTier === 'mega' ? '🔥 INCREDIBLE STREAK! 太厉害了!' : streakTier === 'big' ? '🔥 Amazing! 太棒了!' : 'Correct!'}
                  </p>
                ) : (
                  <p className="font-display text-lg text-slate-400">
                    {currentItem.options[correctIndex]?.label} {currentItem.options[correctIndex]?.image ? '' : `· ${currentItem.promptText}`}
                  </p>
                )}
              </motion.div>
            )}

            {/* Class-whisper cue (fades in/out) */}
            <AnimatePresence>
              {showWhisper && phase === 'options' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-4 flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"
                >
                  <span className="text-sm">🤫</span>
                  <span className="font-display text-sm font-bold text-slate-300">Class: whisper your answer!</span>
                  <span className="font-cn text-xs text-slate-400/60">全班：小声说答案！</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══ PREVIEW PHASE ═══ */}
        {phase === 'preview' && (
          <motion.div key="preview" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center">
            <div className="text-5xl mb-3">{selectedTile === correctIndex ? '✅' : '📚'}</div>
            <p className="font-display text-2xl font-bold text-slate-300 mb-2">
              {selectedTile === correctIndex ? 'Well done!' : 'Good try!'}
            </p>
            {nextStudent && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-5 py-2">
                <span className="text-sm text-slate-400">Next:</span>
                <span className="font-display text-lg font-bold text-green-300">{nextStudent}</span>
              </div>
            )}
            <button
              onClick={advanceRound}
              className="mt-4 flex items-center gap-2 bg-green-500 text-white px-6 py-3 rounded-2xl font-bold text-lg active:scale-95 shadow-lg"
            >
              Next Round <ChevronRight size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom hint */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-slate-500/40">
        {usingPool ? `Pool item ${round + 1}/${poolItems.length}` : 'Frozen data'}
      </div>
    </div>
  );
};

export default BoardListenTap;
