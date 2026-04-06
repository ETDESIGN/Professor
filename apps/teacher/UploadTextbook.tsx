import React, { useState, useRef } from 'react';
import { UploadCloud, Check, X, ArrowRight, Loader2, FileText, Trash2, Plus, AlertTriangle, ShieldCheck, ChevronRight, FileImage, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

// Mock components to represent the Workspace
const WorkspaceSidebar = ({ files, activeFileIndex, setActiveFileIndex, onUploadClick }: any) => (
   <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
         <span>Uploaded Pages</span>
         <button onClick={onUploadClick} className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200">
            <Plus size={16} />
         </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
         {files.map((file: any, idx: number) => (
            <div
               key={idx}
               onClick={() => setActiveFileIndex(idx)}
               className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-colors ${activeFileIndex === idx ? 'bg-white border-blue-400 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
            >
               <div className={`p-2 rounded ${activeFileIndex === idx ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                  <FileImage size={18} />
               </div>
               <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-700 truncate">{file.name}</h4>
                  <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
                     <Check size={12} /> Extracted
                  </div>
               </div>
            </div>
         ))}

         {files.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">
               No pages uploaded yet.<br />Click + to add.
            </div>
         )}
      </div>
   </div>
);

const ExtractionReviewPane = ({ file }: any) => {
   if (!file) return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
         Select a page from the sidebar to review extraction.
      </div>
   );

   return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
            <div>
               <h2 className="font-bold text-slate-800 text-lg">Stage 2: Review & Edit</h2>
               <p className="text-sm text-slate-500">{file.name} Extraction Draft</p>
            </div>
            <button className="px-4 py-2 bg-teacher-primary text-white font-bold rounded-lg flex items-center gap-2">
               Approve & Generate Assets <ChevronRight size={18} />
            </button>
         </div>

         <div className="flex-1 flex overflow-hidden">
            {/* Mock Image View */}
            <div className="w-1/2 p-6 bg-slate-100 border-r border-slate-200 flex items-center justify-center">
               <div className="bg-white p-4 shadow-md w-full h-full rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300 text-slate-400 flex-col gap-2">
                  <FileImage size={48} className="opacity-50" />
                  <span>Document Preview</span>
               </div>
            </div>

            {/* Mock JSON/Text Editor */}
            <div className="w-1/2 bg-white flex flex-col">
               <div className="p-3 border-b flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-50">
                  <Settings size={16} /> Extracted Content
               </div>
               <div className="flex-1 p-6 overflow-y-auto">
                  <div className="space-y-6">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Detected Zone: Comic Dialogue</label>
                        <textarea
                           className="w-full p-3 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                           rows={4}
                           defaultValue="Character 1: Hello, how are you?&#10;Character 2: I am fine, thank you."
                        />
                     </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Detected Zone: Target Vocabulary</label>
                        <div className="space-y-2">
                           {['Vocabulary Word 1', 'Vocabulary Word 2'].map((v, i) => (
                              <div key={i} className="flex gap-2">
                                 <input type="text" defaultValue={v} className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" />
                                 <input type="text" defaultValue="Definition" className="flex-1 p-2 border border-slate-200 rounded-lg text-sm" />
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};

interface UploadTextbookProps {
   onFinish?: () => void;
   onBack?: () => void;
}

const UploadTextbook: React.FC<UploadTextbookProps> = ({ onFinish, onBack }) => {
   const [files, setFiles] = useState<File[]>([]);
   const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
   const fileInputRef = useRef<HTMLInputElement>(null);

   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
         const newFiles = Array.from(e.target.files);
         setFiles(prev => [...prev, ...newFiles]);
         if (activeFileIndex === -1 && newFiles.length > 0) {
            setActiveFileIndex(0);
         }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

   return (
      <div className="flex-1 flex h-[calc(100vh-64px)] overflow-hidden bg-white">
         <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
         />

         <WorkspaceSidebar
            files={files}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
            onUploadClick={() => fileInputRef.current?.click()}
         />

         <ExtractionReviewPane
            file={files[activeFileIndex]}
         />
      </div>
   );
};

export default UploadTextbook;