
import React, { useState, useEffect } from 'react';
import { ChevronLeft, Save, Sparkles, Image as ImageIcon, Volume2, Check, X, RefreshCcw, Mic, Play, ArrowRight } from 'lucide-react';
import { useSession } from '../../store/SessionContext';
import { ScannedAsset } from '../../services/SupabaseService';

interface AIAssetEnrichmentProps {
   onBack: () => void;
   onFinish: () => void;
}

const AIAssetEnrichment: React.FC<AIAssetEnrichmentProps> = ({ onBack, onFinish }) => {
   const { state, saveUnit } = useSession();
   const activeUnit = state.activeUnit;

   const [activeTab, setActiveTab] = useState<'vocab' | 'grammar'>('vocab');
   const [items, setItems] = useState<ScannedAsset[]>([]);

   useEffect(() => {
      // Load assets from unit or fallback
      if (activeUnit && activeUnit.scannedAssets && activeUnit.scannedAssets.length > 0) {
         setItems(activeUnit.scannedAssets);
      } else {
         // Only if completely empty, might show empty state
         setItems([]);
      }
   }, [activeUnit?.id]);

   const toggleStatus = (id: string, status: 'approved' | 'rejected' | 'pending') => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
   };

   const handleFinish = async () => {
      if (activeUnit) {
         // Save the approved items back to the unit
         await saveUnit(activeUnit.id, {
            scannedAssets: items,
            status: 'Draft' // Now it's a draft ready for planning
         });
         onFinish();
      }
   };

   const pendingCount = items.filter(i => i.status === 'pending').length;
   const progress = items.length > 0 ? ((items.length - pendingCount) / items.length) * 100 : 0;

   const filteredItems = items.filter(i => {
      if (activeTab === 'vocab') return i.type === 'vocab';
      return i.type !== 'vocab';
   });

   return (
      <div className="flex-1 flex flex-col h-full bg-slate-50 font-sans">
         {/* Header */}
         <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-4">
               <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
                  <ChevronLeft size={20} />
               </button>
               <div>
                  <div className="flex items-center gap-2">
                     <h1 className="font-bold text-slate-800">Enriching: {activeUnit?.title}</h1>
                     <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden ml-2">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                     </div>
                  </div>
                  <p className="text-xs text-slate-500">AI Generated Content Review</p>
               </div>
            </div>
            <div className="flex items-center gap-3">
               <button
                  onClick={handleFinish}
                  className="px-6 py-2 bg-indigo-600 text-white font-bold text-sm rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 flex items-center gap-2"
               >
                  Review & Plan <ArrowRight size={16} />
               </button>
            </div>
         </header>

         {/* Tabs */}
         <div className="bg-white border-b border-slate-200 px-6 flex gap-8">
            <button
               onClick={() => setActiveTab('vocab')}
               className={`py-4 text-sm font-bold border-b-2 transition-colors capitalize ${activeTab === 'vocab' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
               Vocabulary ({items.filter(i => i.type === 'vocab').length})
            </button>
            <button
               onClick={() => setActiveTab('grammar')}
               className={`py-4 text-sm font-bold border-b-2 transition-colors capitalize ${activeTab === 'grammar' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
               Grammar / Other
            </button>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-auto p-8">
            <div className="max-w-4xl mx-auto">
               {filteredItems.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                     <Sparkles size={48} className="mx-auto mb-4 opacity-30" />
                     <p>No items found for this category.</p>
                  </div>
               ) : (
                  <div className="space-y-6">
                     {filteredItems.map((item) => (
                        <div
                           key={item.id}
                           className={`bg-white rounded-xl border-2 shadow-sm transition-all overflow-hidden ${item.status === 'pending' ? 'border-yellow-400' : 'border-slate-200'}`}
                        >
                           <div className="flex">
                              {/* Image Preview Side (only for vocab) */}
                              {item.type === 'vocab' && (
                                 <div className="w-48 bg-slate-100 relative group border-r border-slate-100 flex items-center justify-center text-6xl">
                                    {item.content.image || '📷'}
                                 </div>
                              )}

                              {/* Content Side */}
                              <div className="flex-1 p-6">
                                 <div className="flex justify-between items-start mb-2">
                                    <div>
                                       <h3 className="text-xl font-bold text-slate-800">{item.content.term || item.content.rule}</h3>
                                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.type}</span>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                       {item.status === 'pending' ? <Sparkles size={12} /> : <Check size={12} />}
                                       {item.status}
                                    </div>
                                 </div>

                                 <p className="text-slate-600 text-sm mb-6">{item.content.def || item.content.example}</p>

                                 <div className="flex justify-end gap-3">
                                    {item.status === 'approved' ? (
                                       <button onClick={() => toggleStatus(item.id, 'pending')} className="text-slate-400 text-sm font-bold hover:text-slate-600 underline decoration-slate-300 underline-offset-4">
                                          Undo Approval
                                       </button>
                                    ) : (
                                       <>
                                          <button onClick={() => toggleStatus(item.id, 'rejected')} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center gap-2">
                                             <X size={16} /> Reject
                                          </button>
                                          <button onClick={() => toggleStatus(item.id, 'approved')} className="px-6 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 shadow-md shadow-green-200 flex items-center gap-2">
                                             <Check size={16} strokeWidth={3} /> Approve
                                          </button>
                                       </>
                                    )}
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               )}
            </div>
         </div>
      </div>
   );
};

export default AIAssetEnrichment;
