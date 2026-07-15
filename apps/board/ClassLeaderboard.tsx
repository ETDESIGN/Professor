// ClassLeaderboard — full-screen overlay showing every student ranked by their
// UNIFIED points total (home XP + live class points, seeded from student.xp via
// mapStudent + incremented by addPoints). All kids see it to compete (locked
// decision 0.1.4). Triggered by the teacher (SHOW_LEADERBOARD action); tap to close.

import React from 'react';
import { Trophy, Medal, X } from 'lucide-react';
import { useSession } from '../../store/SessionContext';

const ClassLeaderboard: React.FC = () => {
  const { state, triggerAction } = useSession();
  const ranked = [...(state.students || [])]
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  const medal = ['#facc15', '#cbd5e1', '#d97706']; // gold / silver / bronze
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div
      className="absolute inset-0 z-[70] bg-slate-950/95 backdrop-blur flex flex-col items-center justify-center p-8"
      onClick={() => triggerAction('SHOW_LEADERBOARD')}
    >
      <button
        onClick={(e) => { e.stopPropagation(); triggerAction('SHOW_LEADERBOARD'); }}
        className="absolute top-6 right-6 text-slate-400 hover:text-white p-2"
        aria-label="Close leaderboard"
      >
        <X size={28} />
      </button>

      <h1 className="text-5xl font-black text-white flex items-center gap-3 mb-8">
        <Trophy className="text-yellow-400" size={44} /> Class Leaderboard
      </h1>

      <div className="w-full max-w-2xl space-y-2">
        {ranked.map((s, i) => {
          const top3 = i < 3;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-4 rounded-2xl p-4 border transition-all ${
                top3
                  ? 'bg-white/10 border-white/20 shadow-lg'
                  : 'bg-white/5 border-white/5'
              } ${i === 0 ? 'scale-[1.03]' : ''}`}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0"
                style={{ background: top3 ? medal[i] : 'rgba(255,255,255,0.08)', color: top3 ? '#0f172a' : '#cbd5e1' }}
              >
                {top3 ? <Medal size={24} /> : i + 1}
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl shrink-0">
                {s.avatar || s.name?.[0] || '?'}
              </div>
              <span className={`flex-1 font-bold truncate ${i === 0 ? 'text-yellow-300 text-2xl' : 'text-white text-xl'}`}>
                {s.name}
              </span>
              <span className={`font-mono font-black tabular-nums ${i === 0 ? 'text-yellow-300 text-3xl' : 'text-slate-200 text-2xl'}`}>
                {fmt(s.points || 0)}
              </span>
            </div>
          );
        })}
        {ranked.length === 0 && (
          <p className="text-slate-400 text-center">No students in this class yet.</p>
        )}
      </div>

      <p className="text-slate-500 text-sm mt-8">Tap anywhere to close</p>
    </div>
  );
};

export default ClassLeaderboard;
