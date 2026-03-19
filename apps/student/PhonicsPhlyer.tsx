import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Volume2, Heart, Star, Cloud, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PhonicsPhlyerProps {
  onBack: () => void;
}

interface FlyingWord {
  id: number;
  text: string;
  x: number; // percentage 0-100
  y: number; // percentage 10-90
  speed: number;
  isTarget: boolean;
  status: 'flying' | 'hit' | 'missed' | 'wrong';
}

const PhonicsPhlyer: React.FC<PhonicsPhlyerProps> = ({ onBack }) => {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const [words, setWords] = useState<FlyingWord[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastSpawnRef = useRef<number>(0);

  const targetSound = "sh";
  const wordList = [
    { text: "ship", isTarget: true },
    { text: "shop", isTarget: true },
    { text: "fish", isTarget: true },
    { text: "dish", isTarget: true },
    { text: "brush", isTarget: true },
    { text: "chip", isTarget: false },
    { text: "chair", isTarget: false },
    { text: "watch", isTarget: false },
    { text: "cat", isTarget: false },
    { text: "sun", isTarget: false },
    { text: "sock", isTarget: false },
  ];

  useEffect(() => {
    if (!isPlaying) return;

    const loop = (time: number) => {
      // Spawn new words
      if (time - lastSpawnRef.current > 2000) {
        spawnWord();
        lastSpawnRef.current = time;
      }

      setWords(prevWords => {
        const nextWords = prevWords.map(w => ({
          ...w,
          x: w.status === 'flying' ? w.x + w.speed : w.x
        })).filter(w => {
          // Remove if off screen
          if (w.x > 110) {
            if (w.isTarget && w.status === 'flying') {
               setLives(l => Math.max(0, l - 1));
            }
            return false;
          }
          return true;
        });
        return nextWords;
      });

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
     if (lives <= 0) setIsPlaying(false);
  }, [lives]);

  const spawnWord = () => {
    const wordData = wordList[Math.floor(Math.random() * wordList.length)];
    const newWord: FlyingWord = {
      id: Date.now(),
      text: wordData.text,
      x: -20,
      y: Math.random() * 60 + 10, // 10% to 70% vertical
      speed: Math.random() * 0.2 + 0.1, // Random speed
      isTarget: wordData.isTarget,
      status: 'flying'
    };
    setWords(prev => [...prev, newWord]);
  };

  const handleTap = (id: number) => {
    if (!isPlaying) return;
    
    setWords(prev => prev.map(w => {
      if (w.id === id && w.status === 'flying') {
        if (w.isTarget) {
          setScore(s => s + 10);
          return { ...w, status: 'hit' };
        } else {
          setLives(l => Math.max(0, l - 1));
          return { ...w, status: 'wrong' };
        }
      }
      return w;
    }));

    // Remove after animation
    setTimeout(() => {
       setWords(prev => prev.filter(w => w.id !== id));
    }, 500);
  };

  return (
    <div className="h-full bg-sky-300 flex flex-col font-sans relative overflow-hidden">
      {/* Moving Clouds Background */}
      <div className="absolute inset-0 pointer-events-none">
         <Cloud className="text-white/40 absolute top-20 left-10 w-24 h-24 animate-float-slow" />
         <Cloud className="text-white/30 absolute top-40 left-60 w-32 h-32 animate-float-slower" />
         <Cloud className="text-white/50 absolute top-10 right-20 w-20 h-20 animate-float" />
      </div>

      {/* Header */}
      <header className="px-4 py-3 sticky top-0 z-20 flex items-center justify-between bg-sky-400/30 backdrop-blur-sm border-b border-white/20">
        <button onClick={onBack} className="p-2 -ml-2 text-white hover:bg-white/20 rounded-full">
           <ChevronLeft size={28} />
        </button>
        <div className="flex items-center gap-2 bg-white/20 px-4 py-1 rounded-full border border-white/30">
           <Volume2 size={20} className="text-white" />
           <span className="font-bold text-white text-lg">/{targetSound}/</span>
        </div>
        <div className="flex items-center gap-1 bg-red-500/80 px-3 py-1 rounded-full text-white font-bold border border-red-400 shadow-sm">
           <Heart fill="currentColor" size={18} /> {lives}
        </div>
      </header>

      {/* Game Area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
         <AnimatePresence>
         {words.map(word => (
            <motion.button
               key={word.id}
               initial={{ scale: 0, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0, opacity: 0 }}
               onClick={() => handleTap(word.id)}
               className={`
                  absolute px-6 py-3 rounded-full font-bold text-xl shadow-lg border-2 transition-transform duration-200
                  ${word.status === 'hit' ? 'scale-150 opacity-0 bg-green-400 border-green-200 text-white' : ''}
                  ${word.status === 'wrong' ? 'animate-shake bg-red-500 border-red-300 text-white' : 'bg-white border-sky-100 text-sky-600 hover:scale-110 active:scale-95'}
               `}
               style={{ 
                  left: `${word.x}%`, 
                  top: `${word.y}%`,
                  transition: word.status === 'flying' ? 'none' : 'all 0.5s ease-out'
               }}
            >
               {word.text}
               {word.status === 'hit' && <span className="absolute -top-4 right-0 text-yellow-300 font-black text-sm">+10</span>}
            </motion.button>
         ))}
         </AnimatePresence>

         {/* Score */}
         <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-6 left-6 text-white font-black text-4xl drop-shadow-md flex items-center gap-2"
         >
            <Star className="fill-yellow-400 text-yellow-400" size={32} />
            {score}
         </motion.div>
      </div>

      {/* Game Over Modal */}
      <AnimatePresence>
      {!isPlaying && lives <= 0 && (
         <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
         >
            <motion.div 
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.9, y: 20 }}
               className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl"
            >
               <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                  <X size={48} strokeWidth={4} />
               </div>
               <h2 className="text-3xl font-black text-slate-800 mb-2">Game Over</h2>
               <p className="text-slate-500 font-medium mb-6">You ran out of hearts!</p>
               
               <div className="bg-sky-50 rounded-xl p-4 mb-6 border border-sky-100">
                  <div className="text-xs font-bold text-sky-400 uppercase">Final Score</div>
                  <div className="text-4xl font-black text-sky-600">{score}</div>
               </div>

               <div className="space-y-3">
                  <button 
                     onClick={() => { setLives(5); setScore(0); setWords([]); setIsPlaying(true); lastSpawnRef.current = 0; }}
                     className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 rounded-xl shadow-[0_4px_0_0_#0284c7] active:translate-y-1 active:shadow-none transition-all text-lg"
                  >
                     Try Again
                  </button>
                  <button 
                     onClick={onBack}
                     className="w-full bg-white border-2 border-slate-200 text-slate-500 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                     Exit
                  </button>
               </div>
            </motion.div>
         </motion.div>
      )}
      </AnimatePresence>

      <style>{`
         @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
         }
         .animate-float { animation: float 6s ease-in-out infinite; }
         .animate-float-slow { animation: float 8s ease-in-out infinite; }
         .animate-float-slower { animation: float 12s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default PhonicsPhlyer;