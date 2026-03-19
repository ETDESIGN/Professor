
import React, { useState, useEffect } from 'react';
import { X, Volume2, Check, Heart } from 'lucide-react';
import { motion } from 'framer-motion';

interface ListenTapProps {
  onBack: () => void;
  // New props for embedded mode
  mode?: 'standalone' | 'embedded';
  onReady?: (isReady: boolean) => void;
  validateTrigger?: number;
  onResult?: (isCorrect: boolean) => void;
  data?: {
    instruction?: string;
    audioUrl?: string; // or text to synthesize
    options: { id: string | number; img: string; label: string; correct?: boolean }[];
  };
}

const ListenTap: React.FC<ListenTapProps> = ({ 
  onBack, 
  mode = 'standalone', 
  onReady, 
  validateTrigger, 
  onResult,
  data
}) => {
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');

  const defaultOptions = [
    { id: 1, img: 'https://img.freepik.com/free-vector/cute-lion-cartoon-character_1308-106575.jpg', label: 'Lion' },
    { id: 2, img: 'https://img.freepik.com/free-vector/cute-elephant-sitting-cartoon-vector-icon-illustration_138676-2220.jpg', label: 'Elephant', correct: true },
    { id: 3, img: 'https://img.freepik.com/free-vector/cute-giraffe-cartoon-vector-icon-illustration_138676-2222.jpg', label: 'Giraffe' },
    { id: 4, img: 'https://img.freepik.com/free-vector/cute-zebra-sitting-cartoon-vector-icon-illustration_138676-2223.jpg', label: 'Zebra' },
  ];

  const options = data?.options || defaultOptions;
  const instruction = data?.instruction || 'Listen and select the correct image';

  // Report readiness to parent
  useEffect(() => {
    if (onReady) {
      onReady(selectedId !== null);
    }
  }, [selectedId, onReady]);

  // Handle external validation trigger from parent
  useEffect(() => {
    if (validateTrigger && validateTrigger > 0) {
      checkAnswer();
    }
  }, [validateTrigger]);

  const playAudio = () => {
    setIsPlaying(true);
    setTimeout(() => setIsPlaying(false), 2000); // Mock duration
  };

  const checkAnswer = () => {
    const selectedOption = options.find(o => o.id === selectedId);
    const isCorrect = !!selectedOption?.correct;
    
    if (isCorrect) {
      setStatus('correct');
    } else {
      setStatus('wrong');
    }

    if (onResult) {
      onResult(isCorrect);
    }
  };

  return (
    <div className="h-full bg-white flex flex-col font-sans relative overflow-hidden">
      {/* Header - Only in standalone mode */}
      {mode === 'standalone' && (
        <header className="p-4 flex items-center justify-between z-10 bg-white">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
          <div className="flex-1 mx-4 h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-duo-green w-3/5 rounded-full relative overflow-hidden">
               <div className="absolute inset-0 bg-white/20 w-full h-full animate-shimmer"></div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-red-500 font-bold">
            <Heart fill="currentColor" size={20} /> 4
          </div>
        </header>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 items-center w-full max-w-md mx-auto">
        
        {/* Instruction & Audio */}
        <div className="flex flex-col items-center mb-8 w-full">
           <div className="flex items-center gap-4 mb-6 self-start w-full">
              <div className="w-16 h-16 shrink-0">
                 <img src="https://api.dicebear.com/7.x/bottts/svg?seed=Mascot" alt="Mascot" className="animate-bounce-subtle" />
              </div>
              <div className="bg-white border-2 border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm relative">
                 <p className="font-bold text-slate-700">{instruction}</p>
                 <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent -rotate-90"></div>
              </div>
           </div>

           <button 
             onClick={playAudio}
             className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 shadow-lg group ${isPlaying ? 'bg-duo-blue scale-105 shadow-duo-blue/30' : 'bg-white hover:bg-slate-50 text-duo-blue border-2 border-slate-100'}`}
           >
             <Volume2 size={40} className={isPlaying ? 'text-white animate-pulse' : 'text-duo-blue'} />
             <span className={`text-xs font-bold uppercase mt-2 ${isPlaying ? 'text-white' : 'text-slate-400'}`}>
                {isPlaying ? 'Playing...' : 'Tap to Play'}
             </span>
           </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4 w-full">
           {options.map((opt, idx) => (
             <motion.button
               key={opt.id}
               initial={{ opacity: 0, scale: 0.8, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               transition={{ delay: idx * 0.1, type: 'spring', stiffness: 200 }}
               onClick={() => {
                 if (status !== 'idle') return; // Prevent change after answer
                 setSelectedId(opt.id);
                 setStatus('idle');
               }}
               className={`
                 aspect-square rounded-2xl border-4 relative overflow-hidden transition-all duration-200 active:scale-95 group
                 ${selectedId === opt.id 
                    ? 'border-duo-blue bg-blue-50 shadow-md transform -translate-y-1' 
                    : 'border-slate-100 bg-white hover:border-slate-200 shadow-sm'
                 }
                 ${status === 'wrong' && selectedId === opt.id ? 'border-red-500 bg-red-50 animate-shake' : ''}
                 ${status === 'correct' && selectedId === opt.id ? 'border-duo-green bg-green-50' : ''}
                 ${status !== 'idle' && selectedId !== opt.id ? 'opacity-50' : ''}
               `}
             >
               <img src={opt.img} alt={opt.label} className="w-full h-full object-contain p-4" />
               
               {/* Keyboard Hint */}
               <div className="absolute top-2 left-2 w-6 h-6 bg-slate-100 text-slate-400 rounded-md border border-slate-200 text-xs font-bold flex items-center justify-center hidden sm:flex">
                  {idx + 1}
               </div>

               {/* Checkmark Badge */}
               {selectedId === opt.id && (
                 <motion.div 
                   initial={{ scale: 0 }}
                   animate={{ scale: 1 }}
                   className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm ${status === 'correct' ? 'bg-duo-green' : 'bg-duo-blue'}`}
                 >
                    <Check size={18} strokeWidth={4} />
                 </motion.div>
               )}
             </motion.button>
           ))}
        </div>

      </div>

      {/* Footer - Only in standalone mode */}
      {mode === 'standalone' && (
        <div className={`p-4 border-t border-slate-200 bg-white transition-colors duration-300 ${status === 'correct' ? 'bg-green-100 border-green-200' : ''} ${status === 'wrong' ? 'bg-red-100 border-red-200' : ''}`}>
           <div className="max-w-md mx-auto">
              {status === 'correct' ? (
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 text-green-700 font-bold text-xl">
                       <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-green-500">
                          <Check size={20} strokeWidth={4} />
                       </div>
                       Correct!
                    </div>
                    <button onClick={onBack} className="bg-duo-green text-white font-bold py-3 px-8 rounded-xl shadow-[0_4px_0_0_#46a302] active:translate-y-1 active:shadow-none">
                       Continue
                    </button>
                 </div>
              ) : status === 'wrong' ? (
                 <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3 text-red-700 font-bold text-xl">
                       <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-red-500">
                          <X size={20} strokeWidth={4} />
                       </div>
                       Incorrect
                    </div>
                    <button onClick={() => setStatus('idle')} className="bg-red-500 text-white font-bold py-3 px-8 rounded-xl shadow-[0_4px_0_0_#b91c1c] active:translate-y-1 active:shadow-none">
                       Try Again
                    </button>
                 </div>
              ) : (
                 <button 
                    onClick={checkAnswer}
                    disabled={!selectedId}
                    className="w-full bg-duo-green hover:bg-duo-green-dark disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3.5 rounded-xl text-lg shadow-[0_4px_0_0_#46a302] active:shadow-none active:translate-y-1 transition-all uppercase tracking-wide"
                 >
                    Check
                 </button>
              )}
           </div>
        </div>
      )}
    </div>
  );
};

export default ListenTap;
