
import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Check, X, ArrowRight, Loader2, FileText, Trash2, Plus, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Engine } from '../../services/SupabaseService';
import { analyzeTextbookPage, analyzeSyllabus, LessonManifest, validateApiKey } from '../../services/geminiService';
import { useSession } from '../../store/SessionContext';
import ReviewContent from './ReviewContent';
import AIAnalysis from './AIAnalysis';
import * as pdfjsLib from 'pdfjs-dist';
import { motion, AnimatePresence } from 'framer-motion';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface UploadTextbookProps {
   onFinish?: () => void;
}

const UploadTextbook: React.FC<UploadTextbookProps> = ({ onFinish }) => {
   const { loadUnits, setActiveUnit } = useSession();
   const [isDragging, setIsDragging] = useState(false);
   const [isScanning, setIsScanning] = useState(false);
   const [showReview, setShowReview] = useState(false);
   const [error, setError] = useState<string | null>(null);

   // API Status State
   const [apiStatus, setApiStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');

   // Store actual File objects now
   const [files, setFiles] = useState<File[]>([]);
   const fileInputRef = useRef<HTMLInputElement>(null);

   // Store scanned blueprint to pass to review
   const [scannedBlueprint, setScannedBlueprint] = useState<LessonManifest | null>(null);

   // Check API Key on Mount
   useEffect(() => {
      const checkConnection = async () => {
         const result = await validateApiKey();
         setApiStatus(result.valid ? 'valid' : 'invalid');
         if (!result.valid) {
            setError(`API Connection Failed: ${result.message}`);
         }
      };
      checkConnection();
   }, []);

   const startScan = async () => {
      if (files.length === 0) return;
      setError(null);
      setIsScanning(true);
      // The Analysis component runs the visual timer, then calls handleAIComplete
   };

   const convertPdfToImages = async (file: File): Promise<string[]> => {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const images: string[] = [];

      // Limit to max 5 pages for prototype performance
      const maxPages = Math.min(numPages, 5);

      for (let i = 1; i <= maxPages; i++) {
         const page = await pdf.getPage(i);
         const viewport = page.getViewport({ scale: 1.5 });
         const canvas = document.createElement('canvas');
         const ctx = canvas.getContext('2d');

         if (!ctx) throw new Error("Could not create canvas context");

         canvas.width = viewport.width;
         canvas.height = viewport.height;

         await page.render({
            canvasContext: ctx,
            viewport: viewport
         } as any).promise;

         images.push(canvas.toDataURL('image/jpeg', 0.8));
      }

      return images;
   };

   const handleAIComplete = async () => {
      let aiBlueprints: LessonManifest[] = [];

      try {
         let base64Images: string[] = [];
         for (const file of files) {
            if (file.type.startsWith('image/')) {
               base64Images.push(await resizeAndConvertImage(file));
            } else if (file.type === 'application/pdf') {
               const pdfImages = await convertPdfToImages(file);
               base64Images.push(...pdfImages);
            } else {
               throw new Error("Please upload a JPG, PNG image, or PDF file.");
            }
         }

         // Strip prefix for API
         const base64DataArray = base64Images.map(b64 => b64.split(',')[1]);

         if (base64DataArray.length > 1) {
            aiBlueprints = await analyzeSyllabus(base64DataArray);
         } else {
            const singleBlueprint = await analyzeTextbookPage(base64DataArray[0]);
            if (singleBlueprint) aiBlueprints = [singleBlueprint];
         }
      } catch (e: any) {
         console.error("Critical AI Scan Error:", e);
         setError(`AI Scan Failed: ${e.message || "Unknown error"}`);
         setIsScanning(false);
         return;
      }

      if (aiBlueprints.length === 0) {
         setError("The AI could not analyze the provided files. Please try clearer photos.");
         setIsScanning(false);
         return;
      }

      // 2. Create the Units in the Database with the Blueprints
      for (const blueprint of aiBlueprints) {
         await Engine.createUnit(blueprint.meta.unit_title || "New Unit", blueprint);
      }

      // 3. Update Global State
      await loadUnits();

      // 4. Pass the first blueprint to review (or we could build a syllabus review screen)
      // For now, we'll just review the first one, but all are saved.
      const firstBlueprint = aiBlueprints[0];

      // Find the unit id of the first created unit to set as active
      const units = await Engine.fetchUnits();
      const createdUnit = units.find(u => u.title === (firstBlueprint.meta.unit_title || "New Unit"));
      if (createdUnit) {
         await setActiveUnit(createdUnit.id);
      }

      setScannedBlueprint(firstBlueprint);

      // 5. Move to Review Phase
      setIsScanning(false);
      setShowReview(true);
   };

   const resizeAndConvertImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
         const img = new Image();
         img.src = URL.createObjectURL(file);
         img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIMENSION = 1024; // Strict limit to prevent XHR errors
            let width = img.width;
            let height = img.height;

            // Scale down keeping aspect ratio
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
               // Compress to 0.6 JPEG for smaller payload
               const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
               resolve(dataUrl);
            } else {
               reject(new Error("Could not get canvas context"));
            }
         };
         img.onerror = (e) => reject(new Error("Failed to load image"));
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
      return <ReviewContent onBack={() => setShowReview(false)} onPublish={handlePublish} initialBlueprint={scannedBlueprint} />;
   }

   return (
      <motion.div
         initial={{ opacity: 0, y: 20 }}
         animate={{ opacity: 1, y: 0 }}
         exit={{ opacity: 0, y: -20 }}
         className="flex-1 p-8 overflow-auto flex gap-8"
      >
         {/* Main Upload Area */}
         <div className="flex-1 max-w-4xl">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
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

               {/* API Status Badge */}
               <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${apiStatus === 'checking' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                     apiStatus === 'valid' ? 'bg-green-50 text-green-700 border-green-200' :
                        'bg-red-50 text-red-700 border-red-200'
                  }`}>
                  {apiStatus === 'checking' && <Loader2 size={12} className="animate-spin" />}
                  {apiStatus === 'valid' && <ShieldCheck size={12} />}
                  {apiStatus === 'invalid' && <ShieldAlert size={12} />}
                  {apiStatus === 'checking' ? 'Checking AI...' : apiStatus === 'valid' ? 'AI System Ready' : 'System Error'}
               </div>
            </div>

            <h1 className="text-3xl font-display font-bold text-slate-800 mb-2">Let's digitize your textbook</h1>
            <p className="text-slate-500 mb-8">Upload scanned pages or photos. The AI will extract activities automatically.</p>

            {error && (
               <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertTriangle size={24} />
                  <div>
                     <div className="font-bold">System Error</div>
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
                  accept=".jpg,.jpeg,.png"
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
                     <p className="text-slate-400 mb-8">or click to browse your computer (JPG, PNG)</p>

                     <div className="flex gap-3">
                        <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">JPG</span>
                        <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded text-xs font-bold uppercase tracking-wider">PNG</span>
                     </div>
                  </div>
               )}
            </div>

            <div className="flex justify-between items-center mt-8">
               <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center font-serif text-[10px]">i</span>
                  Max file size: 10MB per image
               </div>
               <button
                  onClick={startScan}
                  disabled={files.length === 0 || apiStatus === 'invalid'}
                  className={`px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-2 transition-all
                 ${files.length > 0 && apiStatus === 'valid'
                        ? 'bg-teacher-primary text-white hover:scale-105 shadow-emerald-200'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}
              `}
               >
                  Start AI Scan <ArrowRight size={20} />
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
                     Ensure good lighting and no shadows.
                  </li>
                  <li className="flex gap-3 text-sm text-slate-600">
                     <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><Check size={12} /></div>
                     Keep pages flat.
                  </li>
                  <li className="flex gap-3 text-sm text-slate-600">
                     <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center shrink-0"><Check size={12} /></div>
                     Max resolution 1024px (auto-resized).
                  </li>
               </ul>
            </div>
         </div>
      </motion.div>
   );
};

export default UploadTextbook;
