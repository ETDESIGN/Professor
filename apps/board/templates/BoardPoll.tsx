
import React, { useState, useEffect } from 'react';
import { BarChart2, Users, Clock, Trophy, ScanLine } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardPoll = ({ data }: { data: any }) => {
  const { state, triggerConfetti } = useSession();
  const [votes, setVotes] = useState<{ [key: string]: number }>({ A: 0, B: 0, C: 0, D: 0 });
  const [totalVotes, setTotalVotes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isRevealed, setIsRevealed] = useState(false);

  const options = data.options || [
    { id: 'A', text: 'To learn about space', color: 'bg-red-500', ring: 'ring-red-500' },
    { id: 'B', text: 'To find a new home', color: 'bg-blue-500', ring: 'ring-blue-500' },
    { id: 'C', text: 'Because he was lost', color: 'bg-yellow-500', ring: 'ring-yellow-500' },
    { id: 'D', text: 'To meet aliens', color: 'bg-green-500', ring: 'ring-green-500' }
  ];

  // Listen for remote events
  useEffect(() => {
    if (state.lastAction?.type === 'SHOW_RESULTS') {
      if (!isRevealed) {
        setIsRevealed(true);
        setTimeLeft(0);
        triggerConfetti();
      }
    } else if (state.lastAction?.type === 'RESET_TIMER') {
      setIsRevealed(false);
      setTimeLeft(30);
      setVotes({ A: 0, B: 0, C: 0, D: 0 });
      setTotalVotes(0);
    }
  }, [state.lastAction, isRevealed, triggerConfetti]);

  // Simulate incoming votes
  useEffect(() => {
    let timer: any;
    if (timeLeft > 0 && !isRevealed) {
      timer = setInterval(() => {
        setTimeLeft(t => t - 1);
        // Randomly add a vote based on "popularity" simulation
        // Let's pretend option B is popular
        if (Math.random() > 0.4) {
           const opts = ['A', 'B', 'B', 'C', 'D']; // B appears twice to simulate bias
           const pick = opts[Math.floor(Math.random() * opts.length)];
           setVotes(prev => ({ ...prev, [pick]: prev[pick] + 1 }));
           setTotalVotes(prev => prev + 1);
        }
      }, 1000);
    } else if (timeLeft === 0 && !isRevealed) {
       setIsRevealed(true);
       triggerConfetti();
    }
    return () => clearInterval(timer);
  }, [timeLeft, isRevealed, triggerConfetti]);

  // Determine winner
  const getWinnerId = () => {
    let max = -1;
    let winner = null;
    Object.entries(votes).forEach(([id, count]) => {
      const voteCount = count as number;
      if (voteCount > max) {
        max = voteCount;
        winner = id;
      }
    });
    return winner;
  };
  const winnerId = isRevealed ? getWinnerId() : null;

  return (
    <div className="h-full bg-slate-900 flex flex-col font-display relative overflow-hidden text-white">
       {/* Background Grid */}
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-800 to-black z-0"></div>
       <div className="absolute inset-0 z-0 opacity-10" 
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
       </div>

       {/* Header */}
       <div className="p-8 flex justify-between items-start z-10 relative">
          <div className="flex items-center gap-6">
             <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                <BarChart2 size={40} />
             </div>
             <div>
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-2">Live Poll</div>
                <h1 className="text-5xl font-black max-w-4xl leading-tight drop-shadow-md">
                   {data.question || "Why did the astronaut go to Mars?"}
                </h1>
             </div>
          </div>
          
          <div className="flex gap-6">
             <div className="bg-slate-800/80 backdrop-blur px-8 py-4 rounded-2xl border border-slate-700 flex items-center gap-4">
                <Users size={28} className="text-slate-400" />
                <span className="text-4xl font-bold font-mono">{totalVotes}</span>
             </div>
             <div className={`bg-slate-800/80 backdrop-blur px-8 py-4 rounded-2xl border border-slate-700 flex items-center gap-4 transition-colors duration-300 ${timeLeft < 10 && !isRevealed ? 'border-red-500/50 bg-red-900/20' : ''}`}>
                <Clock size={28} className={timeLeft < 10 && !isRevealed ? 'text-red-500 animate-pulse' : 'text-emerald-500'} />
                <span className={`text-4xl font-bold font-mono ${timeLeft < 10 && !isRevealed ? 'text-red-400' : 'text-white'}`}>
                   {timeLeft}s
                </span>
             </div>
          </div>
       </div>

       {/* Chart Area */}
       <div className="flex-1 flex items-end justify-center px-16 pb-12 gap-8 z-10 relative">
          {/* Y-Axis Grid Lines (Visual only) */}
          <div className="absolute inset-x-16 top-0 bottom-32 flex flex-col justify-between pointer-events-none opacity-20">
             <div className="border-t border-dashed border-white w-full"></div>
             <div className="border-t border-dashed border-white w-full"></div>
             <div className="border-t border-dashed border-white w-full"></div>
             <div className="border-t border-dashed border-white w-full"></div>
          </div>

          {options.map((opt: any) => {
             const count = votes[opt.id];
             const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
             const isWinner = winnerId === opt.id;
             
             // Min height 10% for visuals, max 90%
             const barHeight = isRevealed ? Math.max(10, percentage) : 10;
             const displayHeight = isRevealed ? `${barHeight}%` : '10%';
             
             // Safety fallback for ring/border colors if not provided in data
             const ringColorClass = opt.ring || (opt.color ? opt.color.replace('bg-', 'ring-') : 'ring-gray-500');
             const borderColorClass = ringColorClass.replace('ring', 'border');

             return (
                <div key={opt.id} className="flex-1 flex flex-col justify-end h-full group relative">
                   
                   {/* Winner Crown */}
                   <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-20 transition-all duration-500 ${isWinner && isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                      <Trophy size={64} className="text-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.6)] animate-bounce" fill="currentColor" />
                   </div>

                   {/* Bar Column */}
                   <div className="flex flex-col justify-end h-full relative px-4">
                      {/* Percentage Label */}
                      <div className={`text-center mb-2 font-black text-3xl transition-all duration-500 transform ${isRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                         {Math.round(percentage)}%
                      </div>
                      
                      {/* The Bar */}
                      <div className="relative w-full h-full flex flex-col justify-end">
                         <div 
                            className={`w-full rounded-t-3xl transition-all duration-1000 cubic-bezier(0.34, 1.56, 0.64, 1) relative overflow-hidden ${opt.color} ${isWinner && isRevealed ? 'ring-4 ring-white ring-offset-4 ring-offset-slate-900' : ''}`}
                            style={{ height: displayHeight }}
                         >
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/30 to-transparent opacity-50"></div>
                            {/* Striped Pattern Overlay */}
                            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem' }}></div>
                         </div>
                      </div>
                   </div>
                   
                   {/* Card Base */}
                   <div className={`mt-6 bg-slate-800 p-6 rounded-3xl border-2 transition-all duration-300 ${isWinner && isRevealed ? `border-white ${borderColorClass} shadow-2xl scale-105` : 'border-slate-700 group-hover:border-slate-600'}`}>
                      <div className="flex items-center gap-4 mb-3">
                         <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-2xl text-white shadow-lg ${opt.color}`}>
                            {opt.id}
                         </div>
                         <span className={`font-black text-4xl font-mono ${isRevealed ? 'text-white' : 'text-slate-600'}`}>
                            {isRevealed ? count : '?'}
                         </span>
                      </div>
                      <p className="text-slate-300 font-bold text-xl leading-tight line-clamp-2">{opt.text}</p>
                   </div>
                </div>
             );
          })}
       </div>

       {/* QR Code Floating */}
       <div className="absolute bottom-8 right-8 bg-white p-4 rounded-3xl shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
          <div className="flex items-center gap-3 mb-2 justify-center text-slate-900 font-black uppercase tracking-widest text-sm">
             <ScanLine size={16} /> Scan to Vote
          </div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=vote_action_poll_123" className="w-32 h-32 rounded-lg" alt="Vote" />
       </div>
    </div>
  );
};

export default BoardPoll;
