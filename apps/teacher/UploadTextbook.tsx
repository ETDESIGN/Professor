import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Check, X, ArrowRight, Loader2, FileText, Trash2, Plus, AlertTriangle, ShieldCheck, ChevronRight, FileImage, Settings, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import { AIService } from '../../services/AIService';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// Mock components to represent the Workspace
const WorkspaceSidebar = ({ files, scans, activeFileIndex, setActiveFileIndex, onUploadClick, isExtracting }: any) => (
   <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 font-bold text-slate-800 flex justify-between items-center">
         <span>Uploaded Pages</span>
         <button onClick={onUploadClick} className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200" disabled={isExtracting}>
            <Plus size={16} />
         </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
         {files.map((file: any, idx: number) => {
            const scan = scans[idx];
            return (
               <div
                  key={idx}
                  onClick={() => !isExtracting && setActiveFileIndex(idx)}
                  className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition-colors ${activeFileIndex === idx ? 'bg-white border-blue-400 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-100'} ${isExtracting ? 'opacity-50 cursor-not-allowed' : ''}`}
               >
                  <div className={`p-2 rounded ${activeFileIndex === idx ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                     <FileImage size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                     <h4 className="text-sm font-bold text-slate-700 truncate">{file.name}</h4>
                     <div className="flex items-center gap-1 text-xs font-bold mt-1">
                        {scan && scan.status === 'success' ? (
                           <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> {scan.data.page_type} Extracted</span>
                        ) : scan && scan.status === 'scanning' ? (
                           <span className="text-amber-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Scanning...</span>
                        ) : (
                           <span className="text-slate-400">Ready</span>
                        )}
                     </div>
                  </div>
               </div>
            )
         })}

         {files.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">
               No pages uploaded yet.<br />Click + to add.
            </div>
         )}
      </div>
   </div>
);

