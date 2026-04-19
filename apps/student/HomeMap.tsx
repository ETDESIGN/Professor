
import React from 'react';
import { Star, Play, Lock, Headphones, Activity, Mic, LayoutGrid, Check, Flame, Gift, Target, BookOpen } from 'lucide-react';
import { useSoloSession } from '../../store/SoloSessionContext';
import { motion } from 'framer-motion';

interface HomeMapProps {
  onNavigate: (view: string, unitId?: string) => void;
}

const HomeMap: React.FC<HomeMapProps> = ({ onNavigate }) => {
  const { state } = useSoloSession();
  const soloState = state as any;

  const units = state.units.length > 0 ? state.units : [];
  const completedUnitIds: string[] = soloState.studentProgress?.completedUnitIds || [];
  const currentUnitId: string = soloState.studentProgress?.currentUnitId || '';
  const studentXp: number = soloState.studentProgress?.xp || 0;
  const studentStreak: number = soloState.studentProgress?.streak || 0;

  const now = new Date();
  const hoursLeft = 24 - now.getHours();
  const xpGoal = 50;
  const xpProgress = Math.min(studentXp / xpGoal, 1);

  // Helper to generate the path string
  const generatePath = (startIndex: number) => {
    const nodeHeight = 130;
    let d = `M 50 ${startIndex * nodeHeight + 40}`;

    for (let i = 0; i < 4; i++) {
      const yStart = (startIndex + i) * nodeHeight + 40;
      const yEnd = (startIndex + i + 1) * nodeHeight + 40;

      const xStart = i % 2 === 0 ? 50 : (i % 4 === 1 ? 75 : 25);
      const xEnd = (i + 1) % 2 === 0 ? 50 : ((i + 1) % 4 === 1 ? 75 : 25);

      const cp1y = yStart + (nodeHeight / 2);
      const cp2y = yEnd - (nodeHeight / 2);

      d += ` C ${xStart} ${cp1y}, ${xEnd} ${cp2y}, ${xEnd} ${yEnd}`;
    }
    return d;
  };

  return (
    <div className="flex-1 relative overflow-y-auto bg-slate-50 no-scrollbar pb-32">
      {/* Daily Quests Header */}
      <div className="bg-white mx-4 mt-6 mb-8 rounded-2xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Target size={20} className="text-orange-500" /> Daily Quests
          </h2>
          <span className="text-sm font-bold text-slate-400">{hoursLeft}h left</span>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
              <Flame size={24} className="text-orange-500" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-slate-700">Earn {xpGoal} XP</span>
                <span className="text-sm font-bold text-slate-400">{Math.min(studentXp, xpGoal)}/{xpGoal}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full" style={{ width: `${xpProgress * 100}%` }}></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Headphones size={24} className="text-blue-500" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-slate-700">Complete 2 Lessons</span>
                <span className="text-sm font-bold text-slate-400">{Math.min(completedUnitIds.length, 2)}/2</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(completedUnitIds.length / 2, 1) * 100}%` }}></div>
              </div>
            </div>
          </div>
          {studentStreak > 0 && (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                <Star size={24} className="text-green-500" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-bold text-slate-700">Keep your streak!</span>
                  <span className="text-sm font-bold text-green-500">{studentStreak} days</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {units.map((unit, unitIndex) => {
        return (
          <div key={unit.id} className="relative z-10 pb-8">
            {/* Unit Header */}
            <div className={`mx-4 mt-4 rounded-2xl p-5 text-white shadow-lg transform transition-transform border-b-4 ${unit.status === 'Locked' ? 'bg-slate-400 border-slate-500 grayscale' : 'bg-duo-green border-duo-green-dark'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display font-bold text-2xl tracking-wide">{unit.title}</h3>
                  <p className="opacity-90 text-sm font-medium mt-1">{unit.topic} • {unit.level}</p>
                </div>
                <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                  {unit.status === 'Locked' ? <Lock size={24} /> : <BookOpen size={24} />}
                </div>
              </div>
            </div>

            {/* Path Visualization Layer */}
            <div className="absolute top-28 left-0 w-full h-[600px] pointer-events-none -z-10">
              <svg width="100%" height="100%" viewBox="0 0 100 600" preserveAspectRatio="none">
                <path
                  d={generatePath(0)}
                  fill="none"
                  stroke={unit.status === 'Locked' ? '#e2e8f0' : '#e5e7eb'}
                  strokeWidth="3"
                  strokeDasharray="0"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            {/* Nodes Container */}
            <div className="flex flex-col items-center gap-6 mt-10 pb-4">
              {[1, 2, 3, 4].map((lesson, i) => {
                const isUnitCompleted = completedUnitIds.includes(unit.id) || unit.status === 'Completed';
                const isUnitActive = unit.status === 'Active' && (currentUnitId === unit.id || !currentUnitId);
                const isCompleted = isUnitCompleted || (unit.status === 'Active' && i < 2 && completedUnitIds.length > 0);
                const isActive = isUnitActive && i === 2;
                const isLocked = unit.status === 'Locked' || (!isCompleted && !isActive && unit.status === 'Active' && i > 2);

                let offsetClass = '';
                if (i % 4 === 1) offsetClass = 'translate-x-16';
                if (i % 4 === 3) offsetClass = '-translate-x-16';

                let Icon = Star;
                let action = () => { };
                if (i === 0) { Icon = Headphones; action = () => onNavigate('listen', unit.id); }
                else if (i === 1) { Icon = Activity; action = () => onNavigate('pronounce', unit.id); }
                else if (i === 2) { Icon = Mic; action = () => onNavigate('dubbing', unit.id); }
                else { Icon = LayoutGrid; action = () => onNavigate('scramble', unit.id); }

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`relative flex flex-col items-center ${offsetClass}`}
                  >
                    <button
                      onClick={() => {
                        if (isActive || isCompleted) action();
                      }}
                      disabled={isLocked}
                      className={`
                          w-20 h-20 rounded-full flex items-center justify-center relative transition-all duration-300 z-10
                          ${isCompleted
                          ? 'bg-duo-yellow border-b-8 border-duo-yellow-dark shadow-xl'
                          : isActive
                            ? 'bg-duo-green border-b-8 border-duo-green-dark scale-110 shadow-2xl animate-bounce-subtle ring-4 ring-green-200'
                            : 'bg-slate-200 border-b-8 border-slate-300'
                        }
                        `}
                    >
                      {/* Icon */}
                      {isCompleted && <Check size={32} className="text-yellow-700" strokeWidth={4} />}
                      {isActive && <Play fill="white" className="text-white w-10 h-10 ml-1" />}
                      {isLocked && <Lock className="text-slate-400 w-8 h-8" />}

                      {/* Stars for completed */}
                      {isCompleted && (
                        <div className="absolute -top-2 flex gap-1 bg-white/20 backdrop-blur rounded-full px-2 py-0.5">
                          <Star size={10} className="text-yellow-500 fill-yellow-500" />
                          <Star size={10} className="text-yellow-500 fill-yellow-500" />
                          <Star size={10} className="text-yellow-500 fill-yellow-500" />
                        </div>
                      )}

                      {/* Active Popover */}
                      {isActive && (
                        <div className="absolute -top-12 bg-white px-4 py-2 rounded-xl shadow-lg border border-slate-100 text-duo-green font-bold text-sm whitespace-nowrap animate-bounce">
                          START
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-white rotate-45 border-b border-r border-slate-100"></div>
                        </div>
                      )}
                    </button>
                  </motion.div>
                );
              })}

              {/* Final Chest Node */}
              <div className="relative mt-6">
                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center border-b-8 transition-colors ${unit.status === 'Locked' ? 'bg-slate-200 border-slate-300' : 'bg-gradient-to-b from-blue-400 to-blue-600 border-blue-700'}`}>
                  <img
                    src="https://api.dicebear.com/7.x/icons/svg?seed=chest"
                    className={`w-16 h-16 ${unit.status === 'Locked' ? 'opacity-30 grayscale' : 'drop-shadow-lg'}`}
                    alt="Chest"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Floating Practice CTA */}
      <div className="fixed bottom-24 right-4 z-40 space-y-3">
        <button
          onClick={() => onNavigate('practice')}
          className="w-14 h-14 bg-white rounded-2xl shadow-xl border-2 border-slate-100 flex items-center justify-center text-slate-600 hover:text-duo-green hover:scale-110 transition-transform active:scale-95"
        >
          <LayoutGrid size={28} />
        </button>
        <button
          onClick={() => onNavigate('dubbing')}
          className="w-16 h-16 bg-purple-500 rounded-2xl shadow-xl border-b-4 border-purple-700 flex items-center justify-center animate-bounce-subtle hover:scale-110 transition-transform active:scale-95 active:border-b-0 active:translate-y-1"
        >
          <Mic className="text-white w-8 h-8" />
          <span className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">NEW</span>
        </button>
      </div>
    </div>
  );
};

const BookOpenIcon = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
);

export default HomeMap;
