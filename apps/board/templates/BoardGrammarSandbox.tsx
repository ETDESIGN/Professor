
import React, { useState, useEffect } from 'react';
import { RefreshCcw, CheckCircle2, AlertCircle, MousePointer2 } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

interface WordItem {
  id: string;
  text: string;
  type: 'noun' | 'verb';
  targetId: string;
}

const BoardGrammarSandbox = ({ data }: { data: any }) => {
  const { state, triggerAction } = useSession();
  
  // Use data from props, fallback to empty if missing
  const initialWords: WordItem[] = data.items || [];

  const [availableWords, setAvailableWords] = useState<WordItem[]>(initialWords);
  const [placedItems, setPlacedItems] = useState<{ [key: string]: WordItem }>({});
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [errorZone, setErrorZone] = useState<string | null>(null);

  // Sync with Teacher Remote
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') {
       handleReset();
    } else if (state.lastAction?.type === 'GRAMMAR_DROP') {
       const { zoneId, wordId } = state.lastAction.payload;
       handleRemotePlace(zoneId, wordId);
    }
  }, [state.lastAction]);

  // Reset when slide changes/data updates
  useEffect(() => {
    handleReset();
  }, [data]);

  const handleReset = () => {
    setAvailableWords(initialWords);
    setPlacedItems({});
    setSelectedWordId(null);
    setErrorZone(null);
  };

  const handleRemotePlace = (zoneId: string, wordId: string) => {
     const word = initialWords.find(w => w.id === wordId);
     if (word) {
        setPlacedItems(prev => ({ ...prev, [zoneId]: word }));
        setAvailableWords(prev => prev.filter(w => w.id !== wordId));
     }
  };

  const onWordClick = (id: string) => {
    if (selectedWordId === id) {
      setSelectedWordId(null);
    } else {
      setSelectedWordId(id);
      setErrorZone(null);
    }
  };

  const onZoneClick = (zoneId: string, requiredTargetId: string) => {
    if (!selectedWordId) return;

    const word = availableWords.find(w => w.id === selectedWordId);
    if (!word) return;

    if (word.targetId === requiredTargetId) {
       triggerAction('GRAMMAR_DROP', { zoneId, wordId: word.id });
       setPlacedItems(prev => ({ ...prev, [zoneId]: word }));
       setAvailableWords(prev => prev.filter(w => w.id !== word.id));
       setSelectedWordId(null);
    } else {
       setErrorZone(zoneId);
       setTimeout(() => setErrorZone(null), 1000);
    }
  };

  return (
    <div className="h-full bg-sky-100 flex flex-col relative overflow-hidden font-display select-none">
      
      {/* 1. Background Scene Layer */}
      <div className="absolute inset-0 z-0 pointer-events-none">
         <div className="absolute inset-0 bg-gradient-to-b from-sky-300 to-sky-100 h-1/2"></div>
         <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-b from-green-300 to-green-500"></div>
         <div className="absolute top-[40%] w-full flex justify-between opacity-50">
            <div className="w-32 h-64 bg-green-700 rounded-full blur-xl -ml-10"></div>
            <div className="w-48 h-64 bg-green-600 rounded-full blur-xl ml-20"></div>
            <div className="w-64 h-80 bg-green-800 rounded-full blur-xl -mr-20"></div>
         </div>
      </div>

      {/* 2. Interactive Scene Layer */}
      <div className="absolute inset-0 z-10">
         
         {/* Tree Object */}
         <div className="absolute top-[10%] left-[5%] w-[30%] h-[70%]">
            <img 
               src="https://img.freepik.com/free-vector/simple-tree-illustration_1308-174542.jpg?w=360&t=st=1708682852~exp=1708683452~hmac=2262539420803c200230230230" 
               className="w-full h-full object-contain drop-shadow-xl" 
               style={{ mixBlendMode: 'multiply' }}
            />
            <TargetZone 
               id="zone-tree" 
               label="What is this?" 
               isPlaced={!!placedItems['zone-tree']} 
               placedText={placedItems['zone-tree']?.text}
               isError={errorZone === 'zone-tree'}
               isSelected={!!selectedWordId}
               onClick={() => onZoneClick('zone-tree', 'zone-tree')}
               style={{ top: '40%', left: '30%' }}
            />
         </div>

         {/* Bench Object */}
         <div className="absolute bottom-[25%] right-[10%] w-[30%]">
            <img 
               src="https://img.freepik.com/free-vector/wooden-bench-park-isolated-white-background_1308-46638.jpg" 
               className="w-full object-contain drop-shadow-lg scale-x-[-1]" 
               style={{ mixBlendMode: 'multiply' }} 
            />
            <TargetZone 
               id="zone-bench" 
               label="Object?" 
               isPlaced={!!placedItems['zone-bench']} 
               placedText={placedItems['zone-bench']?.text}
               isError={errorZone === 'zone-bench'}
               isSelected={!!selectedWordId}
               onClick={() => onZoneClick('zone-bench', 'zone-bench')}
               style={{ top: '-20%', left: '40%' }}
            />
         </div>

         {/* Boy Sprite */}
         <div className="absolute bottom-[20%] left-[40%] w-[15%] animate-bounce-subtle">
            <img 
               src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&clothing=shirt&clothingColor=blue&skinColor=light" 
               className="w-full drop-shadow-2xl" 
            />
            <TargetZone 
               id="zone-boy" 
               label="Action?" 
               isPlaced={!!placedItems['zone-boy']} 
               placedText={placedItems['zone-boy']?.text}
               isError={errorZone === 'zone-boy'}
               isSelected={!!selectedWordId}
               onClick={() => onZoneClick('zone-boy', 'zone-boy')}
               style={{ top: '-40%', left: '10%' }}
            />
         </div>

         {/* Dog Sprite */}
         <div className="absolute bottom-[15%] left-[20%] w-[12%]">
            <div className="w-full aspect-square bg-orange-400 rounded-full relative overflow-hidden shadow-lg border-4 border-white">
                <div className="absolute top-1/3 left-1/4 w-2 h-2 bg-black rounded-full"></div>
                <div className="absolute top-1/3 right-1/4 w-2 h-2 bg-black rounded-full"></div>
                <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-4 h-3 bg-black rounded-full"></div>
                <div className="absolute top-0 left-0 w-6 h-6 bg-orange-600 rounded-full -translate-x-2"></div>
                <div className="absolute top-0 right-0 w-6 h-6 bg-orange-600 rounded-full translate-x-2"></div>
            </div>
            <TargetZone 
               id="zone-dog" 
               label="Animal?" 
               isPlaced={!!placedItems['zone-dog']} 
               placedText={placedItems['zone-dog']?.text}
               isError={errorZone === 'zone-dog'}
               isSelected={!!selectedWordId}
               onClick={() => onZoneClick('zone-dog', 'zone-dog')}
               style={{ top: '-50%', left: '20%' }}
            />
         </div>

      </div>

      {/* 3. Header HUD */}
      <div className="absolute top-0 left-0 w-full p-6 z-30 flex justify-between items-start pointer-events-none">
         <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-2xl shadow-lg border border-white/50 pointer-events-auto">
            <h1 className="text-2xl font-bold text-slate-800 mb-1 flex items-center gap-2">
               <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><MousePointer2 size={20} /></div>
               Grammar Park
            </h1>
            <p className="text-slate-500 font-medium text-sm">Tap a word below, then tap the matching picture.</p>
         </div>
         <div className="flex gap-3 pointer-events-auto">
            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow border border-white/50 flex flex-col items-center min-w-[80px]">
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Found</span>
               <span className="text-2xl font-black text-green-500">{Object.keys(placedItems).length} / 4</span>
            </div>
            <button 
               onClick={() => triggerAction('RESET_GAME')} 
               className="h-full aspect-square bg-white rounded-xl shadow flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
               <RefreshCcw size={20} />
            </button>
         </div>
      </div>

      {/* 4. Bottom Word Tray */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-white/90 backdrop-blur border-t-4 border-white z-30 flex items-center justify-center gap-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
         {availableWords.length > 0 ? (
            availableWords.map((word) => (
               <button
                  key={word.id}
                  onClick={() => onWordClick(word.id)}
                  className={`
                     px-8 py-4 rounded-2xl font-bold text-xl transition-all duration-200 border-b-4 active:scale-95 active:border-b-0 active:translate-y-1
                     ${selectedWordId === word.id 
                        ? 'bg-blue-600 text-white border-blue-800 shadow-lg scale-110 -translate-y-2' 
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:-translate-y-1 shadow-sm'}
                  `}
               >
                  {word.text}
                  <div className="text-[9px] opacity-60 font-medium uppercase tracking-widest mt-1">{word.type}</div>
               </button>
            ))
         ) : (
            <div className="text-green-600 font-black text-2xl flex items-center gap-2 animate-bounce">
               <CheckCircle2 size={32} /> ALL DONE!
            </div>
         )}
      </div>

    </div>
  );
};

