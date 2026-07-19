// BoardListenTap — Listen & Tap recognition drill (PRACTICE phase).
// Redesigned from Hermes prototype 04-listen-tap.html.
// Big pulsing speaker + 4 large tappable tiles (emoji + word) + green theme.

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Check, X, RefreshCcw, ChevronRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';
import { gradeStudent } from '../../../services/boardLearner';
import { playAudioUrl } from '../../../services/SpeechService';

interface ListenOption { id: number; img: string; label: string; correct: boolean; }

const BoardListenTap = ({ data }: { data: any }) => {
  const { state, triggerAction, gradeStudent: grade } = useSession();
  const unitId = state.activeUnit?.id || '';
  const roster = useMemo(() => (state.students || []).map((s: any) => s.id), [state.students]);

  const frozenOptions: ListenOption[] = useMemo(() => (Array.isArray(data?.options) ? data.options : []), [data?.options]);
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['LISTEN_SELECT'], classWeak: true, roster, limit: 8 });

  const [round, setRound] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const frozen = frozenOptions.length > 0;
  const poolItem = poolItems[round % Math.max(1, poolItems.length)];
  const usingPool = !frozen && !!poolItem;

  const options: ListenOption[] = useMemo(() => {
    if (frozen) return frozenOptions;
    if (!poolItem) return [];
    const c: any = poolItem.content;
    return (c?.options || []).map((o: any, i: number) => ({
      id: i, img: o?.image_url || '', label: o?.text || o?.label || '', correct: i === c.correct_index,
    }));
  }, [frozen, frozenOptions, poolItem]);

  const targetWord = (() => {
    if (!usingPool) return data?.targetWord || '';
    const c = poolItem!.content as any;
    const co = c?.options?.[c.correct_index];
    return co?.text || co?.label || c?.prompt_text || '';
  })();

  const audioUrl = usingPool ? (poolItem!.content as any)?.audio_url : data?.audioUrl;

  // RULES OF HOOKS: effect before any return.
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
      setSelectedId(null); setIsCorrect(null);
      if (usingPool) setRound(r => r + 1);
    }
  }, [state.lastAction, usingPool]);

  const playTarget = () => {
    if (audioUrl || targetWord) playAudioUrl(audioUrl, targetWord);
  };

  // Auto-play audio on new round.
  useEffect(() => { if (options.length > 0) setTimeout(playTarget, 400); /* eslint-disable-next-line */ }, [round, options.length]);

  const handleTap = async (option: ListenOption) => {
    if (isCorrect !== null) return;
    setSelectedId(option.id);
    if (option.correct) { setIsCorrect(true); }
    else { setIsCorrect(false); setTimeout(() => { setSelectedId(null); setIsCorrect(null); }, 1200); }
    const selected = state.quickWheelWinner;
    if (selected && unitId && targetWord) {
      try { if (grade) await grade(selected, targetWord, option.correct); else await gradeStudent(selected, unitId, targetWord, option.correct); } catch { /* non-fatal */ }
    }
  };

  if (loading || options.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <p className="font-display text-3xl font-bold">Listen &amp; Tap</p>
        <p className="text-lg mt-2">{loading ? 'Loading…' : 'No listening items.'}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-start p-8 pt-10">
      {/* Big pulsing speaker with concentric rings */}
      <button onClick={playTarget} className="relative flex items-center justify-center mb-6 group" style={{ width: 200, height: 200 }}>
        {/* Concentric rings */}
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2 border-green-500"
            style={{ width: 100 + i * 40, height: 100 + i * 40 }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
        {/* Speaker core */}
        <div className="relative w-[120px] h-[120px] rounded-full bg-green-500/15 border-2 border-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,.4)] group-hover:scale-110 transition-transform">
          <Volume2 size={56} className="text-green-400" />
        </div>
      </button>

      {/* Instruction */}
      <div className="text-center mb-8">
        <p className="font-display text-3xl font-bold text-green-300 mb-1">Listen and tap the correct word</p>
        <p className="font-cn text-xl text-slate-400/60">听一听，点出正确的单词</p>
      </div>

      {/* Answer tiles */}
      <div className="flex items-stretch gap-6">
        {options.map((opt, i) => {
          const isSelected = selectedId === opt.id;
          const showCorrect = isCorrect && opt.correct;
          const showWrong = isSelected && isCorrect === false;
          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
              onClick={() => handleTap(opt)}
              disabled={isCorrect !== null}
              className={`group w-[170px] h-[230px] rounded-3xl border-2 flex flex-col items-center justify-center gap-3 transition-all duration-200 ${
                showCorrect ? 'border-green-400 bg-green-500/20 scale-110 shadow-[0_0_30px_rgba(34,197,94,.5)]' :
                showWrong ? 'border-red-400 bg-red-500/15 animate-shake' :
                'border-white/10 bg-white/5 hover:border-green-400 hover:bg-green-500/10 hover:scale-105'
              }`}
            >
              {opt.img && String(opt.img).startsWith('http') ? (
                <img src={opt.img} alt={opt.label} className="w-24 h-24 object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')} />
              ) : (
                <span className="text-7xl leading-none group-hover:scale-110 transition-transform">{opt.label?.charAt(0).toUpperCase() || '?'}</span>
              )}
              <span className="font-display text-2xl font-bold">{opt.label}</span>
              {showCorrect && <Check size={28} className="text-green-400 absolute top-3 right-3" strokeWidth={4} />}
              {showWrong && <X size={28} className="text-red-400 absolute top-3 right-3" strokeWidth={4} />}
            </motion.button>
          );
        })}
      </div>

      {/* Correct celebration */}
      <AnimatePresence>
        {isCorrect && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="mt-6 flex items-center gap-3 bg-green-500/20 border border-green-400/40 rounded-2xl px-8 py-4"
          >
            <Check size={32} className="text-green-400" strokeWidth={4} />
            <span className="font-display text-3xl font-bold text-green-300">Correct! 🎉</span>
            <span className="font-cn text-xl text-green-400/60">正确！</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next round hint */}
      <div className="absolute bottom-4 right-6 flex items-center gap-2 text-slate-400/40">
        <span className="text-sm font-display">{usingPool ? `Round ${round + 1}` : ''}</span>
        <button onClick={() => triggerAction('RESET_GAME')} className="flex items-center gap-1 text-xs hover:text-green-400">
          <RefreshCcw size={14} /> {usingPool && 'Next word'}
        </button>
      </div>
    </div>
  );
};

export default BoardListenTap;
