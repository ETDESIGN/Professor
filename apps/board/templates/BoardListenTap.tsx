
import React, { useState, useEffect } from 'react';
import { Volume2, RefreshCcw, Check, X } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface ListenOption {
  id: number;
  img: string;
  label: string;
  correct: boolean;
}

const BoardListenTap = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();

  const instruction = data?.instruction || 'Listen and tap the correct word';
  const targetWord = data?.targetWord || '';
  const options: ListenOption[] = data?.options || [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
      setSelectedId(null);
      setIsCorrect(null);
    }
  }, [state.lastAction]);

  const handleTap = (option: ListenOption) => {
    if (isCorrect) return;

    setSelectedId(option.id);

    if (option.correct) {
      setIsCorrect(true);
    } else {
      setIsCorrect(false);
      setTimeout(() => {
        setSelectedId(null);
        setIsCorrect(null);
      }, 1200);
    }
  };

  if (options.length === 0) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-500">No listening options available</h2>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 flex flex-col items-center justify-center p-12 font-display relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#3b82f6 2px, transparent 2px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <div className="relative z-10 mb-12 text-center">
        <div className="inline-flex items-center gap-4 bg-white/10 px-8 py-4 rounded-2xl border border-white/10 mb-6">
          <Volume2 size={32} className="text-blue-400" />
          <h1 className="text-3xl font-bold text-white">{instruction}</h1>
        </div>
        <p className="text-slate-400 text-xl">Find: <span className="text-yellow-300 font-bold text-2xl">"{targetWord}"</span></p>
      </div>

      {/* Options Grid */}
      <div className="relative z-10 grid grid-cols-2 gap-8 max-w-4xl w-full">
        {options.map((option) => {
          const isSelected = selectedId === option.id;
          const showCorrect = isCorrect && option.correct;
          const showWrong = isSelected && isCorrect === false;

          return (
            <button
              key={option.id}
              onClick={() => handleTap(option)}
              className={`
                relative bg-slate-800 border-4 rounded-3xl p-8 flex flex-col items-center gap-6
                transition-all duration-300 cursor-pointer
                ${showCorrect
                  ? 'border-emerald-400 bg-emerald-500/20 scale-105 shadow-lg shadow-emerald-500/30'
                  : showWrong
                    ? 'border-red-400 bg-red-500/20 animate-shake scale-95'
                    : 'border-slate-600 hover:border-blue-400 hover:bg-slate-700'
                }
              `}
            >
              {/* Image */}
              <div className="w-40 h-40 rounded-2xl overflow-hidden bg-slate-700 flex items-center justify-center">
                {option.img ? (
                  <img src={option.img} alt={option.label} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-6xl">🔤</span>
                )}
              </div>

              {/* Label */}
              <span className="text-3xl font-bold text-white">{option.label}</span>

              {/* Feedback Icon */}
              {showCorrect && (
                <div className="absolute top-4 right-4 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center animate-pop-in">
                  <Check size={28} className="text-white" strokeWidth={3} />
                </div>
              )}
              {showWrong && (
                <div className="absolute top-4 right-4 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center animate-pop-in">
                  <X size={28} className="text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Reset Button */}
      <button
        onClick={() => triggerAction('RESET_GAME')}
        className="relative z-10 mt-12 p-4 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
      >
        <RefreshCcw size={24} />
      </button>

      {/* Correct Overlay */}
      {isCorrect && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mb-6">
              <Volume2 size={64} strokeWidth={2.5} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">Correct!</h2>
            <p className="text-2xl text-slate-500 font-medium">That's the right word!</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pop-in {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop-in { animation: pop-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
};

export default BoardListenTap;
