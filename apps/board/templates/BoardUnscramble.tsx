
import React, { useState, useEffect } from 'react';
import { Check, RefreshCcw, ArrowRight, X } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface Word {
  id: string;
  text: string;
}

const BoardUnscramble = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();
  const [scrambledWords, setScrambledWords] = useState<Word[]>(
    data.words.map((w: string, i: number) => ({ id: `w-${i}`, text: w }))
  );
  const [placedWords, setPlacedWords] = useState<Word[]>([]);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isWrong, setIsWrong] = useState(false);

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
       // Reset to initial
       setScrambledWords(data.words.map((w: string, i: number) => ({ id: `w-${i}`, text: w })));
       setPlacedWords([]);
       setIsCorrect(false);
       setIsWrong(false);
    } else if (state.lastAction?.type === 'CHECK_ANSWER') {
       checkAnswer();
    } else if (state.lastAction?.type === 'UNSCRAMBLE_MOVE') {
       const { wordId, from } = state.lastAction.payload;
       setIsWrong(false); // Reset error state on new move
       
       if (from === 'bank') {
          // Move bank -> placed
          setScrambledWords(prev => {
             const word = prev.find(w => w.id === wordId);
             if (word) {
                setPlacedWords(prevPlaced => [...prevPlaced, word]);
                return prev.filter(w => w.id !== wordId);
             }
             return prev;
          });
       } else {
          // Move placed -> bank
          setPlacedWords(prev => {
             const word = prev.find(w => w.id === wordId);
             if (word) {
                setScrambledWords(prevScrambled => [...prevScrambled, word]);
                return prev.filter(w => w.id !== wordId);
             }
             return prev;
          });
       }
       setIsCorrect(false);
    }
  }, [state.lastAction]);

  const handleWordClick = (word: Word, from: 'bank' | 'placed') => {
    triggerAction('UNSCRAMBLE_MOVE', { wordId: word.id, from });
  };

  const checkAnswer = () => {
    // 1. Check if all words are placed
    if (scrambledWords.length > 0) {
       // Not finished
       setIsWrong(true);
       return;
    }

    // 2. Check if the order matches the target sentence
    const currentSentence = placedWords.map(w => w.text).join(' ');
    // Strip punctuation for loose comparison if needed, but exact match is better for grammar
    const cleanCurrent = currentSentence.replace(/[.,!]/g, '').trim();
    const cleanTarget = data.targetSentence.replace(/[.,!]/g, '').trim();

    if (cleanCurrent === cleanTarget) {
       setIsCorrect(true);
       setIsWrong(false);
    } else {
       setIsCorrect(false);
       setIsWrong(true);
       // Auto-reset wrong state after animation
       setTimeout(() => setIsWrong(false), 1000);
    }
  };

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
