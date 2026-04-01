import React, { useState, useRef } from 'react';
import { UploadCloud, Check, X, ArrowRight, Loader2, FileText, Trash2, Plus, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Engine } from '../../services/SupabaseService';
import { AIService } from '../../services/AIService';
import { supabase } from '../../services/supabaseClient';
import { useSession } from '../../store/SessionContext';
import ReviewContent from './ReviewContent';
import AIAnalysis from './AIAnalysis';
import * as pdfjsLib from 'pdfjs-dist';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface UploadTextbookProps {
   onFinish?: () => void;
   onBack?: () => void;
}

const UploadTextbook: React.FC<UploadTextbookProps> = ({ onFinish, onBack }) => {
   const { loadUnits, setActiveUnit } = useSession();
   const [isDragging, setIsDragging] = useState(false);
   const [isScanning, setIsScanning] = useState(false);
   const [showReview, setShowReview] = useState(false);
   const [error, setError] = useState<string | null>(null);

   const [files, setFiles] = useState<File[]>([]);
   const fileInputRef = useRef<HTMLInputElement>(null);

   const [scannedBlueprint, setScannedBlueprint] = useState<any>(null);

   const extractTextFromPDF = async (file: File): Promise<string> => {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const textParts: string[] = [];
      
      const maxPages = Math.min(numPages, 10);
      
      for (let i = 1; i <= maxPages; i++) {
         const page = await pdf.getPage(i);
         const textContent = await page.getTextContent();
         const pageText = textContent.items
            .map((item: any) => item.str)
            .filter(str => str.trim().length > 0)
            .join(' ');
         if (pageText) {
            textParts.push(pageText);
         }
      }
      
      return textParts.join('\n\n');
   };

   const uploadFileToStorage = async (file: File): Promise<string> => {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      const { data, error: uploadError } = await supabase.storage
         .from('materials')
         .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
         });
      
      if (uploadError) {
         console.error('Storage upload error:', uploadError);
         throw new Error('Failed to upload file to storage');
      }
      
      const { data: urlData } = supabase.storage
         .from('materials')
         .getPublicUrl(fileName);
      
      return urlData.publicUrl;
   };

   const handleAIComplete = async () => {
      try {
         setIsScanning(true);
         setError(null);
         
         let documentContext = '';
         let uploadedFileUrl = '';
         
         for (const file of files) {
            if (file.type === 'application/pdf') {
               documentContext = await extractTextFromPDF(file);
            } else if (file.type.startsWith('image/')) {
               documentContext = 'Image file uploaded - please analyze and create curriculum based on visual content';
            }
            
            uploadedFileUrl = await uploadFileToStorage(file);
         }
         
          const topic = files[0]?.name.replace(/\.[^/.]+$/, '') || 'Document Summary';
          
          const generated = await AIService.generateLessonContent(topic || "Document Summary", "General", documentContext);
         
         const { data: newUnit, error: unitError } = await supabase
            .from('units')
            .insert({
               title: generated.textContent.title,
               topic: topic,
               level: '3rd Grade',
               status: 'Draft',
               lessons: 1,
               cover_image: generated.imageUrl,
               image_url: generated.imageUrl,
               audio_url: generated.audioUrl,
               flow: [],
               scanned_assets: []
            })
            .select()
            .single();

         if (unitError || !newUnit) {
            throw new Error('Failed to create unit in database');
         }

         if (generated.textContent.vocabulary.length > 0) {
            const srsInserts = generated.textContent.vocabulary.map(vocab => ({
               unit_id: newUnit.id,
               word: vocab.word,
               translation: vocab.definition,
               interval: 0,
               repetition: 0,
               efactor: 2.5
            }));
            await supabase.from('srs_items').insert(srsInserts);
         }

         await loadUnits();
         
         const createdUnit = await Engine.getUnitById(newUnit.id);
         if (createdUnit) {
            await setActiveUnit(createdUnit.id);
         }

         setScannedBlueprint({
            meta: {
               unit_title: generated.textContent.title,
               theme: topic,
               difficulty_cefr: 'A1'
            },
            knowledge_graph: { 
               characters: [], 
               vocabulary: generated.textContent.vocabulary,
               grammar_rules: generated.textContent.grammarRules.map(gr => ({
                  rule: gr.rule,
                  explanation: gr.explanation
               })),
               sentences: generated.textContent.sentences.map(s => ({
                  english: s.original,
                  translation: s.translation
               }))
            },
            timeline: []
         });

         setIsScanning(false);
         setShowReview(true);
         
      } catch (e: any) {
         console.error('AI Generation Error:', e);
         setError(`AI Generation Failed: ${e.message || 'Unknown error'}`);
         setIsScanning(false);
      }
   };

   const resizeAndConvertImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
         const img = new Image();
         img.src = URL.createObjectURL(file);
         img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIMENSION = 1024;
            let width = img.width;
            let height = img.height;

            if (width > height) {
               if (width > MAX_DIMENSION) {
                  height *= MAX_DIMENSION / width;
                  width = MAX_DIMENSION;
               }
            } else {
               if (height > MAX_DIMENSION) {
                  width *= MAX_DIMENSION / height;
                  height = MAX_DIMENSION;
               }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
               ctx.drawImage(img, 0, 0, width, height);
               const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
               resolve(dataUrl);
            } else {
               reject(new Error('Could not get canvas context'));
            }
         };
         img.onerror = () => reject(new Error('Failed to load image'));
      });
   };

   const handlePublish = () => {
      onFinish?.();
   };

   const handleDragEnter = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
   };

   const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setIsDragging(false);
   };

   const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragging(true);
   };

   const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
         const newFiles = Array.from(e.dataTransfer.files);
         setFiles(prev => [...prev, ...newFiles]);
         setError(null);
      }
   };

   const handleBrowseClick = () => {
      fileInputRef.current?.click();
   };

   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
         const newFiles = Array.from(e.target.files);
         setFiles(prev => [...prev, ...newFiles]);
         setError(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

   const removeFile = (index: number) => {
      setFiles(prev => prev.filter((_, i) => i !== index));
   };

   const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
   };

   if (isScanning) {
      return <AIAnalysis onCancel={() => setIsScanning(false)} onComplete={handleAIComplete} />;
   }

   if (showReview && scannedBlueprint) {
      return (
         <ReviewContent 
            onBack={() => {
               setShowReview(false);
               setFiles([]);
            }} 
            onPublish={handlePublish} 
            initialBlueprint={scannedBlueprint} 
         />
      );
   }

   return (
      <motion.div
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -20 }}
         className="flex-1 p-8 overflow-auto flex gap-8"
      >
         <div className="flex-1 max-w-4xl">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                  {onBack && (
                     <button 
                        onClick={onBack}
                        className="text-slate-500 hover:text-slate-700 text-sm font-medium"
                     >
                        ← Back
                     </button>
                  )}
                  <div className={`flex items-center text-sm font-bold text-slate-500`}>
                     <span className="w-8 h-8 rounded-full bg-teacher-primary text-white flex items-center justify-center mr-2">1</span>
                     Upload
                  </div>
                  <div className="w-12 h-0.5 bg-slate-200"></div>
                  <div className={`flex items-center text-sm font-bold text-slate-300`}>
                     <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mr-2">2</span>
                     Processing
                  </div>
                  <div className="w-12 h-0.5 bg-slate-200"></div>
                  <div className="flex items-center text-sm font-bold text-slate-300">
                     <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mr-2">3</span>
                     Review
                  </div>
               </div>
               
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border bg-green-50 text-green-700 border-green-200">
                  <ShieldCheck size={12} />
                  Secure AI Processing
               </div>
            </div>

            <h1 className="text-3xl font-display font-bold text-slate-800 mb-2">Upload Your Teaching Materials</h1>
            <p className="text-slate-500 mb-8">Upload PDF documents or images. The AI will analyze and generate a lesson plan.</p>

            {error && (
               <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertTriangle size={24} />
                  <div>
                     <div className="font-bold">Error</div>
                     <div className="text-sm">{error}</div>
                  </div>
               </div>
            )}

            <div
               className={`border-4 border-dashed rounded-[2rem] min-h-[400px] flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer
               ${isDragging ? 'border-teacher-primary bg-emerald-50 scale-[1.02]' : 'border-slate-200 hover:border-teacher-primary hover:bg-slate-50'}
            `}
               onDragEnter={handleDragEnter}
               onDragLeave={handleDragLeave}
               onDragOver={handleDragOver}
               onDrop={handleDrop}
               onClick={files.length === 0 ? handleBrowseClick : undefined}
            >
               <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".jpg,.jpeg,.png,.pdf"
                  multiple
               />

               {files.length > 0 ? (
                  <div className="w-full h-full p-8 flex flex-col">
                     <div className="flex-1 overflow-y-auto max-h-[320px] space-y-3 pr-2 custom-scrollbar">
                        {files.map((file, index) => (
                           <div key={index} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-slate-200 animate-scale-in group">
                              <div className="flex items-center gap-4 overflow-hidden">
                                 <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center shrink-0">
                                    <FileText size={24} />
                                 </div>
                                 <div className="min-w-0">
                                    <h4 className="font-bold text-slate-700 truncate">{file.name}</h4>
                                    <p className="text-xs text-slate-400">{formatSize(file.size)}</p>
                                 </div>
                              </div>

                              <div className="flex items-center gap-3">
                                 <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                    <Check size={12} strokeWidth={3} /> Ready
                                 </span>
                                 <button
                                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                 >
                                    <Trash2 size={18} />
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>

                     <div className="mt-6 flex justify-center">
                        <button
                           onClick={(e) => { e.stopPropagation(); handleBrowseClick(); }}
                           className="flex items-center gap-2 text-slate-500 font-bold hover:text-teacher-primary transition-colors bg-white/50 px-4 py-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200"
                        >
                           <Plus size={20} /> Add another file
                        </button>
                     </div>
                  </div>
               ) : (
                  <div className="pointer-events-none flex flex-col items-center">
                     <div className="w-24 h-24 bg-white rounded-full shadow-lg flex items-center justify-center mb-6 text-teacher-primary">
                        <UploadCloud size={48} />
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 mb-2">Drag & Drop files here</h3>
                     <p className="text-slate-400 mb-8">or click to browse (PDF, JPG, PNG)</p>

                     <div className="flex gap-3">
                        <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">PDF</span>
                        <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">JPG</span>
                        <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">PNG</span>
                     </div>
                  </div>
               )}
            </div>

            <div className="flex justify-between items-center mt-8">
               <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center font-serif text-[10px]">i</span>
                  Max file size: 10MB per file
               </div>
               <button
                  onClick={handleAIComplete}
                  disabled={files.length === 0}
                  className={`px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-2 transition-all
                 ${files.length > 0
                        ? 'bg-teacher-primary text-white hover:scale-105 shadow-emerald-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
               `}
               >
                  Generate Lesson <ArrowRight size={20} />
               </button>
            </div>
         </div>

         <div className="w-80 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
               <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                  Scanning Tips
               </h3>
               <ul className="space-y-4">
                  <li className="flex gap-3 text-sm text-slate-600">
                     <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><Check size={12} /></div>
                     Use clear, readable scans of textbook pages.
                  </li>
                  <li className="flex gap-3 text-sm text-slate-600">
                     <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><Check size={12} /></div>
                     PDF files work best for text extraction.
                  </li>
                  <li className="flex gap-3 text-sm text-slate-600">
                     <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><Check size={12} /></div>
                     Max 10 pages for optimal processing.
                  </li>
               </ul>
            </div>
         </div>
      </motion.div>
   );
};

export default UploadTextbook;