const ExtractionReviewPane = ({ file, scan, isOrchestrating, onApprove }: any) => {
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
               <p className="text-sm text-slate-500">{file.name} {scan ? `(${scan.data?.page_type || 'Draft'})` : 'Extraction Draft'}</p>
            </div>
            <button
               className="px-4 py-2 bg-teacher-primary text-white font-bold rounded-lg flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
               disabled={!scan || scan.status !== 'success' || isOrchestrating}
               onClick={() => onApprove()}
            >
               {isOrchestrating ? <Loader2 size={18} className="animate-spin" /> : 'Approve & Generate Assets'}
               {!isOrchestrating && <ChevronRight size={18} />}
            </button>
         </div>

         <div className="flex-1 flex overflow-hidden">
            {/* Document Preview */}
            <div className="w-1/2 p-6 bg-slate-100 border-r border-slate-200 flex flex-col">
               <div className="flex-1 bg-white p-4 shadow-md rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300 relative overflow-hidden">
                  {file?.fileUrl ? (
                     <img src={file.fileUrl} alt="document preview" className="max-w-full max-h-full object-contain" />
                  ) : (
                     <div className="text-slate-400 flex flex-col items-center gap-2">
                        <FileImage size={48} className="opacity-50" />
                        <span>Document Preview</span>
                     </div>
                  )}
               </div>
            </div>

            {/* JSON/Text Editor Editor */}
            <div className="w-1/2 bg-white flex flex-col">
               <div className="p-3 border-b flex items-center gap-2 text-sm font-bold text-slate-600 bg-slate-50">
                  <Settings size={16} /> Extracted Content
               </div>
               <div className="flex-1 p-6 overflow-y-auto">
                  {!scan || scan.status === 'scanning' ? (
                     <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                        <Loader2 size={32} className="animate-spin text-teacher-primary" />
                        <p>Extracting data using Agent 1 Vision Scanner...</p>
                     </div>
                  ) : scan.status === 'error' ? (
                     <div className="text-red-500 p-4 bg-red-50 border border-red-200 rounded-lg whitespace-pre-wrap">
                        <strong>Error:</strong> {scan.error}
                     </div>
                  ) : (
                     <div className="space-y-6">
                        {/* Rich Pedagogical Rendering */}
                        {scan.data.pedagogy && (
                           <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                              <h3 className="font-bold text-blue-800 text-lg mb-1">{scan.data.pedagogy.topic || "Unknown Topic"}</h3>
                              <p className="text-sm text-blue-600 mb-3">{scan.data.pedagogy.visual_context}</p>
                              <div className="flex flex-wrap gap-2">
                                 {scan.data.pedagogy.learning_objectives?.map((obj: string, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">{obj}</span>
                                 ))}
                              </div>
                           </div>
                        )}

                        {scan.data.extracted_content?.vocabulary && scan.data.extracted_content.vocabulary.length > 0 && (
                           <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                              <h4 className="font-bold text-emerald-800 mb-3 flex items-center gap-2"><FileText size={16} /> Vocabulary Maps</h4>
                              <div className="grid grid-cols-2 gap-3">
                                 {scan.data.extracted_content.vocabulary.map((v: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-emerald-100 rounded shadow-sm">
                                       <div className="font-bold text-emerald-700">{v.word}</div>
                                       <div className="text-sm text-emerald-600 mt-1">{v.definition_or_context}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {scan.data.extracted_content?.comic_panels && scan.data.extracted_content.comic_panels.length > 0 && (
                           <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                              <h4 className="font-bold text-amber-800 mb-3 flex items-center gap-2"><FileImage size={16} /> Story & Comics</h4>
                              <div className="space-y-4">
                                 {scan.data.extracted_content.comic_panels.map((panel: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-amber-100 rounded shadow-sm">
                                       <div className="text-xs font-bold text-amber-500 uppercase mb-1">Panel {panel.panel_number}</div>
                                       {panel.context && <div className="text-xs text-amber-700 italic mb-2 bg-amber-50 p-1 rounded border border-amber-100">{panel.context}</div>}
                                       <div className="space-y-1">
                                          {panel.dialogues?.map((d: any, j: number) => (
                                             <div key={j} className="text-sm text-amber-900 border-l-2 border-amber-300 pl-2">
                                                <span className="font-bold">{d.character}:</span> {d.text}
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {scan.data.extracted_content?.grammar_boxes && scan.data.extracted_content.grammar_boxes.length > 0 && (
                           <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                              <h4 className="font-bold text-indigo-800 mb-3 flex items-center gap-2"><Settings size={16} /> Grammar & Formulas</h4>
                              <div className="space-y-3">
                                 {scan.data.extracted_content.grammar_boxes.map((box: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-indigo-100 rounded shadow-sm">
                                       <div className="font-bold text-indigo-700 mb-2">{box.title}</div>
                                       <div className="space-y-1 bg-indigo-50 p-2 rounded text-indigo-900 font-mono text-xs">
                                          {box.formulas_and_examples?.map((f: string, j: number) => (
                                             <div key={j}>• {f}</div>
                                          ))}
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {scan.data.extracted_content?.exercises && scan.data.extracted_content.exercises.length > 0 && (
                           <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                              <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2"><Settings size={16} /> Exercises</h4>
                              <div className="space-y-3">
                                 {scan.data.extracted_content.exercises.map((ex: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-purple-100 rounded shadow-sm">
                                       <div className="font-bold text-purple-700 text-sm">{ex.instruction}</div>
                                       <div className="text-sm text-purple-600 mt-1">{ex.content}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                           <h3 className="font-bold text-slate-700 mb-2">Raw JSON Data Tracker</h3>
                           <textarea
                              className="w-full p-3 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                              rows={8}
                              defaultValue={JSON.stringify(scan.data, null, 2)}
                           />
                        </div>
                     </div>
                  )}
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
   const [files, setFiles] = useState<any[]>([]);
   const [scans, setScans] = useState<Record<number, any>>({});
   const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
   const [isExtracting, setIsExtracting] = useState<boolean>(false);
   const [isOrchestrating, setIsOrchestrating] = useState<boolean>(false);
   const [draftUnitId, setDraftUnitId] = useState<string | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const navigate = useNavigate();

   const handleApprove = async () => {
      // Phase A Fix: Surface error instead of silent return
      if (!draftUnitId) {
         toast.error('No draft unit found. Upload a page first.');
         return;
      }
      try {
         setIsOrchestrating(true);
         console.log("Approving unit...", draftUnitId);

         // Phase A Fix: Aggregate ALL successfully scanned pages, not just the current one
         const allAssets = Object.values(scans)
            .filter((s: any) => s.status === 'success')
            .map((s: any) => s.data);

         if (allAssets.length === 0) {
            toast.error('No successfully extracted pages found.');
            setIsOrchestrating(false);
            return;
         }

         await AIService.orchestrateLesson(draftUnitId, allAssets);

         toast.success('Lesson orchestrated and published!');
         navigate('/teacher/curriculum');

         if (onFinish) {
            onFinish();
         }
      } catch (err: any) {
         console.error("Orchestration error:", err);
         toast.error(err.message || "Failed to orchestrate lesson");
      } finally {
         setIsOrchestrating(false);
      }
   };

   const processFileUpload = async (file: File, fileIndex: number, currentDraftId: string | null) => {
      try {
         setIsExtracting(true);
         setScans(prev => ({ ...prev, [fileIndex]: { status: 'scanning' } }));

         // 1. Upload to storage
         const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
         const { error: uploadError } = await supabase.storage.from('materials').upload(fileName, file);
         if (uploadError) throw uploadError;

         const { data: urlData } = supabase.storage.from('materials').getPublicUrl(fileName);
         const fileUrl = urlData.publicUrl;

         setFiles(prev => prev.map((f, i) => i === fileIndex ? { ...f, fileUrl: fileUrl } : f));

         // 2. Invoke extract-page Agent 1 Function
         const { data: aiData, error: aiError } = await supabase.functions.invoke('extract-page', {
            body: { fileUrl, pageNumber: fileIndex + 1 }
         });

         if (aiError) throw aiError;
         if (!aiData.success) throw new Error(aiData.error || "Unknown Edge Function error");

         setScans(prev => ({ ...prev, [fileIndex]: { status: 'success', data: aiData.extraction } }));

         // 3. Save into draft
         let activeUnitId = currentDraftId;
         if (!activeUnitId) {
            // Create draft unit if doesn't exist
            const { data: newUnit, error: createError } = await supabase.from('units').insert({
               title: `Draft Unit ${new Date().toLocaleDateString()}`,
               topic: 'Uploaded Material',
               level: 'General',
               status: 'Draft',
               lessons: 1,
               flow: [],
               scanned_assets: [aiData.extraction]
            }).select().single();
            if (createError) throw createError;
            activeUnitId = newUnit.id;
            setDraftUnitId(activeUnitId);
         } else {
            // Append to scanned_assets
            const { data: existingUnit } = await supabase.from('units').select('scanned_assets').eq('id', activeUnitId).single();
            const currentAssets = existingUnit?.scanned_assets || [];
            await supabase.from('units').update({
               scanned_assets: [...currentAssets, aiData.extraction]
            }).eq('id', activeUnitId);
         }

      } catch (err: any) {
         console.error("Extraction error:", err);
         setScans(prev => ({ ...prev, [fileIndex]: { status: 'error', error: err.message } }));
      } finally {
         setIsExtracting(false);
      }
   };

   const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
         const newFiles = Array.from(e.target.files);
         const startIndex = files.length;

         const newFilesState = [...files, ...newFiles.map(f => ({ file: f, name: f.name, fileUrl: null }))];
         setFiles(newFilesState);

         if (activeFileIndex === -1 && newFiles.length > 0) {
            setActiveFileIndex(startIndex);
         }

         // Process only the first uploaded file in this demo to avoid parallel race condition simplicity issues
         await processFileUpload(newFiles[0], startIndex, draftUnitId);
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
            multiple={false} // Force single file at a time for stability in this phase
         />

         <WorkspaceSidebar
            files={files}
            scans={scans}
            activeFileIndex={activeFileIndex}
            setActiveFileIndex={setActiveFileIndex}
            onUploadClick={() => fileInputRef.current?.click()}
            isExtracting={isExtracting}
         />

         <ExtractionReviewPane
            file={files[activeFileIndex]}
            scan={scans[activeFileIndex]}
            isOrchestrating={isOrchestrating}
            onApprove={handleApprove}
         />
      </div>
   );
};

export default UploadTextbook;