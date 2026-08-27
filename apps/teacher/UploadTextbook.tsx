import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Loader2, FileText, Plus, ChevronRight, FileImage, AlertTriangle, X } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getOrCreateDefaultBookForCurrentUser, listBooks, createBook, Book } from '../../services/BookService';
import { useBookScan } from '../../hooks/useBookScan';
import ExtractionReview from './ExtractionReview';
import UnitizationEditor from './UnitizationEditor';

// FIXPLAN_F P2.3 — new-flow upload (doc 10 §4, owner decision 2026-08-26:
// hard switch for new uploads; legacy units keep the old read path).
//
//   select files (images / PDF → rasterized per page)
//     → draft unit created UPFRONT (book selector honored)
//     → scan-page per page (parallel, server-side persistence)
//     → ExtractionReview (✕ / ➕ / low-confidence highlights)
//     → Confirm batch → UnitizationEditor (FIXPLAN_G: split the book into
//       units — automatic proposal, teacher authority)
//     → created units are ready-to-enrich DRAFTS; enrichment runs only when
//       the teacher opens a unit (owner decision #7 — never auto-start)
//
// The old extract-page/scanned_assets machinery is no longer used here; the
// edge function stays deployed until P4 rebuild completes (then removed).

interface UploadTextbookProps {
   onFinish?: () => void;
   onBack?: () => void;
}

