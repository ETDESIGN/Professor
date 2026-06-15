
import React, { useState, useEffect, useCallback } from 'react';
import { Check, RefreshCcw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface MatchPair {
  id: string;
  left: string;
  right: string;
}

const BoardFlashMatch = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();
  const pairs: MatchPair[] = data?.pairs || [];

  const [leftItems, setLeftItems] = useState(() =>
    pairs.map((p, i) => ({ id: `l_${i}`, pairId: p.id, text: p.left, matched: false }))
  );
  const [rightItems, setRightItems] = useState(() => {
    const shuffled = pairs.map((p, i) => ({ id: `r_${i}`, pairId: p.id, text: p.right, matched: false }));
    return shuffled.sort(() => Math.random() - 0.5);
  });

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [isWrong, setIsWrong] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
      setSelectedLeft(null);
      setSelectedRight(null);
      setMatchedCount(0);
      setIsWrong(false);
      setIsComplete(false);
      setLeftItems(prev => prev.map(l => ({ ...l, matched: false })));
      setRightItems(prev => prev.map(r => ({ ...r, matched: false })).sort(() => Math.random() - 0.5));
    }
  }, [state.lastAction]);

  const handleLeftClick = useCallback((id: string) => {
    if (isComplete) return;
    const item = leftItems.find(l => l.id === id);
    if (item?.matched) return;
    setSelectedLeft(id);
    setIsWrong(false);

    if (selectedRight) {
      checkMatch(id, selectedRight);
    }
  }, [leftItems, selectedRight, isComplete]);

  const handleRightClick = useCallback((id: string) => {
    if (isComplete) return;
    const item = rightItems.find(r => r.id === id);
    if (item?.matched) return;
    setSelectedRight(id);
    setIsWrong(false);

    if (selectedLeft) {
      checkMatch(selectedLeft, id);
    }
  }, [rightItems, selectedLeft, isComplete]);

  const checkMatch = (leftId: string, rightId: string) => {
    const leftItem = leftItems.find(l => l.id === leftId);
    const rightItem = rightItems.find(r => r.id === rightId);

    if (!leftItem || !rightItem) {
      setSelectedLeft(null);
      setSelectedRight(null);
      return;
    }

    if (leftItem.pairId === rightItem.pairId) {
      setLeftItems(prev => prev.map(l => l.id === leftId ? { ...l, matched: true } : l));
      setRightItems(prev => prev.map(r => r.id === rightId ? { ...r, matched: true } : r));
      setMatchedCount(prev => {
        const newCount = prev + 1;
        if (newCount === pairs.length) {
          setIsComplete(true);
        }
        return newCount;
      });
    } else {
      setIsWrong(true);
      setTimeout(() => setIsWrong(false), 800);
    }

    setSelectedLeft(null);
    setSelectedRight(null);
  };

  if (pairs.length === 0) {
    return (
      <div className="h-full bg-slate-900 flex items-center justify-center text-white">
        <h2 className="text-4xl font-bold text-slate-500">No matching pairs available</h2>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 flex flex-col p-8 font-display">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="bg-white/10 px-6 py-3 rounded-2xl flex items-center gap-4 border border-white/10">
          <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center text-white text-2xl font-bold">
            ⚡
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Flash Match</h1>
            <p className="text-slate-400 text-sm">Match each word with its definition</p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="bg-slate-800 px-6 py-3 rounded-xl border border-slate-700 text-white font-bold text-lg">
            {matchedCount} / {pairs.length}
          </div>
          <button
            onClick={() => triggerAction('RESET_GAME')}
            className="p-3 bg-slate-800 rounded-xl text-slate-400 hover:bg-slate-700 hover:text-white"
          >
            <RefreshCcw />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 bg-slate-800 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${(matchedCount / pairs.length) * 100}%` }}
        />
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center gap-16 max-w-6xl mx-auto w-full">
        {/* Left Column - Words */}
        <div className="flex flex-col gap-4 w-[45%]">
          {leftItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleLeftClick(item.id)}
              disabled={item.matched}
              className={`
                text-left px-8 py-5 rounded-2xl text-2xl font-bold transition-all duration-300 border-2
                ${item.matched
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 line-through opacity-50'
                  : selectedLeft === item.id
                    ? 'bg-blue-600 border-blue-400 text-white scale-105 shadow-lg shadow-blue-500/30'
                    : isWrong
                      ? 'bg-slate-800 border-slate-600 text-white hover:border-blue-400'
                      : 'bg-slate-800 border-slate-600 text-white hover:border-blue-400'
                }
              `}
            >
              {item.text}
            </button>
          ))}
        </div>

        {/* Center Connector */}
        <div className="flex flex-col items-center gap-4 text-slate-600">
          {pairs.map((_, i) => (
            <div key={i} className="w-8 h-[52px] flex items-center justify-center">
              {i < matchedCount ? '✓' : '→'}
            </div>
          ))}
        </div>

        {/* Right Column - Definitions */}
        <div className="flex flex-col gap-4 w-[45%]">
          {rightItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleRightClick(item.id)}
              disabled={item.matched}
              className={`
                text-left px-8 py-5 rounded-2xl text-lg font-medium transition-all duration-300 border-2
                ${item.matched
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 line-through opacity-50'
                  : selectedRight === item.id
                    ? 'bg-purple-600 border-purple-400 text-white scale-105 shadow-lg shadow-purple-500/30'
                    : isWrong
                      ? 'bg-slate-800 border-red-500 text-white animate-shake'
                      : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-purple-400'
                }
              `}
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>

      {/* Complete Overlay */}
      {isComplete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center animate-bounce-subtle">
            <div className="w-32 h-32 bg-purple-100 text-purple-500 rounded-full flex items-center justify-center mb-6">
              <Check size={64} strokeWidth={4} />
            </div>
            <h2 className="text-5xl font-black text-slate-800 mb-2">All Matched!</h2>
            <p className="text-2xl text-slate-500 font-medium">Great job connecting the pairs!</p>
          </div>
        </div>
      )}

      <style>{`
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

export default BoardFlashMatch;
