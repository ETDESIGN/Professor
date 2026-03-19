
import React, { useState, useEffect } from 'react';
import { X, RotateCw, Users, RefreshCw, Check, Star, SkipForward, Scale, Minus, Plus } from 'lucide-react';
import { useSession } from '../../store/SessionContext';

interface QuickSpinModalProps {
  onClose: () => void;
}

const QuickSpinModal: React.FC<QuickSpinModalProps> = ({ onClose }) => {
  const { state, selectNextStudent, addPoints, setSelectionMode, closeOverlay } = useSession();
  const [view, setView] = useState<'spin' | 'result'>('spin');
  const [isSpinning, setIsSpinning] = useState(false);
  const [pointsGiven, setPointsGiven] = useState(0);

  // If a winner is selected in the state, auto-switch to result view
  const winner = state.quickWheelWinner ? state.students.find(s => s.id === state.quickWheelWinner) : null;

  useEffect(() => {
    if (winner && !isSpinning) {
       setView('result');
       setPointsGiven(0); // Reset points tracking
    }
  }, [winner]);

  const handleSpin = () => {
    setIsSpinning(true);
    setView('spin'); // Ensure we see the spin screen briefly
    // Default: useOverlay=true for Quick Spin Modal
    selectNextStudent(undefined, true);
    
    // Simulate spin time before showing result UI on remote
    setTimeout(() => {
       setIsSpinning(false);
       setView('result');
    }, 2000);
  };

  const handleGrade = (amount: number) => {
    if (winner) {
       addPoints(winner.id, amount);
       handleClose();
    }
  };

  const handleManualPoints = (amount: number) => {
     if(winner) {
        addPoints(winner.id, amount);
        setPointsGiven(prev => prev + amount);
     }
  }

  const handleNextStudent = () => {
     handleSpin();
  };

  const handleClose = () => {
     closeOverlay();
     onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4">
      {/* Increased z-index to 100 to stay above everything else */}
      <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={handleClose}></div>
      
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col pointer-events-auto transform transition-all">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
           <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <RotateCw size={20} className="text-yellow-500" /> Quick Picker
           </h2>
           <button onClick={handleClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
              <X size={20} className="text-slate-600" />
           </button>
        </div>

        <div className="p-6">
           {/* MODE SWITCHER */}
           <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
              <button 
                 onClick={() => setSelectionMode('FAIR')}
                 className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.selectionMode === 'FAIR' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                 <Scale size={14} /> Fair (Unpicked)
              </button>
              <button 
                 onClick={() => setSelectionMode('RANDOM')}
                 className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${state.selectionMode === 'RANDOM' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                 <RefreshCw size={14} /> True Random
              </button>
           </div>

           {/* SPINNER VIEW */}
           {view === 'spin' && (
              <div className="flex flex-col items-center py-8">
                 <button 
                    onClick={handleSpin}
                    disabled={isSpinning}
                    className={`
                       w-48 h-48 rounded-full border-8 border-slate-100 flex flex-col items-center justify-center shadow-xl transition-all active:scale-95
                       ${isSpinning ? 'animate-spin border-t-yellow-400 border-r-green-400 border-b-blue-400 border-l-red-400' : 'bg-gradient-to-br from-yellow-400 to-orange-500 hover:scale-105'}
                    `}
                 >
                    {isSpinning ? (
                       <span className="text-2xl">🎲</span>
                    ) : (
                       <>
                          <RotateCw size={48} className="text-white mb-2" />
                          <span className="text-white font-black text-2xl uppercase tracking-widest">SPIN</span>
                       </>
                    )}
                 </button>
                 <p className="mt-6 text-slate-400 text-sm font-medium">
                    {isSpinning ? 'Selecting student...' : 'Tap to pick a student'}
                 </p>
              </div>
           )}

           {/* RESULT VIEW */}
           {view === 'result' && winner && (
              <div className="flex flex-col items-center animate-scale-in">
                 <div className="w-32 h-32 rounded-full border-4 border-yellow-400 shadow-xl flex items-center justify-center text-6xl bg-slate-50 mb-4">
                    {winner.avatar}
                 </div>
                 <h3 className="text-3xl font-black text-slate-800 mb-1">{winner.name}</h3>
                 <p className="text-slate-500 font-bold mb-6">Selected Student</p>

                 {/* Manual Point Adjuster */}
                 <div className="flex items-center gap-4 mb-6 bg-slate-50 p-2 rounded-xl border border-slate-100">
                    <button 
                        onClick={() => handleManualPoints(-5)}
                        className="w-12 h-12 bg-white rounded-lg border border-slate-200 text-red-500 flex items-center justify-center shadow-sm hover:bg-red-50 active:scale-95"
                    >
                        <Minus size={20} strokeWidth={3} />
                    </button>
                    <div className="w-24 text-center">
                        <div className="text-xs font-bold text-slate-400 uppercase">XP Awarded</div>
                        <div className={`text-2xl font-black ${pointsGiven > 0 ? 'text-green-500' : pointsGiven < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                            {pointsGiven > 0 ? '+' : ''}{pointsGiven}
                        </div>
                    </div>
                    <button 
                        onClick={() => handleManualPoints(5)}
                        className="w-12 h-12 bg-white rounded-lg border border-slate-200 text-green-500 flex items-center justify-center shadow-sm hover:bg-green-50 active:scale-95"
                    >
                        <Plus size={20} strokeWidth={3} />
                    </button>
                 </div>

                 {/* Quick Grade Buttons */}
                 <div className="grid grid-cols-2 gap-3 w-full mb-4">
                    <button 
                       onClick={() => handleGrade(10)}
                       className="bg-green-100 text-green-700 border-2 border-green-200 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-200 active:scale-95"
                    >
                       <Check size={20} strokeWidth={3} /> Correct (+10)
                    </button>
                    <button 
                       onClick={() => handleGrade(5)}
                       className="bg-yellow-100 text-yellow-700 border-2 border-yellow-200 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-yellow-200 active:scale-95"
                    >
                       <Star size={20} className="fill-yellow-600" /> Good Try (+5)
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-3 w-full">
                    <button 
                       onClick={handleClose}
                       className="bg-slate-100 text-slate-500 font-bold py-3 rounded-xl hover:bg-slate-200"
                    >
                       Done
                    </button>
                    <button 
                       onClick={handleNextStudent}
                       className="bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                    >
                       Next Student <SkipForward size={16} />
                    </button>
                 </div>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default QuickSpinModal;
