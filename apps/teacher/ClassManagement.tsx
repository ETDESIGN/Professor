
import React, { useState, useEffect } from 'react';
import {
   Search, Grid, List, Printer, Upload, MoreHorizontal,
   User, CheckCircle, AlertCircle, X, ExternalLink, Mail, Trash2,
   Copy, Download, Plus, Users, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Engine } from '../../services/SupabaseService';
import { getTeacherClasses, createClass, getTeacherStudents } from '../../services/DataService';
import { useAppStore } from '../../store/useAppStore';
import StudentPassports from './StudentPassports';

const ClassManagement: React.FC = () => {
   const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
   const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
   const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
   const [showPassports, setShowPassports] = useState(false);
   const [students, setStudents] = useState<any[]>([]);
   const [classes, setClasses] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [showCreateClass, setShowCreateClass] = useState(false);
   const [newClassName, setNewClassName] = useState('');
   const [newClassSubject, setNewClassSubject] = useState('');
   const [newClassCode, setNewClassCode] = useState('');
   const { userProfile } = useAppStore();

   useEffect(() => {
      loadData();
   }, [userProfile]);

   const loadData = async () => {
      setIsLoading(true);
      // Load classes for this teacher
      if (userProfile?.id) {
         const teacherClasses = await getTeacherClasses(userProfile.id);
         setClasses(teacherClasses);
         // Load students from these classes
         const classStudents = await getTeacherStudents(userProfile.id);
         setStudents(classStudents);
      }
      setIsLoading(false);
   };

   const handleCreateClass = async () => {
      if (!newClassName.trim() || !userProfile?.id) return;

      try {
         const newClass = await createClass(userProfile.id, {
            name: newClassName,
            subject: newClassSubject,
            is_active: true
         });
         setClasses([...classes, newClass]);
         setNewClassName('');
         setNewClassSubject('');
         setNewClassCode(newClass.code || '');
         setShowCreateClass(true); // Show the code
      } catch (error) {
         console.error('Error creating class:', error);
      }
   };

   const copyClassCode = (code: string) => {
      navigator.clipboard.writeText(code);
   };

   if (showPassports) {
      return <StudentPassports onBack={() => setShowPassports(false)} students={students} />;
   }

   const toggleSelection = (id: string) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      setSelectedIds(newSelected);
   };

   const handleAddStudent = async () => {
      const newStudent = {
         name: 'New Student',
         avatar: '😊',
         points: 0,
         level: 1,
         team: Math.random() > 0.5 ? 'red' : 'blue'
      };
      const added = await Engine.addStudent(newStudent);
      setStudents([...students, added]);
   };

   const handleRemoveStudent = async (id: string) => {
      await Engine.removeStudent(id);
      setStudents(students.filter(s => s.id !== id));
      if (selectedStudentId === id) setSelectedStudentId(null);
   };

   const selectedStudent = students.find(s => s.id === selectedStudentId);

   return (
      <div className="flex-1 flex overflow-hidden bg-slate-50">
         {/* Main Content */}
         <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Header & Stats */}
            <div className="p-8 pb-4">
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <h1 className="text-2xl font-bold text-slate-800">Class Management</h1>
                     <p className="text-slate-500">Manage roster, parents, and passports for Class 3B</p>
                  </div>
                  <div className="flex gap-3">
                     <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg hover:bg-slate-50 font-medium shadow-sm">
                        <Upload size={18} /> Import CSV
                     </button>
                     <button
                        onClick={handleAddStudent}
                        className="flex items-center gap-2 px-4 py-2 bg-teacher-primary text-white rounded-lg hover:bg-emerald-500 font-bold shadow-md shadow-emerald-200"
                     >
                        <User size={18} /> Add Student
                     </button>
                  </div>
               </div>

               {/* Stats Overview */}
               <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="text-slate-500 text-sm font-bold uppercase mb-1">Total Students</div>
                     <div className="text-3xl font-bold text-slate-800">{students.length}</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="text-slate-500 text-sm font-bold uppercase mb-1">Active Parents</div>
                     <div className="text-3xl font-bold text-slate-800 flex items-center gap-2">
                        18 <span className="text-sm font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">75%</span>
                     </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                     <div className="text-slate-500 text-sm font-bold uppercase mb-1">Avg. XP Level</div>
                     <div className="text-3xl font-bold text-slate-800">Lvl 5</div>
                  </div>
               </div>

               {/* Toolbar */}
               <div className="flex items-center gap-4 mb-4 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex-1 relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input
                        type="text"
                        placeholder="Search student name..."
                        className="w-full pl-10 pr-4 py-2 text-sm outline-none bg-transparent"
                     />
                  </div>
                  <div className="w-px h-6 bg-slate-200"></div>
                  <div className="flex items-center gap-1">
                     <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded ${viewMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                        <Grid size={18} />
                     </button>
                     <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                        <List size={18} />
                     </button>
                  </div>
                  <button
                     onClick={() => setShowPassports(true)}
                     className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 transition-colors"
                  >
                     <Printer size={16} /> Print Passports
                  </button>
               </div>
            </div>

            {/* Table List */}
            <div className="flex-1 overflow-auto px-8 pb-8">
               <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                     <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                        <tr>
                           <th className="p-4 w-12 text-center">
                              <input type="checkbox" className="rounded border-slate-300 text-teacher-primary focus:ring-teacher-primary" />
                           </th>
                           <th className="p-4">Student</th>
                           <th className="p-4">ID</th>
                           <th className="p-4">Status</th>
                           <th className="p-4 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        <AnimatePresence>
                           {students.map((student, index) => (
                              <motion.tr
                                 key={student.id}
                                 initial={{ opacity: 0, y: 10 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 exit={{ opacity: 0, scale: 0.95 }}
                                 transition={{ delay: index * 0.05 }}
                                 onClick={() => setSelectedStudentId(student.id)}
                                 className={`
                           group cursor-pointer transition-colors hover:bg-slate-50
                           ${selectedStudentId === student.id ? 'bg-emerald-50 hover:bg-emerald-50 border-l-4 border-l-teacher-primary' : 'border-l-4 border-l-transparent'}
                         `}
                              >
                                 <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                    <input
                                       type="checkbox"
                                       checked={selectedIds.has(student.id)}
                                       onChange={() => toggleSelection(student.id)}
                                       className="rounded border-slate-300 text-teacher-primary focus:ring-teacher-primary"
                                    />
                                 </td>
                                 <td className="p-4">
                                    <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-2xl border border-slate-200">
                                          {student.avatar}
                                       </div>
                                       <div>
                                          <div className="font-bold text-slate-800">{student.name}</div>
                                          <div className="text-xs text-slate-400">Level {student.level}</div>
                                       </div>
                                    </div>
                                 </td>
                                 <td className="p-4 font-mono text-sm text-slate-500">
                                    #{student.id.toUpperCase().padStart(6, '0')}
                                 </td>
                                 <td className="p-4">
                                    {parseInt(student.id.replace(/\D/g, '') || '0') % 2 === 0 ? (
                                       <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                          <CheckCircle size={12} /> Connected
                                       </span>
                                    ) : (
                                       <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                                          <AlertCircle size={12} /> Pending
                                       </span>
                                    )}
                                 </td>
                                 <td className="p-4 text-right">
                                    <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                       <MoreHorizontal size={18} />
                                    </button>
                                 </td>
                              </motion.tr>
                           ))}
                        </AnimatePresence>
                     </tbody>
                  </table>
               </div>
            </div>
         </div>

         {/* Detail Sidebar */}
         {selectedStudent && (
            <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-xl animate-slide-in-right relative z-20">
               <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                  <h3 className="font-bold text-lg text-slate-800">Student Profile</h3>
                  <button onClick={() => setSelectedStudentId(null)} className="text-slate-400 hover:text-slate-600">
                     <X size={20} />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Profile Header */}
                  <div className="flex flex-col items-center text-center">
                     <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-6xl mb-4 border-4 border-white shadow-lg">
                        {selectedStudent.avatar}
                     </div>
                     <h2 className="text-2xl font-bold text-slate-800">{selectedStudent.name}</h2>
                     <div className="text-slate-500 font-mono text-sm mb-6">ID: #{selectedStudent.id.toUpperCase().padStart(6, '0')}</div>

                     <div className="grid grid-cols-3 gap-2 w-full">
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <div className="text-xs text-slate-400 font-bold uppercase">Points</div>
                           <div className="font-bold text-teacher-primary">{selectedStudent.points}</div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <div className="text-xs text-slate-400 font-bold uppercase">Level</div>
                           <div className="font-bold text-blue-500">{selectedStudent.level}</div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                           <div className="text-xs text-slate-400 font-bold uppercase">Team</div>
                           <div className={`font-bold capitalize ${selectedStudent.team === 'red' ? 'text-red-500' : 'text-blue-500'}`}>
                              {selectedStudent.team}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Parent Connection */}
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                     <h4 className="font-bold text-blue-900 text-sm mb-3 flex items-center gap-2">
                        <ExternalLink size={16} /> Parent Connection
                     </h4>
                     <div className="text-xs text-blue-700 mb-3">Share this magic link with the parent to connect accounts.</div>
                     <div className="flex gap-2">
                        <input type="text" value="https://app.school.com/join/xyz" readOnly className="flex-1 text-xs px-2 py-1.5 rounded border border-blue-200 bg-white text-slate-600" />
                        <button className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700">
                           <Copy size={14} />
                        </button>
                     </div>
                  </div>

                  {/* Passport */}
                  <div className="border border-slate-200 rounded-xl p-4">
                     <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-slate-800 text-white rounded flex items-center justify-center">
                           <span className="font-mono font-bold text-xs">QR</span>
                        </div>
                        <div>
                           <div className="font-bold text-slate-800 text-sm">Login Passport</div>
                           <div className="text-xs text-slate-400">PIN: 4829</div>
                        </div>
                     </div>
                     <button className="w-full mt-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 py-2 rounded hover:bg-slate-100">
                        <Download size={14} /> Download PDF
                     </button>
                  </div>
               </div>

               <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
                  <button className="w-full flex items-center justify-center gap-2 text-slate-600 bg-white border border-slate-200 py-2 rounded-lg font-bold text-sm hover:bg-slate-50">
                     <Mail size={16} /> Email Parent
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                     <button
                        onClick={() => { }}
                        className="w-full flex items-center justify-center gap-2 text-orange-600 hover:bg-orange-50 bg-white border border-orange-200 py-2 rounded-lg font-bold text-sm transition-colors"
                     >
                        Reset Progress
                     </button>
                     <button
                        onClick={() => handleRemoveStudent(selectedStudent.id)}
                        className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 bg-white border border-red-200 py-2 rounded-lg font-bold text-sm transition-colors"
                     >
                        <Trash2 size={16} /> Remove
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
};

export default ClassManagement;
