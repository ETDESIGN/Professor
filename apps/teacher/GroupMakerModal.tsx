
import React, { useState, useEffect } from 'react';
import { X, Shuffle, Check, Users, MonitorUp, RefreshCw } from 'lucide-react';
import { MOCK_STUDENTS } from '../../store/mockData';
import { motion, AnimatePresence } from 'framer-motion';

interface GroupMakerModalProps {
  onClose: () => void;
  onApply: (groups: any[]) => void;
}

const GroupMakerModal: React.FC<GroupMakerModalProps> = ({ onClose, onApply }) => {
  const [groupCount, setGroupCount] = useState(2);
  const [groups, setGroups] = useState<any[][]>([]);
  const [isShuffling, setIsShuffling] = useState(false);

  // Colors for up to 6 groups
  const groupColors = [
    { name: 'Red', bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-700', icon: 'bg-red-100 text-red-600' },
    { name: 'Blue', bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-700', icon: 'bg-blue-100 text-blue-600' },
    { name: 'Green', bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-700', icon: 'bg-green-100 text-green-600' },
    { name: 'Yellow', bg: 'bg-yellow-50', border: 'border-yellow-200', title: 'text-yellow-700', icon: 'bg-yellow-100 text-yellow-600' },
    { name: 'Purple', bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-700', icon: 'bg-purple-100 text-purple-600' },
    { name: 'Orange', bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-700', icon: 'bg-orange-100 text-orange-600' },
  ];

  useEffect(() => {
    shuffleGroups();
  }, [groupCount]);

  const shuffleGroups = () => {
    setIsShuffling(true);
    
    setTimeout(() => {
      const shuffled = [...MOCK_STUDENTS].sort(() => Math.random() - 0.5);
      const newGroups: any[][] = Array.from({ length: groupCount }, () => []);
      
      shuffled.forEach((student, index) => {
        newGroups[index % groupCount].push(student);
      });
      
      setGroups(newGroups);
      setIsShuffling(false);
    }, 500);
  };

  return (
    <AnimatePresence>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
         onClick={onClose}
      />
      <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         transition={{ type: 'spring', damping: 25, stiffness: 300 }}
         className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[85vh]"
      >
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10">
           <div>
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                 <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Users size={24} /></div>
                 Group Generator
              </h2>
              <p className="text-slate-500 text-sm mt-1">Randomly sort students into teams.</p>
           </div>
           <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-500">
              <X size={24} />
           </button>
        </div>

        {/* Controls */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <span className="font-bold text-slate-700 text-sm uppercase tracking-wide">Number of Groups:</span>
              <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                 {[2, 3, 4, 5, 6].map(num => (
                    <button
                       key={num}
                       onClick={() => setGroupCount(num)}
                       className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${groupCount === num ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                       {num}
                    </button>
                 ))}
              </div>
           </div>

           <div className="flex gap-3">
              <button 
                 onClick={shuffleGroups}
                 className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95"
              >
                 <RefreshCw size={18} className={isShuffling ? 'animate-spin' : ''} />
                 Shuffle
              </button>
              <button 
                 onClick={() => { onApply(groups); onClose(); }}
                 className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
              >
                 <MonitorUp size={18} />
                 Project to Board
              </button>
           </div>
        </div>

        {/* Groups Grid */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100/50">
           <div className={`grid gap-6 ${groupCount <= 3 ? 'grid-cols-3' : 'grid-cols-3'}`}>
              {groups.map((group, i) => (
                 <div 
                    key={i} 
                    className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all duration-500 ${isShuffling ? 'opacity-50 scale-95' : 'opacity-100 scale-100'} ${groupColors[i].border}`}
                 >
                    <div className={`px-4 py-3 border-b flex justify-between items-center ${groupColors[i].bg} ${groupColors[i].border}`}>
                       <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${groupColors[i].icon}`}>
                             {String.fromCharCode(65 + i)}
                          </div>
                          <span className={`font-bold text-sm ${groupColors[i].title}`}>{groupColors[i].name} Team</span>
                       </div>
                       <span className="text-xs font-bold text-slate-400 bg-white/50 px-2 py-0.5 rounded-full">
                          {group.length}
                       </span>
                    </div>
                    <div className="p-3 grid grid-cols-1 gap-2">
                       {group.map((student: any) => (
                          <div key={student.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg transition-colors">
                             <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-lg shadow-sm border border-white">
                                {student.avatar}
                             </div>
                             <span className="font-medium text-slate-700 text-sm">{student.name}</span>
                          </div>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        </div>

      </motion.div>
    </div>
    </AnimatePresence>
  );
};

export default GroupMakerModal;
