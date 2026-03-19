import React, { useState } from 'react';
import { Plus, Calendar, CheckCircle, Clock, MoreVertical, FileText, Mic, BarChart2, Search, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Assignments: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'scheduled' | 'past'>('active');

  const assignments = [
    { 
      id: 1, 
      title: 'Unit 1: Vocab Quiz', 
      type: 'quiz', 
      dueDate: 'Today, 4:00 PM', 
      completed: 18, 
      total: 24, 
      avgScore: 88,
      status: 'active',
      icon: FileText,
      color: 'bg-blue-100 text-blue-600'
    },
    { 
      id: 2, 
      title: 'Dubbing: The Lost Hat', 
      type: 'dubbing', 
      dueDate: 'Tomorrow, 9:00 AM', 
      completed: 12, 
      total: 24, 
      avgScore: 92,
      status: 'active',
      icon: Mic,
      color: 'bg-purple-100 text-purple-600'
    },
    { 
      id: 3, 
      title: 'Grammar: Past Simple', 
      type: 'worksheet', 
      dueDate: 'Oct 28, 2023', 
      completed: 5, 
      total: 24, 
      avgScore: 0,
      status: 'active',
      icon: FileText,
      color: 'bg-orange-100 text-orange-600'
    },
    { 
      id: 4, 
      title: 'Unit 1 Review', 
      type: 'quiz', 
      dueDate: 'Oct 20, 2023', 
      completed: 24, 
      total: 24, 
      avgScore: 95,
      status: 'past',
      icon: CheckCircle,
      color: 'bg-green-100 text-green-600'
    }
  ];

  const filteredAssignments = assignments.filter(a => 
    activeTab === 'active' ? a.status === 'active' :
    activeTab === 'past' ? a.status === 'past' : false // Mock logic
  );

  return (
    <div className="flex-1 p-8 overflow-auto bg-slate-50 font-sans">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
          <p className="text-slate-500">Track homework, quizzes, and projects.</p>
        </div>
        <button className="bg-teacher-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all">
           <Plus size={20} /> Create Assignment
        </button>
      </header>

      {/* Tabs & Filters */}
      <div className="flex justify-between items-center mb-6">
         <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200">
            {['active', 'scheduled', 'past'].map(tab => (
               <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${activeTab === tab ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
               >
                  {tab}
               </button>
            ))}
         </div>
         <div className="flex gap-3">
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700">
               <Filter size={18} />
            </button>
         </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         <AnimatePresence mode="popLayout">
         {filteredAssignments.map((item, index) => (
            <motion.div 
               key={item.id} 
               layout
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.9 }}
               transition={{ duration: 0.2, delay: index * 0.05 }}
               className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow group"
            >
               <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.color}`}>
                     <item.icon size={24} />
                  </div>
                  <button className="text-slate-300 hover:text-slate-600">
                     <MoreVertical size={20} />
                  </button>
               </div>
               
               <h3 className="font-bold text-slate-800 text-lg mb-1">{item.title}</h3>
               <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
                  <Calendar size={14} />
                  <span>Due: {item.dueDate}</span>
               </div>

               <div className="space-y-3">
                  <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                     <span>Progress</span>
                     <span>{Math.round((item.completed / item.total) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.completed / item.total) * 100}%` }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className={`h-full rounded-full ${item.status === 'past' ? 'bg-green-500' : 'bg-blue-500'}`} 
                     ></motion.div>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                     <div className="flex -space-x-2">
                        {[1,2,3].map(i => (
                           <div key={i} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-bold text-slate-500">
                              {String.fromCharCode(64 + i)}
                           </div>
                        ))}
                        <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] text-slate-500">
                           +{item.total - 3}
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-xs text-slate-400 font-bold uppercase">Avg Score</div>
                        <div className="font-bold text-slate-800">{item.avgScore > 0 ? `${item.avgScore}%` : '--'}</div>
                     </div>
                  </div>
               </div>

               <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                  <button className="flex-1 py-2 text-sm font-bold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                     Remind All
                  </button>
                  <button className="flex-1 py-2 text-sm font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                     <BarChart2 size={16} /> Stats
                  </button>
               </div>
            </motion.div>
         ))}
         </AnimatePresence>

         {/* Add New Card */}
         <motion.button 
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-slate-400 hover:border-teacher-primary hover:text-teacher-primary hover:bg-emerald-50 transition-all group min-h-[300px]"
         >
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-white group-hover:shadow-sm transition-colors">
               <Plus size={32} />
            </div>
            <span className="font-bold">Create New Assignment</span>
         </motion.button>
      </div>
    </div>
  );
};

export default Assignments;