
import React from 'react';
import { Trophy, Wifi } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const BoardIntroSplash = ({ data }: { data: any }) => {
  const { state } = useSession();

  // Calculate real-time scores
  const redScore = state.students
    .filter(s => s.team === 'red')
    .reduce((acc, curr) => acc + curr.points, 0);
    
  const blueScore = state.students
    .filter(s => s.team === 'blue')
    .reduce((acc, curr) => acc + curr.points, 0);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-black text-white relative overflow-hidden font-display">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-duo-green opacity-10 blur-[150px] animate-pulse-slow"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-duo-blue opacity-10 blur-[150px] animate-pulse-slow delay-1000"></div>
      
      {/* Floating Particles (Simulated) */}
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(white 2px, transparent 2px)', backgroundSize: '60px 60px' }}></div>

      <div className="relative z-10 text-center flex flex-col items-center max-w-5xl">
        <div className="text-4xl font-light tracking-[0.5em] uppercase mb-12 text-indigo-300 animate-slide-down border-b border-indigo-500/30 pb-4">
           Class 3B • English
        </div>
        
        <h1 className="text-[12rem] leading-none font-fun mb-16 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 drop-shadow-2xl animate-scale-in">
          {data.theme}
        </h1>
        
        <div className="flex items-center gap-12 animate-slide-up">
          <div className="bg-red-900/40 border-2 border-red-500 rounded-[2rem] p-8 min-w-[300px] flex flex-col items-center backdrop-blur-md shadow-[0_0_40px_rgba(239,68,68,0.2)]">
             <Trophy className="text-red-500 mb-2" size={48} />
             <div className="text-red-300 uppercase font-bold tracking-widest text-sm mb-2">Team Red</div>
             <div className="text-7xl font-black text-white">{redScore}</div>
          </div>

          <div className="text-6xl font-black text-slate-700 italic">VS</div>

          <div className="bg-blue-900/40 border-2 border-blue-500 rounded-[2rem] p-8 min-w-[300px] flex flex-col items-center backdrop-blur-md shadow-[0_0_40px_rgba(59,130,246,0.2)]">
             <Trophy className="text-blue-500 mb-2" size={48} />
             <div className="text-blue-300 uppercase font-bold tracking-widest text-sm mb-2">Team Blue</div>
             <div className="text-7xl font-black text-white">{blueScore}</div>
          </div>
        </div>

        <div className="mt-24 flex items-center gap-4 bg-white/5 px-8 py-3 rounded-full border border-white/10 animate-pulse">
           <Wifi size={24} className="text-green-400" />
           <span className="text-xl font-mono text-slate-300">
              Ready for Teacher Connection...
           </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); opacity: 0.1; }
          50% { transform: scale(1.1); opacity: 0.2; }
        }
        .animate-pulse-slow { animation: pulse-slow 8s infinite; }
        .animate-slide-down { animation: slideDown 1s ease-out; }
        .animate-slide-up { animation: slideUp 1s ease-out; }
        .animate-scale-in { animation: scaleIn 1s ease-out; }
        @keyframes slideDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default BoardIntroSplash;
