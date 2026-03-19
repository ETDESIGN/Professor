
import React, { useState, useEffect } from 'react';
import { Sword, Shield, Clock, X, Circle, Trophy, Lock, AlertCircle, RefreshCw } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardTeamBattle = ({ data }: { data: any }) => {
  const { state, triggerConfetti } = useSession();
  
  // Game State
  const [grid, setGrid] = useState<(string | null)[]>(Array(9).fill(null));
  const [activeTurn, setActiveTurn] = useState<'red' | 'blue'>('red');
  const [timeLeft, setTimeLeft] = useState(15);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [phase, setPhase] = useState<'answering' | 'claiming'>('answering');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [winner, setWinner] = useState<'red' | 'blue' | 'draw' | null>(null);

  // Safety check for data
  const questions = data?.questions || [];
  const currentQ = questions[currentQuestionIdx] || { 
     text: "No Question Available", 
     image: "https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000", 
     options: ["Option A", "Option B"], 
     correct: "Option A" 
  };

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'SWITCH_TURN') {
       handleNextTurn();
    } else if (state.lastAction?.type === 'RESET_TIMER') {
       setTimeLeft(15);
    } else if (state.lastAction?.type === 'FORCE_CORRECT') {
       handleCorrectAnswer();
    } else if (state.lastAction?.type === 'RESET_GAME') {
       resetGame();
    }
  }, [state.lastAction]);

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0 && !winner && phase === 'answering') {
      const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && phase === 'answering' && !feedback) {
       // Time ran out - switch turn automatically
       handleNextTurn();
    }
  }, [timeLeft, winner, phase, feedback]);

  const resetGame = () => {
    setGrid(Array(9).fill(null));
    setActiveTurn('red');
    setTimeLeft(15);
    setPhase('answering');
    setWinner(null);
    setFeedback(null);
    setCurrentQuestionIdx(0);
  };

  const checkWin = (currentGrid: (string | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]             // diagonals
    ];

    for (let line of lines) {
      const [a, b, c] = line;
      if (currentGrid[a] && currentGrid[a] === currentGrid[b] && currentGrid[a] === currentGrid[c]) {
        return currentGrid[a] as 'red' | 'blue';
      }
    }
    
    if (currentGrid.every(cell => cell !== null)) return 'draw';
    return null;
  };

  const handleCorrectAnswer = () => {
     setFeedback('correct');
     triggerConfetti(); // Visual reward
     setTimeout(() => {
        setPhase('claiming');
        setFeedback(null);
     }, 1000);
  };

  const handleAnswerClick = (option: string) => {
     if (phase !== 'answering' || feedback) return;

     if (option === currentQ.correct) {
        handleCorrectAnswer();
     } else {
        setFeedback('wrong');
        setTimeout(() => {
           setFeedback(null);
           handleNextTurn(); // Turn passes to other team
        }, 1500);
     }
  };

  const handleCellClick = (index: number) => {
    if (grid[index] || winner) return;
    
    if (phase === 'answering') {
       // Shake grid to indicate locked
       const gridEl = document.getElementById('battle-grid');
       gridEl?.classList.add('animate-shake');
       setTimeout(() => gridEl?.classList.remove('animate-shake'), 500);
       return;
    }

    // Logic for Claiming
    const newGrid = [...grid];
    newGrid[index] = activeTurn;
    setGrid(newGrid);

    const winResult = checkWin(newGrid);
    if (winResult) {
       setWinner(winResult);
       if (winResult !== 'draw') triggerConfetti();
    } else {
       handleNextTurn();
    }
  };

  const handleNextTurn = () => {
     setActiveTurn(prev => prev === 'red' ? 'blue' : 'red');
     setPhase('answering');
     setTimeLeft(15);
     // Cycle questions
     setCurrentQuestionIdx(prev => (prev + 1) % questions.length);
  };

  const redScore = grid.filter(c => c === 'red').length * 100 + 450;
  const blueScore = grid.filter(c => c === 'blue').length * 100 + 420;

  return (
    <div className="h-full bg-slate-900 flex flex-col font-display relative overflow-hidden select-none">
       {/* Background */}
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-slate-950"></div>

       {/* Header Scoreboard */}
       <div className="relative z-10 h-24 bg-slate-900/80 backdrop-blur border-b border-white/10 flex items-center justify-between px-12">
          {/* Red Team */}
          <div className={`flex items-center gap-6 transition-all duration-500 ${activeTurn === 'red' ? 'opacity-100 scale-110' : 'opacity-50 grayscale'}`}>
             <div className="w-16 h-16 bg-red-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                <Sword size={32} className="text-white" />
             </div>
             <div>
                <div className="text-red-400 font-bold uppercase tracking-wider text-sm">Team Red</div>
                <div className="text-4xl font-black text-white">{redScore}</div>
             </div>
          </div>

          {/* VS Badge */}
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-xl z-20">
             <span className="font-black text-2xl text-slate-500 italic">VS</span>
          </div>

          {/* Blue Team */}
          <div className={`flex items-center gap-6 text-right transition-all duration-500 ${activeTurn === 'blue' ? 'opacity-100 scale-110' : 'opacity-50 grayscale'}`}>
             <div>
                <div className="text-blue-400 font-bold uppercase tracking-wider text-sm">Team Blue</div>
                <div className="text-4xl font-black text-white">{blueScore}</div>
             </div>
             <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                <Shield size={32} className="text-white" />
             </div>
          </div>
       </div>

       {/* Main Battle Area */}
       <div className="flex-1 flex p-8 gap-8 relative z-10">
          
          {/* Left: Challenge Panel */}
          <div className={`
             w-1/3 bg-slate-800/50 rounded-3xl border p-8 flex flex-col relative overflow-hidden transition-all duration-300
             ${phase === 'answering' ? 'border-yellow-400/50 shadow-[0_0_30px_rgba(250,204,21,0.1)] opacity-100' : 'border-white/10 opacity-50'}
          `}>
             {/* Timer */}
             <div className="absolute top-0 left-0 w-full h-2 bg-slate-700">
                <div 
                   className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                   style={{ width: `${(timeLeft / 15) * 100}%` }}
                ></div>
             </div>

             <div className="flex justify-between items-center mb-6">
                <span className="bg-white/10 text-white/80 px-3 py-1 rounded-full text-sm font-bold border border-white/10">Grammar • Past Simple</span>
                <div className={`flex items-center gap-2 font-mono font-bold text-xl ${timeLeft < 5 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                   <Clock size={24} /> {timeLeft}s
                </div>
             </div>

             <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="w-full aspect-video bg-slate-900 rounded-2xl mb-6 overflow-hidden border-4 border-white/5 relative group">
                   {currentQ.image && <img src={currentQ.image} className="w-full h-full object-cover opacity-80" alt="Question" />}
                   <div className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="bg-black/60 backdrop-blur-md px-6 py-4 rounded-xl text-white font-bold text-2xl leading-relaxed shadow-lg">
                         "{currentQ.text}"
                      </div>
                   </div>
                </div>

                <div className="w-full grid grid-cols-2 gap-4">
                   {currentQ.options?.map((opt: string) => (
                      <button 
                        key={opt}
                        onClick={() => handleAnswerClick(opt)}
                        disabled={phase !== 'answering'}
                        className={`
                           border rounded-xl p-4 font-bold text-xl transition-all relative overflow-hidden
                           ${feedback === 'wrong' ? 'border-red-500 text-red-500 bg-red-900/20' : 
                             feedback === 'correct' && opt === currentQ.correct ? 'border-green-500 text-green-400 bg-green-900/20' :
                             'bg-white/5 border-white/10 hover:bg-white/10 text-white'}
                        `}
                      >
                         {opt}
                         {feedback === 'wrong' && <X className="absolute top-2 right-2 text-red-500" size={16} />}
                      </button>
                   ))}
                </div>
                
                {feedback === 'wrong' && (
                   <div className="mt-4 text-red-400 font-bold animate-shake flex items-center gap-2">
                      <AlertCircle size={20} /> Incorrect! Switching Turn...
                   </div>
                )}
             </div>
          </div>

          {/* Right: Territory Grid */}
          <div className="flex-1 bg-black/20 rounded-3xl p-8 flex items-center justify-center relative">
             
             {/* Phase Overlay */}
             {phase === 'answering' && !winner && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                   <div className="bg-black/60 backdrop-blur-sm px-8 py-4 rounded-2xl border border-white/20 text-white font-bold text-xl flex items-center gap-3">
                      <Lock size={24} className="text-slate-400" />
                      Answer Question to Unlock Grid
                   </div>
                </div>
             )}

             {phase === 'claiming' && !winner && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-bounce">
                   <div className={`
                      px-8 py-3 rounded-full border-2 text-white font-bold text-lg shadow-lg
                      ${activeTurn === 'red' ? 'bg-red-600 border-red-400' : 'bg-blue-600 border-blue-400'}
                   `}>
                      Correct! Pick a square!
                   </div>
                </div>
             )}

             <div id="battle-grid" className="grid grid-cols-3 gap-4 w-full max-w-2xl aspect-square">
                {grid.map((cell, i) => (
                   <button 
                      key={i}
                      onClick={() => handleCellClick(i)}
                      className={`
                         relative rounded-2xl border-4 flex items-center justify-center text-6xl shadow-xl transition-all duration-300
                         ${!cell && phase === 'claiming' ? 'bg-slate-800 border-yellow-400 cursor-pointer hover:bg-slate-700 animate-pulse' : ''}
                         ${!cell && phase !== 'claiming' ? 'bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed' : ''}
                         ${cell === 'red' ? 'bg-red-900/80 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)] opacity-100' : ''}
                         ${cell === 'blue' ? 'bg-blue-900/80 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] opacity-100' : ''}
                      `}
                   >
                      {!cell && <span className="text-white/10 font-black">{i + 1}</span>}
                      {cell === 'red' && <X size={80} className="text-red-400 animate-bounce-subtle" strokeWidth={3} />}
                      {cell === 'blue' && <Circle size={70} className="text-blue-400 animate-bounce-subtle" strokeWidth={3} />}
                   </button>
                ))}
             </div>
          </div>
       </div>

       {/* Footer Turn Indicator */}
       <div className={`h-2 transition-all duration-500 ease-in-out ${activeTurn === 'red' ? 'bg-red-500 w-1/2 ml-0' : 'bg-blue-500 w-1/2 ml-[50%]'}`}></div>

       {/* Winner Overlay */}
       {winner && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center animate-fade-in">
             <div className="bg-gradient-to-b from-yellow-400 to-orange-500 p-1 rounded-[3rem] shadow-2xl animate-bounce-subtle max-w-2xl w-full">
               <div className="bg-slate-900 rounded-[2.8rem] p-12 flex flex-col items-center text-center border-4 border-white/20">
                  <Trophy size={80} className="text-yellow-400 mb-6 drop-shadow-lg" />
                  <h2 className="text-7xl font-black text-white mb-4 uppercase italic">
                     {winner === 'draw' ? 'Draw!' : `${winner.charAt(0).toUpperCase() + winner.slice(1)} Team Wins!`}
                  </h2>
                  <div className="flex gap-4 mt-8">
                     <button onClick={resetGame} className="bg-white text-slate-900 font-bold px-8 py-4 rounded-xl hover:scale-105 transition-transform flex items-center gap-2">
                        <RefreshCw size={20} /> Play Again
                     </button>
                  </div>
               </div>
             </div>
          </div>
       )}
    </div>
  );
};

export default BoardTeamBattle;
