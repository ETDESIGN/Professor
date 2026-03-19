
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Volume2, Check, Heart, Flag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SentenceScrambleProps {
  onBack: () => void;
  // New props for embedded mode
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    targetSentence: { en: string; translation: string };
    wordBank: { id: string; text: string }[];
  };
}

const SentenceScramble: React.FC<SentenceScrambleProps> = ({ 
  onBack,
  mode = 'standalone',
  onReady,
  validateTrigger,
  onResult,
  data
}) => {
  const [targetSentence] = useState(data?.targetSentence || {
    en: "The cat is sleeping on the mat",
    translation: "El gato está durmiendo en la alfombra"
  });
  
  const [wordBank, setWordBank] = useState(data?.wordBank || [
    { id: 'w1', text: 'is' },
    { id: 'w2', text: 'sleeping' },
    { id: 'w3', text: 'mat' },
    { id: 'w4', text: 'on' },
    { id: 'w5', text: 'the' },
    { id: 'w6', text: 'The' },
    { id: 'w7', text: 'cat' },
    { id: 'w8', text: 'dog' }, // Distractor
  ]);

  const [placedWords, setPlacedWords] = useState<any[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Report readiness to parent
  useEffect(() => {
    if (onReady) {
      onReady(placedWords.length > 0);
    }
  }, [placedWords, onReady]);

  // Handle external validation trigger from parent
  useEffect(() => {
    if (validateTrigger && validateTrigger > 0) {
      checkAnswer();
    }
  }, [validateTrigger]);

  const handleWordClick = (word: any) => {
    if (showSuccess) return; // Locked
    setPlacedWords([...placedWords, word]);
    setWordBank(wordBank.filter(w => w.id !== word.id));
  };

  const handlePlacedWordClick = (word: any) => {
    if (showSuccess) return; // Locked
    setPlacedWords(placedWords.filter(w => w.id !== word.id));
    setWordBank([...wordBank, word]);
  };

  const checkAnswer = () => {
    const currentSentence = placedWords.map(w => w.text).join(' ');
    const isCorrect = currentSentence === targetSentence.en;
    
    if (isCorrect) {
      setShowSuccess(true);
    } else {
      // Logic handled by parent in embedded mode, usually
    }

    if (onResult) {
      onResult(isCorrect);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col font-sans relative overflow-hidden">
      {/* Header - Only in standalone mode */}
      {mode === 'standalone' && (
        <header className="px-4 py-4 flex items-center justify-between z-10 bg-white border-b border-slate-100">
           <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
              <ChevronLeft size={28} />
           </button>
           <div className="flex-1 mx-4 h-4 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-duo-green w-2/3 rounded-full"></div>
           </div>
           <div className="flex items-center gap-1 text-red-500 font-bold">
              <Heart fill="currentColor" size={24} /> 5
           </div>
        </header>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
         
         {/* Prompt Area */}
         <div className="flex gap-4 mb-8 items-start">
            <div className="w-24 h-24 shrink-0 relative hidden sm:block">
               <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Mascot" alt="Mascot" className="animate-bounce-subtle" />
            </div>
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 sm:rounded-tl-none shadow-sm relative mt-4 w-full">
               <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent -rotate-90 filter drop-shadow-sm hidden sm:block"></div>
               <h2 className="font-bold text-slate-800 mb-1">Translate this sentence</h2>
               <div className="flex items-center gap-2">
                  <button className="bg-duo-blue/10 p-2 rounded-xl text-duo-blue hover:bg-duo-blue/20">
                     <Volume2 size={20} />
                  </button>
                  <p className="text-lg text-slate-600 font-medium italic">"{targetSentence.translation}"</p>
               </div>
            </div>
         </div>

         {/* Answer Drop Zone */}
         <div className="min-h-[140px] border-b-2 border-slate-200 mb-8 flex flex-wrap content-start gap-2 py-4 px-2 bg-slate-50 rounded-xl">
            <AnimatePresence>
               {placedWords.map((word) => (
                  <motion.button
                     key={word.id}
                     layout
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.8 }}
                     onClick={() => handlePlacedWordClick(word)}
                     className="bg-white border-2 border-slate-200 border-b-4 active:border-b-2 px-4 py-2 rounded-xl font-bold text-slate-700 shadow-sm active:translate-y-0.5 transition-all text-lg"
                  >
                     {word.text}
                  </motion.button>
               ))}
            </AnimatePresence>
            {placedWords.length === 0 && (
               <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold">
                  Tap words below
               </div>
            )}
         </div>

         {/* Word Bank */}
         <div className="flex flex-wrap justify-center gap-2">
            <AnimatePresence>
               {wordBank.map((word) => (
                  <motion.button
                     key={word.id}
                     layout
                     initial={{ opacity: 0, scale: 0.8 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.8 }}
                     onClick={() => handleWordClick(word)}
                     className="bg-white border-2 border-slate-200 border-b-4 active:border-b-2 px-4 py-3 rounded-xl font-bold text-slate-700 shadow-sm active:translate-y-0.5 transition-all text-lg"
                  >
                     {word.text}
                  </motion.button>
               ))}
            </AnimatePresence>
         </div>

      </div>

      {/* Footer Actions - Only in standalone mode */}
      {mode === 'standalone' && (
        <div className="p-4 border-t border-slate-200 bg-white">
           <div className="max-w-md mx-auto flex justify-between items-center gap-4">
              <button className="p-3 rounded-xl border-2 border-slate-200 text-slate-400 font-bold hover:bg-slate-50">
                 <Flag size={20} />
              </button>
              <button 
                 onClick={checkAnswer}
                 disabled={placedWords.length === 0}
                 className="flex-1 bg-duo-green hover:bg-duo-green-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl text-lg shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
              >
                 Check
              </button>
           </div>
        </div>
      )}

      {/* Success Modal - Only in standalone mode */}
      {mode === 'standalone' && showSuccess && (
         <div className="absolute inset-x-0 bottom-0 bg-duo-green-dark p-6 animate-slide-up z-50 rounded-t-3xl">
            <div className="max-w-md mx-auto">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-duo-green shadow-lg">
                     <Check size={40} strokeWidth={4} />
                  </div>
                  <div>
                     <h2 className="text-2xl font-bold text-white mb-1">Excellent!</h2>
                     <p className="text-green-100 font-medium">You translated the sentence correctly.</p>
                  </div>
               </div>
               <button 
                  onClick={onBack}
                  className="w-full bg-white text-duo-green font-bold py-3.5 rounded-xl text-lg shadow-[0_4px_0_0_rgba(0,0,0,0.1)] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
               >
                  Continue
               </button>
            </div>
         </div>
      )}
      
      <style>{`
         @keyframes pop-in {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
         }
         .animate-pop-in { animation: pop-in 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>
    </div>
  );
};

export default SentenceScramble;
