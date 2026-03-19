
import React, { useState, useEffect } from 'react';
import { Star, Clock, Heart, Check, TrendingUp, AlertTriangle, Activity } from 'lucide-react';
import { useSession } from '../../store/SessionContext';
import { Engine } from '../../services/SupabaseService';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { motion } from 'framer-motion';

interface ParentDashboardProps {
  onNavigate: (tab: string) => void;
}

const ParentDashboard: React.FC<ParentDashboardProps> = ({ onNavigate }) => {
  const { triggerConfetti } = useSession();
  const [kudosSent, setKudosSent] = useState(false);
  const [studentStats, setStudentStats] = useState({ xp: 0, streak: 0 });

  // Mock data for charts
  const weeklyActivityData = [
    { name: 'Mon', xp: 120 },
    { name: 'Tue', xp: 200 },
    { name: 'Wed', xp: 150 },
    { name: 'Thu', xp: 300 },
    { name: 'Fri', xp: 250 },
    { name: 'Sat', xp: 400 },
    { name: 'Sun', xp: 100 },
  ];

  const struggleAreas = [
    { subject: 'Pronunciation', score: 65, color: '#ef4444' },
    { subject: 'Past Tense', score: 72, color: '#f59e0b' },
    { subject: 'Vocabulary', score: 88, color: '#10b981' },
    { subject: 'Listening', score: 95, color: '#3b82f6' },
  ];

  useEffect(() => {
    const loadStats = async () => {
      const stats = await Engine.getStudentProgress();
      setStudentStats({ xp: stats.xp, streak: stats.streak });
    };
    loadStats();
  }, []);

  const handleSendKudos = () => {
    if (kudosSent) return;
    triggerConfetti();
    setKudosSent(true);
    setTimeout(() => setKudosSent(false), 5000);
  };

  return (
    <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-slate-50">
      <h1 className="text-2xl font-bold text-slate-800">Good Morning! ☀️</h1>

      {/* Child Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-10 -mt-10"></div>

        <div className="flex items-center gap-4 mb-6 relative z-10">
          <div className="w-16 h-16 bg-white rounded-full p-1 shadow-md">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" alt="Leo" className="rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Leo</h2>
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">Lvl {Math.floor(studentStats.xp / 1000) + 1}</span>
            </div>
            <div className="flex items-center gap-1 text-cyan-100 text-sm">
              <span>🔥 {studentStats.streak} Day Streak</span>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex justify-between text-xs font-bold mb-1 opacity-90">
            <span>XP Progress</span>
            <span>{studentStats.xp % 1000} / 1000</span>
          </div>
          <div className="h-3 bg-black/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${(studentStats.xp % 1000) / 10}%` }}></div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2"
        >
          <div className="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
            <Star size={20} fill="currentColor" />
          </div>
          <span className="text-2xl font-bold text-slate-800">{studentStats.xp}</span>
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wide">Total XP</span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2"
        >
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <Clock size={20} />
          </div>
          <span className="text-2xl font-bold text-slate-800">12h</span>
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wide">Time Learned</span>
        </motion.div>
      </div>

      {/* Weekly Activity Graph (Recharts) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-xl shadow-sm border border-slate-100 p-5"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Activity size={18} className="text-cyan-500" />
            Weekly Activity (XP)
          </h3>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyActivityData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area type="monotone" dataKey="xp" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorXp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Areas of Struggle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-sm border border-slate-100 p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Skill Mastery
          </h3>
        </div>
        <div className="space-y-4">
          {struggleAreas.map((area, idx) => (
            <div key={idx}>
              <div className="flex justify-between text-sm mb-1 font-medium">
                <span className="text-slate-700">{area.subject}</span>
                <span style={{ color: area.color }}>{area.score}%</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${area.score}%` }}
                  transition={{ duration: 1, delay: 0.5 + (idx * 0.1) }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: area.color }}
                ></motion.div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Today I Learned */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden"
      >
        <div className="p-4 border-b border-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="w-2 h-6 bg-cyan-400 rounded-full"></span>
            Today I Learned
          </h3>
          <span className="text-xs text-slate-400">Oct 24</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-2xl">🦁</div>
            <div>
              <div className="font-bold text-slate-800">Jungle Animals</div>
              <div className="text-xs text-slate-500">Unit 1 • Lesson 4</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {['Elephant', 'Giraffe', 'Lion', 'Zebra'].map(word => (
              <span key={word} className="px-3 py-1 bg-slate-100 text-slate-600 text-sm rounded-full border border-slate-200">
                {word}
              </span>
            ))}
          </div>

          <button
            onClick={handleSendKudos}
            disabled={kudosSent}
            className={`w-full py-3 border-2 font-bold rounded-xl transition-all flex items-center justify-center gap-2
               ${kudosSent
                ? 'bg-green-50 border-green-500 text-green-600'
                : 'border-cyan-400 text-cyan-500 hover:bg-cyan-50 active:scale-95'}
             `}
          >
            {kudosSent ? (
              <>
                <Check size={20} /> Sent!
              </>
            ) : (
              <>
                <Heart size={20} /> Send Kudos to Leo
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ParentDashboard;
