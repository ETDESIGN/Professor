// BoardTeamBattle — Team competition scoreboard (ASSESS phase).
// Redesigned from Hermes prototype 06-team-battle.html.
// Split-screen: Red Team (left) | VS divider | Blue Team (right).
// Shows live rosters + scores. The teacher runs quiz questions via the
// Baton/remote; the board is the live scoreboard the class watches.

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sword, Shield, Zap } from 'lucide-react';
import { useSession } from '../../../store/SessionContext';

const GRADIENTS = [
  'linear-gradient(135deg,#F97316,#EF4444)',
  'linear-gradient(135deg,#F472B6,#A855F7)',
  'linear-gradient(135deg,#FBBF24,#F97316)',
  'linear-gradient(135deg,#3B82F6,#6366F1)',
  'linear-gradient(135deg,#22C55E,#14B8A6)',
  'linear-gradient(135deg,#06B6D4,#3B82F6)',
  'linear-gradient(135deg,#A855F7,#6366F1)',
  'linear-gradient(135deg,#64748B,#475569)',
];

const BoardTeamBattle = ({ data }: { data: any }) => {
  const { state } = useSession();
  const [questions, setQuestions] = useState<any[]>(data?.questions || []);

  // RULES OF HOOKS: effect before return.
  useEffect(() => {
    if (state.lastAction?.type === 'RESET_GAME') setQuestions(data?.questions || []);
  }, [state.lastAction, data?.questions]);

  const redMembers = state.students.filter(s => s.team === 'red');
  const blueMembers = state.students.filter(s => s.team === 'blue');
  const redScore = redMembers.reduce((a, s) => a + (s.points || 0), 0);
  const blueScore = blueMembers.reduce((a, s) => a + (s.points || 0), 0);
  const redLeading = redScore > blueScore;
  const blueLeading = blueScore > redScore;

  if (redMembers.length === 0 && blueMembers.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
        <Sword size={64} className="text-red-500/40 mb-4" />
        <h2 className="font-display text-4xl font-bold">Team Battle</h2>
        <p className="text-xl mt-2">Use the "Teams" button on the Baton to form Red vs Blue teams first.</p>
        <p className="text-base text-slate-500 mt-1 font-cn">先分组再对战</p>
      </div>
    );
  }

  const TeamSide = ({ members, score, color, name, icon, leading }: any) => (
    <div className={`flex-1 relative rounded-3xl border-2 p-5 flex flex-col ${
      color === 'red'
        ? `border-red-500 bg-gradient-to-br from-red-950/40 to-slate-950/60 ${leading ? 'shadow-[0_0_30px_rgba(239,68,68,.3)]' : ''}`
        : `border-blue-500/40 bg-gradient-to-br from-blue-950/40 to-slate-950/60 ${leading ? 'shadow-[0_0_30px_rgba(59,130,246,.2)]' : ''}`
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-5 h-5 rounded-full ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'} shadow-[0_0_10px_${color === 'red' ? 'rgba(239,68,68,.5)' : 'rgba(59,130,246,.5)'}]`} />
        <span className={`font-display text-3xl font-bold ${color === 'red' ? 'text-red-400' : 'text-blue-400'}`}>{name}</span>
        {leading && (
          <span className="ml-auto font-display text-[10px] font-bold text-amber-400 uppercase tracking-widest bg-amber-400/10 border border-amber-400/30 rounded-full px-3 py-1">👑 Leading</span>
        )}
      </div>
      {/* Score */}
      <div className={`font-display text-6xl font-black tabular-nums leading-none mb-4 ${color === 'red' ? 'text-red-300' : 'text-blue-300'}`}>
        {score}
      </div>
      {/* Roster */}
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
        {members.map((s: any, i: number) => (
          <div key={s.id} className={`flex items-center gap-3 bg-white/[.07] border rounded-2xl px-3 py-2 ${color === 'red' ? 'border-red-500/15' : 'border-blue-500/15'}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
              {s.avatar || '👤'}
            </div>
            <span className="font-display text-xl font-bold flex-1 truncate">{s.name}</span>
            <span className={`font-display text-lg font-bold ${color === 'red' ? 'text-red-300' : 'text-blue-300'} bg-white/10 rounded-full px-3 py-0.5 tabular-nums`}>
              {s.points || 0}
            </span>
          </div>
        ))}
        {members.length === 0 && <p className="text-slate-500 text-sm text-center py-4">No members</p>}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col p-6 pt-8">
      <div className="flex-1 flex items-stretch justify-between gap-4">
        <TeamSide members={redMembers} score={redScore} color="red" name="Team Red" icon={<Sword size={28} />} leading={redLeading} />

        {/* VS Divider */}
        <div className="relative flex flex-col items-center justify-center w-[140px] shrink-0">
          <motion.span animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <Zap size={28} className="text-amber-400" />
          </motion.span>
          <div className="font-display text-8xl font-black text-red-500/20 my-2 select-none">VS</div>
          <motion.span animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}>
            <Zap size={28} className="text-amber-400" />
          </motion.span>
          {/* Vertical separator */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        </div>

        <TeamSide members={blueMembers} score={blueScore} color="blue" name="Team Blue" icon={<Shield size={28} />} leading={blueLeading} />
      </div>

      {/* Footer hint */}
      <div className="mt-3 flex items-center justify-center gap-2 text-slate-400/50">
        <span className="text-base">⚔️</span>
        <span className="text-sm font-display">Teacher asks a question → team answers → Baton awards points · 老师提问，团队作答</span>
      </div>
    </div>
  );
};

export default BoardTeamBattle;
