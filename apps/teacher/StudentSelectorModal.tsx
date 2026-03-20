
import React, { useState } from 'react';
import { X, Check, Users, User, Star, Zap, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Student {
   id: string;
   name: string;
   avatar: string;
   team?: string;
   points?: number;
}

interface StudentSelectorModalProps {
   students?: Student[];
   onClose: () => void;
   onAward: (studentIds: string[], amount: number) => void;
   onMagicSelect?: (studentId: string) => void;
}

const StudentSelectorModal: React.FC<StudentSelectorModalProps> = ({ students = [], onClose, onAward, onMagicSelect }) => {
   const [view, setView] = useState<'students' | 'teams'>('students');
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

   const toggleSelection = (id: string) => {
      // If magic selecting (picking for wheel), we only select one
      if (selectedIds.has(id)) {
         const newSelected = new Set(selectedIds);
         newSelected.delete(id);
         setSelectedIds(newSelected);
      } else {
         if (onMagicSelect) {
            // If Magic Select mode is available, allow single select or multi select
            // For now, let's stick to standard behavior, but if user hits 'Spin', we use first
            const newSelected = new Set(selectedIds);
            newSelected.add(id);
            setSelectedIds(newSelected);
         } else {
            const newSelected = new Set(selectedIds);
            newSelected.add(id);
            setSelectedIds(newSelected);
         }
      }
   };

   const handleTeamSelect = (team: string) => {
      const teamStudents = students.filter(s => s.team === team).map(s => s.id);
      const newSelected = new Set(selectedIds);
      const allSelected = teamStudents.every(id => newSelected.has(id));

      teamStudents.forEach(id => {
         if (allSelected) newSelected.delete(id);
         else newSelected.add(id);
      });
      setSelectedIds(newSelected);
   };

   return (
      <AnimatePresence>
         <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
            <motion.div
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
               onClick={onClose}
            />

            <motion.div
               initial={{ opacity: 0, y: 100 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 100 }}
               transition={{ type: 'spring', damping: 25, stiffness: 300 }}
               className="bg-white w-full max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto"
            >
               {/* Header */}
               <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                  <h2 className="font-bold text-lg text-slate-800">Select Students</h2>
                  <button onClick={onClose} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                     <X size={20} className="text-slate-600" />
                  </button>
               </div>

               {/* Toggle */}
               <div className="p-4 pb-0">
                  <div className="bg-slate-100 p-1 rounded-xl flex font-bold text-sm">
                     <button
                        onClick={() => setView('students')}
                        className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${view === 'students' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                     >
                        <User size={16} /> Students
                     </button>
                     <button
                        onClick={() => setView('teams')}
                        className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${view === 'teams' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                     >
                        <Users size={16} /> Teams
                     </button>
                  </div>
               </div>

               {/* Content */}
               <div className="flex-1 overflow-y-auto p-4">
                  {view === 'students' ? (
                     <div className="grid grid-cols-4 gap-4">
                        {(students || []).map(student => {
                           const isSelected = selectedIds.has(student.id);
                           return (
                              <button
                                 key={student.id}
                                 onClick={() => toggleSelection(student.id)}
                                 className={`flex flex-col items-center gap-1 group relative transition-transform active:scale-95`}
                              >
                                 <div className={`
                             w-16 h-16 rounded-full flex items-center justify-center text-3xl border-4 transition-all
                             ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50 group-hover:border-slate-200'}
                          `}>
                                    {student.avatar}
                                    {isSelected && (
                                       <div className="absolute top-0 right-0 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-white">
                                          <Check size={12} className="text-white" strokeWidth={3} />
                                       </div>
                                    )}
                                 </div>
                                 <span className={`text-xs font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-600'}`}>
                                    {student.name}
                                 </span>
                              </button>
                           );
                        })}
                     </div>
                  ) : (
                     <div className="space-y-4">
                        {['red', 'blue'].map(team => {
                           const teamStudents = (students || []).filter(s => s.team === team);
                           const isFullySelected = teamStudents.every(s => selectedIds.has(s.id));

                           return (
                              <button
                                 key={team}
                                 onClick={() => handleTeamSelect(team)}
                                 className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all
                             ${team === 'red' ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}
                             ${isFullySelected ? (team === 'red' ? 'ring-2 ring-red-500' : 'ring-2 ring-blue-500') : ''}
                          `}
                              >
                                 <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl ${team === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}>
                                       {team === 'red' ? 'R' : 'B'}
                                    </div>
                                    <div className="text-left">
                                       <div className={`font-bold uppercase tracking-wider ${team === 'red' ? 'text-red-700' : 'text-blue-700'}`}>
                                          Team {team}
                                       </div>
                                       <div className="text-xs opacity-60 font-bold text-slate-800">
                                          {teamStudents.length} Students
                                       </div>
                                    </div>
                                 </div>
                                 {isFullySelected && (
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${team === 'red' ? 'bg-red-500' : 'bg-blue-500'}`}>
                                       <Check size={16} className="text-white" />
                                    </div>
                                 )}
                              </button>
                           );
                        })}
                     </div>
                  )}
               </div>

               {/* Action Bar */}
               {selectedIds.size > 0 && (
                  <div className="p-4 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-20">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex -space-x-2">
                           {Array.from(selectedIds).slice(0, 3).map(id => {
                              const s = (students || []).find(st => st?.id === id);
                              return (
                                 <div key={id} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-sm">
                                    {s?.avatar}
                                 </div>
                              );
                           })}
                           {selectedIds.size > 3 && (
                              <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                                 +{selectedIds.size - 3}
                              </div>
                           )}
                        </div>
                        <div className="text-sm font-bold text-slate-500">
                           {selectedIds.size} Selected
                        </div>
                     </div>

                     <div className="grid grid-cols-4 gap-2">
                        <button
                           onClick={() => onAward(Array.from(selectedIds), 10)}
                           className="col-span-1 flex flex-col items-center justify-center gap-1 bg-emerald-100 text-emerald-700 p-2 rounded-xl hover:bg-emerald-200 transition-colors"
                        >
                           <Star size={20} className="fill-emerald-600 text-emerald-600" />
                           <span className="text-[10px] font-bold">+10</span>
                        </button>
                        <button
                           onClick={() => onAward(Array.from(selectedIds), 50)}
                           className="col-span-1 flex flex-col items-center justify-center gap-1 bg-yellow-100 text-yellow-700 p-2 rounded-xl hover:bg-yellow-200 transition-colors"
                        >
                           <Zap size={20} className="fill-yellow-500 text-yellow-500" />
                           <span className="text-[10px] font-bold">+50</span>
                        </button>
                        {onMagicSelect && selectedIds.size === 1 && (
                           <button
                              onClick={() => onMagicSelect(Array.from(selectedIds)[0])}
                              className="col-span-2 flex items-center justify-center gap-2 bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-lg"
                           >
                              <RotateCw size={20} />
                              <span className="text-xs font-bold">Spin For</span>
                           </button>
                        )}
                     </div>
                  </div>
               )}
            </motion.div>
         </div>
      </AnimatePresence>
   );
};

export default StudentSelectorModal;
