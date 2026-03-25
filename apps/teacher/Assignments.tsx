import React, { useState, useEffect } from 'react';
import { Plus, Calendar, CheckCircle, Clock, MoreVertical, FileText, Mic, BarChart2, Search, Filter, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getClassAssignments, createAssignment, Assignment, getTeacherClasses, ClassData } from '../../services/DataService';
import { useAppStore } from '../../store/useAppStore';

const Assignments: React.FC = () => {
   const [activeTab, setActiveTab] = useState<'active' | 'scheduled' | 'past'>('active');
   const [assignments, setAssignments] = useState<Assignment[]>([]);
   const [classes, setClasses] = useState<ClassData[]>([]);
   const [loading, setLoading] = useState(true);
   const [showCreateModal, setShowCreateModal] = useState(false);
   const [newAssignment, setNewAssignment] = useState({
      title: '',
      description: '',
      class_id: '',
      due_date: ''
   });
   const { userProfile } = useAppStore();

   useEffect(() => {
      loadData();
   }, [userProfile]);

   const loadData = async () => {
      if (!userProfile?.id) return;

      try {
         setLoading(true);
         const teacherClasses = await getTeacherClasses(userProfile.id);
         setClasses(teacherClasses);

         // Load assignments for all classes
         const allAssignments: Assignment[] = [];
         for (const cls of teacherClasses) {
            const classAssignments = await getClassAssignments(cls.id);
            allAssignments.push(...classAssignments);
         }
         setAssignments(allAssignments);
      } catch (error) {
         console.error('Error loading assignments:', error);
      } finally {
         setLoading(false);
      }
   };

   const handleCreateAssignment = async () => {
      if (!newAssignment.title || !newAssignment.class_id) return;

      try {
         await createAssignment({
            title: newAssignment.title,
            description: newAssignment.description || null,
            class_id: newAssignment.class_id,
            due_date: newAssignment.due_date || null
         });

         setShowCreateModal(false);
         setNewAssignment({ title: '', description: '', class_id: '', due_date: '' });
         loadData(); // Reload assignments
      } catch (error) {
         console.error('Error creating assignment:', error);
      }
   };

   const filteredAssignments = assignments.filter(a => {
      const now = new Date();
      const dueDate = a.due_date ? new Date(a.due_date) : null;

      if (activeTab === 'active') {
         return !dueDate || dueDate >= now;
      } else if (activeTab === 'past') {
         return dueDate && dueDate < now;
      }
      return false;
   });

   return (
      <div className="flex-1 p-8 overflow-auto bg-slate-50 font-sans">
         {/* Header */}
         <header className="flex justify-between items-center mb-8">
            <div>
               <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
               <p className="text-slate-500">Track homework, quizzes, and projects.</p>
            </div>
            <button
               onClick={() => setShowCreateModal(true)}
               className="bg-teacher-primary hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all"
            >
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
               {loading ? (
                  <div className="col-span-full flex items-center justify-center py-12">
                     <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  </div>
               ) : filteredAssignments.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-slate-500">
                     No assignments found. Create your first assignment!
                  </div>
               ) : (
                  filteredAssignments.map((item, index) => (
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
                           <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100 text-blue-600">
                              <FileText size={24} />
                           </div>
                           <button className="text-slate-300 hover:text-slate-600">
                              <MoreVertical size={20} />
                           </button>
                        </div>

                        <h3 className="font-bold text-slate-800 text-lg mb-1">{item.title}</h3>
                        {item.description && (
                           <p className="text-sm text-slate-500 mb-2 line-clamp-2">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
                           <Calendar size={14} />
                           <span>Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'No due date'}</span>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                           <button className="flex-1 py-2 text-sm font-bold text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                              View Details
                           </button>
                           <button className="flex-1 py-2 text-sm font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                              <BarChart2 size={16} /> Stats
                           </button>
                        </div>
                     </motion.div>
                  ))
               )}
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

         {/* Create Assignment Modal */}
         <AnimatePresence>
            {showCreateModal && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                  onClick={() => setShowCreateModal(false)}
               >
                  <motion.div
                     initial={{ scale: 0.9, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     exit={{ scale: 0.9, opacity: 0 }}
                     className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
                     onClick={(e) => e.stopPropagation()}
                  >
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slate-800">Create New Assignment</h2>
                        <button
                           onClick={() => setShowCreateModal(false)}
                           className="text-slate-400 hover:text-slate-600"
                        >
                           <X size={24} />
                        </button>
                     </div>

                     <div className="space-y-4">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Title</label>
                           <input
                              type="text"
                              value={newAssignment.title}
                              onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                              placeholder="e.g., Unit 1 Vocabulary Quiz"
                              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                           />
                        </div>

                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
                           <textarea
                              value={newAssignment.description}
                              onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })}
                              placeholder="Assignment description..."
                              rows={3}
                              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                           />
                        </div>

                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Class</label>
                           <select
                              value={newAssignment.class_id}
                              onChange={(e) => setNewAssignment({ ...newAssignment, class_id: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                           >
                              <option value="">Select a class</option>
                              {classes.map((cls) => (
                                 <option key={cls.id} value={cls.id}>{cls.name}</option>
                              ))}
                           </select>
                        </div>

                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Due Date</label>
                           <input
                              type="datetime-local"
                              value={newAssignment.due_date}
                              onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                           />
                        </div>

                        <div className="flex gap-3 pt-4">
                           <button
                              onClick={() => setShowCreateModal(false)}
                              className="flex-1 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                           >
                              Cancel
                           </button>
                           <button
                              onClick={handleCreateAssignment}
                              disabled={!newAssignment.title || !newAssignment.class_id}
                              className="flex-1 py-2 text-sm font-bold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                              Create Assignment
                           </button>
                        </div>
                     </div>
                  </motion.div>
               </motion.div>
            )}
         </AnimatePresence>
      </div>
   );
};

export default Assignments;