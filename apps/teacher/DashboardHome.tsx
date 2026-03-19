
import React from 'react';
import { Calendar, Clock, Users, CheckCircle, Bell, ArrowRight, Play, MessageSquare, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardHomeProps {
  onLaunchLive?: () => void;
}

const DashboardHome: React.FC<DashboardHomeProps> = ({ onLaunchLive }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 p-8 overflow-auto bg-slate-50 relative"
    >
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-800">Good Morning, Mrs. Davis! ☀️</h1>
          <p className="text-slate-500 font-medium mt-1">Here's what's happening in your classrooms today.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-700">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="text-sm text-slate-400 font-bold uppercase tracking-wider">
            {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Up Next Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[240px]"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
          
          <div className="relative z-10 flex justify-between items-start">
            <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border border-white/20">
              Up Next
            </div>
            <Clock className="text-white/50" />
          </div>

          <div className="relative z-10 mt-4">
            <h2 className="text-4xl font-bold mb-2">Class 3B • English</h2>
            <div className="flex items-center gap-4 text-indigo-100 mb-6">
              <span className="flex items-center gap-2"><Calendar size={18} /> Room 304</span>
              <span className="flex items-center gap-2"><Users size={18} /> 24 Students</span>
            </div>
            <button 
              onClick={onLaunchLive}
              className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors shadow-md w-fit"
            >
              <Play size={20} fill="currentColor" /> Launch Live Session
            </button>
          </div>
        </motion.div>

        {/* Stats Column */}
        <div className="flex flex-col gap-4">
           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.2 }}
             className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 flex-1"
           >
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                 <CheckCircle size={24} />
              </div>
              <div>
                 <div className="text-3xl font-bold text-slate-800">18/24</div>
                 <div className="text-xs font-bold text-slate-400 uppercase">Homework Submitted</div>
              </div>
           </motion.div>
           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.3 }}
             className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 flex-1"
           >
              <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                 <Bell size={24} />
              </div>
              <div>
                 <div className="text-3xl font-bold text-slate-800">3</div>
                 <div className="text-xs font-bold text-slate-400 uppercase">Parent Messages</div>
              </div>
           </motion.div>
        </div>
      </div>

      {/* Recent Activity */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
           <h3 className="font-bold text-lg text-slate-800">Recent Activity</h3>
           <button className="text-indigo-600 text-sm font-bold hover:underline">View All</button>
        </div>
        <div className="divide-y divide-slate-100">
           {[1, 2, 3].map((i, index) => (
             <motion.div 
               key={i} 
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: 0.5 + (index * 0.1) }}
               className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
             >
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">
                   {['🦁','🦄','🐼'][i-1]}
                </div>
                <div className="flex-1">
                   <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{['Leo', 'Sarah', 'Jay'][i-1]}</span>
                      <span className="text-slate-500 text-sm">completed</span>
                      <span className="font-bold text-indigo-600 text-sm">The Lost Hat (Dubbing)</span>
                   </div>
                   <div className="text-xs text-slate-400 mt-0.5">{i * 15} mins ago</div>
                </div>
                <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full text-xs">
                   +50 XP
                </div>
             </motion.div>
           ))}
           <motion.div 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.8 }}
             className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
           >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                 <MessageSquare size={18} />
              </div>
              <div className="flex-1">
                 <div className="font-bold text-slate-700">Mrs. Thompson (Parent)</div>
                 <div className="text-sm text-slate-500">Sent a message regarding next week's field trip.</div>
              </div>
              <button className="text-slate-400 hover:text-indigo-600"><ArrowRight size={18} /></button>
           </motion.div>
        </div>
      </motion.div>

      {/* Mobile Quick Launch FAB */}
      <button 
        onClick={onLaunchLive}
        className="md:hidden fixed bottom-6 right-6 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center z-50 hover:scale-110 active:scale-95 transition-transform"
      >
        <Zap size={28} fill="currentColor" />
      </button>
    </motion.div>
  );
};

export default DashboardHome;
