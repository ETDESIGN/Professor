
import React, { useState, useEffect, useMemo } from 'react';
import { Check, RefreshCcw, ArrowRight } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';
import { useBoardPool } from '../useBoardPool';

interface Word {
  id: string;
  text: string;
}

const shuffle = <T,>(a: T[]): T[] => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const BoardUnscramble = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();
  const unitId = state.activeUnit?.id || '';

  // Pool fallback (WORD_BANK_BUILD): target_sentence + word_bank. Stable refs via
  // useMemo so the reset effect (keyed on primitives) can't loop.
  const frozenWords: string[] = useMemo(() => (Array.isArray(data?.words) ? data.words : []), [data?.words]);
  const { items: poolItems, loading } = useBoardPool({ unitId, exerciseTypes: ['WORD_BANK_BUILD'], limit: 8 });

  const [round, setRound] = useState(0);
  const poolItem = poolItems[round % Math.max(1, poolItems.length)];
  const usingPool = frozenWords.length === 0 && !!poolItem;

  const target = (usingPool ? (poolItem!.content as any)?.target_sentence : data?.targetSentence) || '';
  const bankWords: string[] = usingPool ? (poolItem!.content as any)?.word_bank || [] : frozenWords;

  const [scrambledWords, setScrambledWords] = useState<Word[]>([]);
  const [placedWords, setPlacedWords] = useState<Word[]>([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isWrong, setIsWrong] = useState(false);

  // (Re)build the board when the active item changes (frozen sync OR pool round).
  // Keyed on a stable primitive signature to avoid a render loop.
  const sig = `${usingPool ? poolItem?.id : 'frozen'}-${round}`;
  useEffect(() => {
    setScrambledWords(shuffle(bankWords).map((w, i) => ({ id: `w-${i}`, text: w })));
    setPlacedWords([]);
    setIsCorrect(false);
    setIsWrong(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
      setScrambledWords(shuffle(bankWords).map((w, i) => ({ id: `w-${i}`, text: w })));
      setPlacedWords([]);
      setIsCorrect(false);
      setIsWrong(false);
      if (usingPool) setRound((r) => r + 1);
    } else if (state.lastAction?.type === 'CHECK_ANSWER') {
      checkAnswer();
    } else if (state.lastAction?.type === 'UNSCRAMBLE_MOVE') {
      const { wordId, from } = state.lastAction.payload;
      setIsWrong(false);
      if (from === 'bank') {
        setScrambledWords((prev) => {
          const word = prev.find((w) => w.id === wordId);
          if (word) {
            setPlacedWords((prevPlaced) => [...prevPlaced, word]);
            return prev.filter((w) => w.id !== wordId);
          }
          return prev;
        });
      } else {
        setPlacedWords((prev) => {
          const word = prev.find((w) => w.id === wordId);
          if (word) {
            setScrambledWords((prevScrambled) => [...prevScrambled, word]);
            return prev.filter((w) => w.id !== wordId);
          }
          return prev;
        });
      }
      setIsCorrect(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastAction]);

  const handleWordClick = (word: Word, from: 'bank' | 'placed') => {
    triggerAction('UNSCRAMBLE_MOVE', { wordId: word.id, from });
  };

  const checkAnswer = () => {
    if (scrambledWords.length > 0) {
      setIsWrong(true);
      return;
    }
    const cleanCurrent = placedWords.map((w) => w.text).join(' ').replace(/[.,!]/g, '').trim();
    const cleanTarget = target.replace(/[.,!]/g, '').trim();
    if (cleanCurrent && cleanTarget && cleanCurrent === cleanTarget) {
      setIsCorrect(true);
      setIsWrong(false);
    } else {
      setIsCorrect(false);
      setIsWrong(true);
      setTimeout(() => setIsWrong(false), 1000);
    }
  };

  if (loading || (!usingPool && frozenWords.length === 0)) {
    return (
      <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-white text-center px-8">
        <h1 className="text-4xl font-bold text-slate-500 mb-2">Unscramble</h1>
        <p className="text-slate-600 text-xl">
          {loading ? 'Loading…' : 'No sentence-building items. Generate the exercise pool for this unit.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 flex flex-col p-8 font-display">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
         <div className="bg-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/10">
            <div className="w-12 h-12 bg-duo-green rounded-xl flex items-center justify-center text-white text-2xl font-bold">
               Abc
            </div>
            <div>
               <h1 className="text-2xl font-bold text-white">Unscramble</h1>
               <p className="text-slate-400 text-sm">Build the correct sentence.</p>
            </div>
         </div>
         
         <div className="flex gap-4">
            <div className="bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 text-white font-mono text-xl">
               00:45
            </div>
            <button 
               onClick={() => triggerAction('RESET_GAME')}
               className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white"
            >
               <RefreshCcw />
            </button>
         </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-12 max-w-6xl mx-auto w-full">
         
         {/* Drop Zone */}
         <div className={`
            w-full min-h-[160px] bg-slate-800/50 rounded-3xl border-4 border-dashed transition-all duration-300 flex flex-wrap items-center justify-center p-6 gap-4 relative
            ${isCorrect ? 'border-green-500 bg-green-500/10' : isWrong ? 'border-red-500 bg-red-500/10 animate-shake' : 'border-slate-700'}
         `}>
            {placedWords.length === 0 && (
               <div className="text-slate-600 font-bold text-2xl uppercase tracking-widest pointer-events-none select-none">
                  Drop Words Here
               </div>
            )}
            
            {placedWords.map((word) => (
               <button
                  key={word.id}
                  onClick={() => handleWordClick(word, 'placed')}
                  className="bg-white text-slate-900 text-4xl font-bold px-8 py-4 rounded-2xl shadow-lg hover:bg-red-50 hover:text-red-500 transition-all active:scale-95 animate-pop-in"
               >
                  {word.text}
               </button>
            ))}

            {isWrong && (
               <div className="absolute -top-4 right-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-bounce">
                  Try Again!
               </div>
            )}
         </div>

         {/* Arrow Divider */}
         <div className="text-slate-600">
            <ArrowRight size={48} className="rotate-90" />
         </div>

         {/* Word Bank */}
         <div className="flex flex-wrap justify-center gap-4">
            {scrambledWords.map((word) => (
               <button
                  key={word.id}
                  onClick={() => handleWordClick(word, 'bank')}
                  className="bg-duo-blue hover:bg-blue-400 text-white text-4xl font-bold px-8 py-4 rounded-2xl shadow-[0_6px_0_0_#0b5cb5] active:translate-y-1 active:shadow-none transition-all"
               >
                  {word.text}
               </button>
            ))}
         </div>

      </div>

      {/* Success Feedback */}
      {isCorrect && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
               <div className="w-32 h-32 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                  <Check size={64} strokeWidth={4} />
               </div>
               <h2 className="text-5xl font-black text-slate-800 mb-2">Excellent!</h2>
               <p className="text-2xl text-slate-500 font-medium">The sentence is correct.</p>
            </div>
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
            20%, 60% { transform: translateX(-10px); }
            40%, 80% { transform: translateX(10px); }
         }
         .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardUnscramble;
