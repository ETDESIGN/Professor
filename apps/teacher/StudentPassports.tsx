import React, { useState } from 'react';
import { ChevronLeft, Search, Filter, Printer, Download, QrCode, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StudentPassportsProps {
  onBack: () => void;
  students: any[];
}

const StudentPassports: React.FC<StudentPassportsProps> = ({ onBack, students }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [hidePins, setHidePins] = useState(false);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map(s => s.id)));
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="font-bold text-slate-800">Student Passports</h1>
            <p className="text-xs text-slate-500">Printable login credentials for Class 3B</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-slate-500 mr-4">
             <span className="font-bold text-slate-800">{selectedIds.size}</span> selected
          </div>
          <button className="px-4 py-2 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 rounded-lg flex items-center gap-2">
            <Download size={16} /> PDF
          </button>
          <button className="px-4 py-2 bg-teacher-primary text-white font-bold text-sm rounded-lg hover:bg-emerald-500 shadow-md shadow-emerald-200 flex items-center gap-2">
            <Printer size={16} /> Print Cards
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="p-6 pb-0">
         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-4 flex-1">
               <div className="relative max-w-md w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                     type="text" 
                     placeholder="Search student..." 
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
               </div>
               <button 
                  onClick={selectAll}
                  className="text-sm font-bold text-slate-600 hover:text-slate-800 whitespace-nowrap"
               >
                  {selectedIds.size === students.length ? 'Deselect All' : 'Select All'}
               </button>
            </div>
            
            <div className="flex items-center gap-4">
               <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer select-none">
                  <input 
                     type="checkbox" 
                     checked={hidePins}
                     onChange={() => setHidePins(!hidePins)}
                     className="rounded border-slate-300 text-teacher-primary focus:ring-teacher-primary"
                  />
                  Hide PINs
               </label>
               <div className="h-6 w-px bg-slate-200"></div>
               <div className="flex items-center gap-2">
                  <Filter size={18} className="text-slate-400" />
                  <select className="bg-transparent border-none text-sm font-bold text-slate-600 focus:ring-0 cursor-pointer">
                     <option>Sort by Name</option>
                     <option>Sort by ID</option>
                  </select>
               </div>
            </div>
         </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
         <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
         >
            <AnimatePresence mode="popLayout">
            {filteredStudents.map((student, index) => {
               const isSelected = selectedIds.has(student.id);
               // Mock a 4-digit PIN based on ID
               const pin = (parseInt(student.id.replace(/\D/g,'')) * 1234).toString().padStart(4, '0').slice(-4);
               
               return (
                  <motion.div 
                     layout
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     transition={{ duration: 0.2, delay: index * 0.05 }}
                     key={student.id}
                     onClick={() => toggleSelection(student.id)}
                     className={`
                        relative bg-white rounded-xl border-2 transition-all cursor-pointer group hover:shadow-lg
                        ${isSelected ? 'border-teacher-primary bg-emerald-50/30' : 'border-slate-200 hover:border-slate-300'}
                     `}
                  >
                     {/* Selection Indicator */}
                     <div className={`absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-teacher-primary border-teacher-primary text-white' : 'border-slate-300 bg-white'}`}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                     </div>

                     <div className="p-6 flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-4xl mb-4 border-4 border-white shadow-sm relative">
                           {student.avatar}
                           <div className="absolute -bottom-1 -right-1 bg-slate-800 text-white p-1.5 rounded-full border-2 border-white">
                              <QrCode size={12} />
                           </div>
                        </div>
                        
                        <h3 className="font-bold text-lg text-slate-800">{student.name}</h3>
                        <p className="text-slate-400 text-xs font-mono mb-4">ID: {student.id.toUpperCase()}</p>
                        
                        <div className="w-full bg-slate-50 rounded-lg p-3 border border-slate-100 mb-4">
                           <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Access PIN</div>
                           <div className="font-mono text-2xl font-bold text-slate-800 tracking-widest">
                              {hidePins ? '••••' : pin}
                           </div>
                        </div>

                        {/* Mock QR */}
                        <div className={`w-32 h-32 bg-white p-2 rounded-lg border border-slate-100 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                           <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=student_login_${student.id}_${pin}`} 
                              alt="QR Code"
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                           />
                        </div>
                     </div>
                  </motion.div>
               );
            })}
            </AnimatePresence>
         </motion.div>
      </div>
    </div>
  );
};

export default StudentPassports;