const UploadTextbook: React.FC<UploadTextbookProps> = ({ onFinish, onBack }) => {
   const [draftUnitId, setDraftUnitId] = useState<string | null>(null);
   const [unitTitle, setUnitTitle] = useState<string>('');
   const [creatingUnit, setCreatingUnit] = useState(false);
   const [showUnitization, setShowUnitization] = useState(false);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const navigate = useNavigate();

   const { pages, scanning, errors, dismissErrors, scanFiles, ...scanStateRest } = useBookScan(draftUnitId);
   // Single hook instance for the whole flow — ExtractionReview receives it
   // via scanState so it shows LIVE progress (a second instance never
   // refreshes; that was the invisible-success bug).
   const scanState = { pages, scanning, errors, dismissErrors, scanFiles, ...scanStateRest };

   // ── Book selector (Unit & Book Manager): uploaded units land in the chosen
   //    book; empty selection = default book ("My Units"). ────────────────────
   const [books, setBooks] = useState<Book[]>([]);
   const [selectedBookId, setSelectedBookId] = useState<string>('');
   const [newBookTitle, setNewBookTitle] = useState<string>('');
   const [creatingBook, setCreatingBook] = useState<boolean>(false);

   useEffect(() => {
      listBooks()
         .then((bs) => setBooks(bs.filter((b) => b.owner_id)))
         .catch(() => { /* non-fatal — default book path still works */ });
   }, []);

   const handleCreateBookInline = async () => {
      if (!newBookTitle.trim()) return;
      setCreatingBook(true);
      try {
         const created = await createBook(newBookTitle);
         setBooks((prev) => [...prev, created]);
         setSelectedBookId(created.id);
         setNewBookTitle('');
         toast.success(`Book "${created.title}" created`);
      } catch (err: any) {
         toast.error(`Could not create book: ${err?.message || err}`);
      } finally {
         setCreatingBook(false);
      }
   };

   /** Draft unit is created UPFRONT so every scan-page call persists
    *  server-side against a real unit (kills the old per-page
    *  scanned_assets read-modify-write race entirely). */
   const ensureDraftUnit = async (): Promise<string | null> => {
      if (draftUnitId) return draftUnitId;
      setCreatingUnit(true);
      try {
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) {
            throw new Error('Your session expired — please sign in again before uploading.');
         }
         const targetBook = selectedBookId
            ? { id: selectedBookId }
            : await getOrCreateDefaultBookForCurrentUser();
         let nextOrderIndex = 0;
         if (targetBook?.id) {
            const { count } = await supabase
               .from('units')
               .select('id', { count: 'exact', head: true })
               .eq('book_id', targetBook.id);
            nextOrderIndex = count ?? 0;
         }
         const title = `Draft Unit ${new Date().toLocaleDateString()}`;
         const { data: newUnit, error: createError } = await supabase.from('units').insert({
            title,
            topic: 'Uploaded Material',
            level: 'General',
            status: 'Draft',
            lessons: 1,
            flow: [],
            teacher_id: user.id,
            book_id: targetBook?.id ?? null,
            order_index: nextOrderIndex,
            scanned_assets: [], // new flow: pages live in book_pages, not here
         }).select().single();
         if (createError) throw createError;
         setDraftUnitId(newUnit.id);
         setUnitTitle(title);
         return newUnit.id;
      } catch (err: any) {
         toast.error(err?.message || 'Could not create the draft unit.');
         return null;
      } finally {
         setCreatingUnit(false);
      }
   };

   const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const newFiles = Array.from(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const unitId = await ensureDraftUnit();
      if (!unitId) return;
      // FIXPLAN H3 (stale closure): read the scan result from scanFiles' return
      // value — the `pages` state in THIS closure still holds the pre-scan
      // snapshot (setState during the await doesn't update this scope).
      const scannedPages = (await scanFiles(unitId, newFiles)) || [];

      // Default the unit title to the opener's printed title when the book
      // provides one (doc 10 §5; teacher can rename anytime).
      const titled = scannedPages.find((p: any) => p.printed_title?.trim());
      if (titled?.printed_title) {
         const t = titled.printed_title.trim();
         setUnitTitle(t);
         supabase.from('units').update({ title: t }).eq('id', unitId).then(() => undefined, () => undefined);
      }
   };

   if (showUnitization && draftUnitId) {
      return (
         <UnitizationEditor
            sourceUnitId={draftUnitId}
            onBack={() => setShowUnitization(false)}
            onDone={() => {
               // Created units are ready-to-enrich drafts in the library —
               // enrichment runs when the teacher opens each unit (decision #7).
               navigate('/teacher/units');
               if (onFinish) onFinish();
            }}
         />
      );
   }

   const hasPages = pages.length > 0 || scanning;

   return (
      <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-white">
         {/* Book selector bar (Unit & Book Manager) */}
         <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
            <span className="text-sm font-bold text-slate-600 flex items-center gap-1.5">
               <FileText size={14} /> Save unit to book:
            </span>
            <select
               value={selectedBookId}
               onChange={(e) => setSelectedBookId(e.target.value)}
               disabled={!!draftUnitId}
               className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[240px] disabled:text-slate-400"
               title="Uploaded pages become a unit inside this book"
            >
               <option value="">My Units (default)</option>
               {books.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}</option>
               ))}
            </select>
            {!draftUnitId && (
               <>
                  <input
                     value={newBookTitle}
                     onChange={(e) => setNewBookTitle(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBookInline(); }}
                     placeholder="＋ New book…"
                     className="text-sm border border-dashed border-slate-300 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  {newBookTitle.trim() && (
                     <button
                        onClick={handleCreateBookInline}
                        disabled={creatingBook}
                        className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-50 flex items-center gap-1.5"
                     >
                        {creatingBook ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                     </button>
                  )}
               </>
            )}
         </div>

         {errors.length > 0 && (
            <div className="mx-4 mt-3 p-3 rounded-lg border border-red-300 bg-red-50 flex items-start gap-3">
               <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
               <div className="flex-1 text-sm text-red-700 space-y-1">
                  {errors.map((e, i) => <div key={i} className="font-medium break-words">{e}</div>)}
               </div>
               <button onClick={dismissErrors} className="p-1 text-red-400 hover:text-red-600 rounded" title="Dismiss">
                  <X size={16} />
               </button>
            </div>
         )}

         {hasPages && draftUnitId ? (
            <ExtractionReview
               unitId={draftUnitId}
               unitTitle={unitTitle || 'this unit'}
               scanState={scanState}
               onConfirm={() => setShowUnitization(true)}
            />
         ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-8">
               <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".jpg,.jpeg,.png,.pdf"
                  multiple={true}
               />
               <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={creatingUnit}
                  className="w-full max-w-xl border-4 border-dashed border-slate-300 rounded-3xl p-14 flex flex-col items-center gap-4 text-slate-400 hover:border-teacher-primary hover:text-teacher-primary transition-colors disabled:opacity-50"
               >
                  {creatingUnit ? (
                     <Loader2 size={56} className="animate-spin" />
                  ) : (
                     <UploadCloud size={56} strokeWidth={1.2} />
                  )}
                  <span className="text-xl font-extrabold">Upload textbook pages</span>
                  <span className="text-sm">Photos of pages, or a whole PDF — each page is scanned and transcribed exactly as printed.</span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                     <FileImage size={13} /> JPG, PNG or PDF · multiple files at once
                  </span>
               </button>
            </div>
         )}
      </div>
   );
};

export default UploadTextbook;
