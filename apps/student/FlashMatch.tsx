import React, { useState, useEffect } from 'react';
import { X, Heart, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FlashMatchProps {
  onBack: () => void;
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    pairs: { id: string; left: string; right: string }[];
  };
}

const FlashMatch: React.FC<FlashMatchProps> = ({
  onBack,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data
}) => {
  const defaultPairs = [
    { id: '1', left: 'Apple', right: 'Manzana' },
    { id: '2', left: 'Dog', right: 'Perro' },
    { id: '3', left: 'Cat', right: 'Gato' },
    { id: '4', left: 'House', right: 'Casa' },
  ];

  const pairs = data?.pairs || defaultPairs;

  const [leftItems, setLeftItems] = useState<{ id: string; text: string; state: 'idle' | 'selected' | 'matched' | 'error' }[]>([]);
  const [rightItems, setRightItems] = useState<{ id: string; text: string; state: 'idle' | 'selected' | 'matched' | 'error' }[]>([]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);

  useEffect(() => {
    // Shuffle items
    const left = pairs.map(p => ({ id: p.id, text: p.left, state: 'idle' as const })).sort(() => Math.random() - 0.5);
    const right = pairs.map(p => ({ id: p.id, text: p.right, state: 'idle' as const })).sort(() => Math.random() - 0.5);
    setLeftItems(left);
    setRightItems(right);
  }, [pairs]);

  // Check for match when both are selected
  useEffect(() => {
    if (selectedLeft && selectedRight) {
      if (selectedLeft === selectedRight) {
        // Match!
        setLeftItems(prev => prev.map(i => i.id === selectedLeft ? { ...i, state: 'matched' } : i));
        setRightItems(prev => prev.map(i => i.id === selectedRight ? { ...i, state: 'matched' } : i));
        setSelectedLeft(null);
        setSelectedRight(null);
      } else {
        // Mismatch
        setLeftItems(prev => prev.map(i => i.id === selectedLeft ? { ...i, state: 'error' } : i));
        setRightItems(prev => prev.map(i => i.id === selectedRight ? { ...i, state: 'error' } : i));
        
        setTimeout(() => {
          setLeftItems(prev => prev.map(i => i.id === selectedLeft ? { ...i, state: 'idle' } : i));
          setRightItems(prev => prev.map(i => i.id === selectedRight ? { ...i, state: 'idle' } : i));
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 800);
      }
    }
  }, [selectedLeft, selectedRight]);

  const isComplete = leftItems.length > 0 && leftItems.every(i => i.state === 'matched');

  useEffect(() => {
    if (onReady) {
      onReady(isComplete);
    }
  }, [isComplete, onReady]);

  useEffect(() => {
    if (validateTrigger && validateTrigger > 0) {
      if (onResult) {
        onResult(isComplete);
      }
    }
  }, [validateTrigger]);

  const handleLeftClick = (id: string) => {
    if (leftItems.find(i => i.id === id)?.state === 'matched') return;
    setSelectedLeft(id);
    setLeftItems(prev => prev.map(i => i.id === id ? { ...i, state: 'selected' } : (i.state === 'selected' ? { ...i, state: 'idle' } : i)));
  };

  const handleRightClick = (id: string) => {
    if (rightItems.find(i => i.id === id)?.state === 'matched') return;
    setSelectedRight(id);
    setRightItems(prev => prev.map(i => i.id === id ? { ...i, state: 'selected' } : (i.state === 'selected' ? { ...i, state: 'idle' } : i)));
  };

  const getItemClass = (state: string) => {
    switch (state) {
      case 'selected': return 'bg-cyan-100 border-cyan-400 text-cyan-700';
      case 'matched': return 'bg-slate-100 border-slate-200 text-slate-400 opacity-50 scale-95';
      case 'error': return 'bg-red-100 border-red-400 text-red-700 animate-shake';
      default: return 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm';
    }
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col font-sans relative overflow-hidden">
      {mode === 'standalone' && (
        <header className="p-4 flex items-center justify-between z-10 bg-white border-b border-slate-100">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
          <div className="flex-1 mx-4 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-cyan-400 w-1/2 rounded-full relative overflow-hidden">
               <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-red-500 font-bold">
            <Heart fill="currentColor" size={20} /> 5
          </div>
        </header>
      )}

      <div className="flex-1 flex flex-col p-6 items-center w-full max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-8 self-start">Tap the matching pairs</h2>

        <div className="flex w-full gap-4">
          <div className="flex-1 flex flex-col gap-3">
            <AnimatePresence>
              {leftItems.map((item) => (
                <motion.button
                  key={`l-${item.id}`}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleLeftClick(item.id)}
                  className={`p-4 rounded-xl border-2 text-center font-bold transition-all duration-200 ${getItemClass(item.state)}`}
                  disabled={item.state === 'matched'}
                >
                  {item.text}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <AnimatePresence>
              {rightItems.map((item) => (
                <motion.button
                  key={`r-${item.id}`}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleRightClick(item.id)}
                  className={`p-4 rounded-xl border-2 text-center font-bold transition-all duration-200 ${getItemClass(item.state)}`}
                  disabled={item.state === 'matched'}
                >
                  {item.text}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlashMatch;