// Sub-component for Drop Zones
const TargetZone = ({ id, label, isPlaced, placedText, isError, isSelected, onClick, style }: any) => {
   return (
      <div 
         onClick={onClick}
         className={`
            absolute w-40 h-16 rounded-xl flex items-center justify-center transition-all duration-300 transform
            ${isPlaced 
               ? 'bg-white shadow-xl scale-110 border-4 border-green-500 z-20' 
               : 'bg-black/40 backdrop-blur-sm border-2 border-white/50 border-dashed hover:bg-black/60 cursor-pointer'}
            ${isSelected && !isPlaced ? 'animate-pulse ring-4 ring-yellow-300 ring-opacity-50 scale-105' : ''}
            ${isError ? 'bg-red-500 border-red-600 animate-shake' : ''}
         `}
         style={style}
      >
         {isPlaced ? (
            <div className="text-center animate-pop-in">
               <div className="text-xl font-black text-slate-800">{placedText}</div>
               <div className="absolute -top-3 -right-3 bg-green-500 text-white rounded-full p-1 shadow-sm">
                  <CheckCircle2 size={14} />
               </div>
            </div>
         ) : (
            <div className={`text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2 ${isError ? 'text-white' : ''}`}>
               {isError ? <><AlertCircle size={16} /> Try Again</> : label}
            </div>
         )}
      </div>
   );
};

export default BoardGrammarSandbox;
