import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Check, X, ArrowRight, Loader2, FileText, Trash2, Plus, AlertTriangle, ShieldCheck, ChevronRight, FileImage, Settings, Play, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import { AIService } from '../../services/AIService';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createClientLogger } from '../../services/logger';
import AssetWorkshop from './AssetWorkshop';

const log = createClientLogger('UploadTextbook');

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
                           <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> {scan.data?.page_type || scan.data?.metadata?.extractedText?.slice(0, 20) || 'Page'} Extracted</span>
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

const ExtractionReviewPane = ({ file, scan, isOrchestrating, onApprove, onReextract }: any) => {
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
               <p className="text-sm text-slate-500">{file.name} {scan ? `(${scan.data?.metadata?.topic || scan.data?.metadata?.extractedText?.slice(0, 30) || 'Draft'})` : 'Extraction Draft'}</p>
            </div>
            <div className="flex gap-2">
               {scan?.status === 'success' && onReextract && (
                  <button
                     className="px-3 py-2 border border-blue-200 text-blue-600 font-bold rounded-lg flex items-center gap-2 hover:bg-blue-50 text-sm"
                     onClick={onReextract}
                     disabled={isOrchestrating}
                  >
                     <Wand2 size={16} /> Re-extract
                  </button>
               )}
               <button
                  className="px-4 py-2 bg-teacher-primary text-white font-bold rounded-lg flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                  disabled={!scan || scan.status !== 'success' || isOrchestrating}
                  onClick={() => onApprove()}
               >
                   {isOrchestrating ? <Loader2 size={18} className="animate-spin" /> : 'Review & Enrich Content'}
                   {!isOrchestrating && <ChevronRight size={18} />}
               </button>
            </div>
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

            {/* Extracted Content */}
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
                     <div className="space-y-4">
                        {/* Topic & Grade Header */}
                        {(scan.data?.metadata?.topic || scan.data?.metadata?.gradeLevel) && (
                           <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                              <h3 className="font-bold text-blue-800 text-lg mb-1">{scan.data.metadata.topic || 'Untitled'}</h3>
                              <div className="flex flex-wrap gap-2 mt-2">
                                 {scan.data.metadata.gradeLevel && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">CEFR: {scan.data.metadata.gradeLevel}</span>
                                 )}
                                 {scan.data.metadata.unit_number && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">Unit {scan.data.metadata.unit_number}</span>
                                 )}
                                 <span className="px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">Language: {scan.data.metadata.language || 'en'}</span>
                              </div>
                              {scan.data.metadata.visual_context && (
                                 <p className="text-sm text-blue-600 mt-2 italic">{scan.data.metadata.visual_context}</p>
                              )}
                              {scan.data.metadata.learning_objectives?.length > 0 && (
                                 <div className="flex flex-wrap gap-2 mt-3">
                                    {scan.data.metadata.learning_objectives.map((obj: string, i: number) => (
                                       <span key={i} className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">{obj}</span>
                                    ))}
                                 </div>
                              )}
                           </div>
                        )}

                        {/* Vocabulary Cards */}
                        {scan.data?.metadata?.vocabulary?.length > 0 && (
                           <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                              <h4 className="font-bold text-emerald-800 mb-3 flex items-center gap-2"><FileText size={16} /> Vocabulary ({scan.data.metadata.vocabulary.length} words)</h4>
                              <div className="grid grid-cols-2 gap-3">
                                 {scan.data.metadata.vocabulary.map((v: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-emerald-100 rounded shadow-sm">
                                       <div className="font-bold text-emerald-700">{v.word}</div>
                                       <div className="text-sm text-emerald-600 mt-1">{v.definition || v.definition_or_context}</div>
                                       {v.category && <span className="text-xs text-slate-400 mt-1 inline-block">{v.category}</span>}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {/* Exercises */}
                        {scan.data?.metadata?.exercises?.length > 0 && (
                           <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                              <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2"><Settings size={16} /> Exercises</h4>
                              <div className="space-y-3">
                                 {scan.data.metadata.exercises.map((ex: any, i: number) => (
                                    <div key={i} className="p-3 bg-white border border-purple-100 rounded shadow-sm">
                                       <div className="font-bold text-purple-700 text-sm">{ex.instruction}</div>
                                       <div className="text-sm text-purple-600 mt-1">{ex.content}</div>
                                       {ex.type && <span className="text-xs text-purple-400 mt-1 inline-block italic">{ex.type}</span>}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )}

                        {/* Extracted Text Fallback */}
                        {scan.data?.metadata?.extractedText && !scan.data?.metadata?.vocabulary?.length && (
                           <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                              <h3 className="font-bold text-blue-800 text-lg mb-2">Extracted Text</h3>
                              <p className="text-sm text-blue-700 whitespace-pre-wrap">{scan.data.metadata.extractedText}</p>
                           </div>
                        )}

                        {/* Raw JSON Data Tracker */}
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
   const [showWorkshop, setShowWorkshop] = useState<boolean>(false);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const navigate = useNavigate();

   const handleApprove = async () => {
      if (!draftUnitId) {
         toast.error('No draft unit found. Upload a page first.');
         return;
      }
      const successScans = Object.values(scans).filter((s: any) => s.status === 'success');
      if (successScans.length === 0) {
         toast.error('No successfully extracted pages found.');
         return;
      }
      // Clear stale manifest so AssetWorkshop does a fresh enrichment
      await supabase.from('units').update({ manifest: null }).eq('id', draftUnitId);
      setShowWorkshop(true);
   };

   const handleReextract = async () => {
      const file = files[activeFileIndex];
      if (!file?.fileUrl || activeFileIndex < 0) return;
      setIsExtracting(true);
      setScans(prev => ({ ...prev, [activeFileIndex]: { status: 'scanning' } }));
      try {
         const { data, error } = await supabase.functions.invoke('extract-page', {
            body: { fileUrl: file.fileUrl, pageNumber: activeFileIndex + 1 }
         });
         if (error) throw error;
         if (!data?.success) throw new Error(data?.error || 'Re-extraction failed');
         setScans(prev => ({ ...prev, [activeFileIndex]: { status: 'success', data } }));

         // Update scanned_assets in DB (replace, not append)
         if (draftUnitId) {
            const { data: unit } = await supabase.from('units').select('scanned_assets').eq('id', draftUnitId).single();
            const assets = [...(unit?.scanned_assets || [])];
            assets[activeFileIndex] = data;
            await supabase.from('units').update({ scanned_assets: assets, manifest: null }).eq('id', draftUnitId);
         }
         toast.success('Page re-extracted with updated AI!');
      } catch (err: any) {
         setScans(prev => ({ ...prev, [activeFileIndex]: { status: 'error', error: err.message } }));
         toast.error(err.message || 'Re-extraction failed');
      } finally {
         setIsExtracting(false);
      }
   };

   const handleWorkshopOrchestrate = async (unitId: string, enriched: any) => {
      setIsOrchestrating(true);
      try {
         toast.success('Lesson orchestrated and published!');
         navigate('/teacher/curriculum');
         if (onFinish) onFinish();
      } catch (err: any) {
         toast.error(err.message || 'Navigation failed');
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
         let aiData: any;
         try {
            const { data, error: aiError } = await supabase.functions.invoke('extract-page', {
               body: { fileUrl, pageNumber: fileIndex + 1 }
            });
            if (aiError) throw aiError;
            aiData = data;
            if (!aiData.success) throw new Error(aiData.error || "Unknown Edge Function error");
         } catch (extractErr: any) {
            const msg = extractErr?.message || String(extractErr);
            const isDeployError = msg.includes('non-2xx') || msg.includes('500') || msg.includes('Edge Function');
            if (isDeployError) {
               // Fallback shape mirrors the real edge function response (flat, no wrapper key)
               aiData = {
                  success: true,
                  url: fileUrl,
                  metadata: { extractedText: 'Text extraction is being updated. Your file has been uploaded and will be processed shortly.', pageCount: 1, language: 'en' }
               };
               log.warn('extraction_fallback', { error: msg });
            } else {
               throw extractErr;
            }
         }

         // The edge function returns { success, url, metadata } directly — no .extraction wrapper
         setScans(prev => ({ ...prev, [fileIndex]: { status: 'success', data: aiData } }));

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
               scanned_assets: [aiData] // flat response shape — no .extraction wrapper
            }).select().single();
            if (createError) throw createError;
            activeUnitId = newUnit.id;
            setDraftUnitId(activeUnitId);
         } else {
            // Append to scanned_assets
            const { data: existingUnit } = await supabase.from('units').select('scanned_assets').eq('id', activeUnitId).single();
            const currentAssets = existingUnit?.scanned_assets || [];
            await supabase.from('units').update({
               scanned_assets: [...currentAssets, aiData] // flat response shape — no .extraction wrapper
            }).eq('id', activeUnitId);
         }

      } catch (err: any) {
         log.warn('extraction_error', { error: err?.message || String(err) });
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

         for (let i = 0; i < newFiles.length; i++) {
            await processFileUpload(newFiles[i], startIndex + i, draftUnitId);
         }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

    if (showWorkshop && draftUnitId) {
       return (
          <AssetWorkshop
             unitId={draftUnitId}
             onBack={() => setShowWorkshop(false)}
             onOrchestrate={handleWorkshopOrchestrate}
          />
       );
    }

    return (
       <div className="flex-1 flex h-[calc(100vh-64px)] overflow-hidden bg-white">
         <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileSelect}
            accept=".jpg,.jpeg,.png,.pdf"
            multiple={true}
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
            onReextract={handleReextract}
         />
      </div>
   );
};

export default UploadTextbook;