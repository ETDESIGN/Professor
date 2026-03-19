
import React, { useState, useEffect } from 'react';
import {
   ChevronLeft, Save, Play, Search, Image as ImageIcon, Music,
   MoreVertical, Plus, Wand2, X, Move, Eye, Loader2, FileText,
   Sparkles, Layers, Clock, AlertCircle, CheckCircle2, MonitorPlay,
   BrainCircuit, Users, BookOpen
} from 'lucide-react';
import { generateSong, generateImage } from '../../services/geminiService';
import { useSession } from '../../store/SessionContext';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';

interface LessonStudioProps {
   onLaunchLive?: () => void;
}

type BlockType = 'MEDIA_PLAYER' | 'FOCUS_CARDS' | 'GRAMMAR_BOARD' | 'GAME_ARENA' | 'STORY_STAGE' | 'INPUT' | 'PRACTICE' | 'ASSESSMENT' | 'GAP';

interface TimelineBlock {
   id: string;
   type: BlockType;
   title: string;
   duration: number;
   assetType: 'audio' | 'image' | 'text' | 'game';
   status: 'ready' | 'review' | 'generating';
   data?: any;
}

const LessonStudio: React.FC<LessonStudioProps> = ({ onLaunchLive }) => {
   const { state, saveUnit } = useSession();
   const activeUnit = state.activeUnit;

   const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
   const [inspectorTab, setInspectorTab] = useState<'preview' | 'edit' | 'ai'>('preview');
   const [viewMode, setViewMode] = useState<'timeline' | 'knowledge'>('timeline'); // New Toggle

   const [songPrompt, setSongPrompt] = useState('');
   const [isGenerating, setIsGenerating] = useState(false);
   const [isSaving, setIsSaving] = useState(false);

   const [timeline, setTimeline] = useState<TimelineBlock[]>([]);
   const [editableVocab, setEditableVocab] = useState<any[]>([]);

   // Initialize Timeline from Manifest
   useEffect(() => {
      if (activeUnit) {
         if (activeUnit.manifest?.knowledge_graph?.vocabulary) {
            setEditableVocab(activeUnit.manifest.knowledge_graph.vocabulary);
         }
         if (activeUnit.manifest && activeUnit.manifest.timeline.length > 0) {
            // New Manifest-based hydration
            const blocks: TimelineBlock[] = activeUnit.manifest.timeline.map((item, idx) => {
               let assetType: TimelineBlock['assetType'] = 'text';
               if (item.type === 'MEDIA_PLAYER') assetType = 'audio';
               else if (item.type === 'FOCUS_CARDS') assetType = 'image';
               else if (item.type === 'GAME_ARENA') assetType = 'game';

               return {
                  id: `ai_${idx}`,
                  type: item.type as BlockType,
                  title: item.title,
                  duration: item.duration || 5,
                  assetType: assetType,
                  status: 'review',
                  data: item.config // Map 'config' to 'data'
               };
            });
            setTimeline(blocks);
            if (blocks.length > 0) setActiveBlockId(blocks[0].id);
         }
         // ... existing legacy fallback logic ...
         else if (activeUnit.flow && activeUnit.flow.length > 0) {
            const mappedFlow: TimelineBlock[] = activeUnit.flow.map((item: any, idx: number) => ({
               id: item.id || `step_${idx}`,
               type: item.type as BlockType,
               title: item.title,
               duration: item.duration ? Math.round(item.duration / 60) : 5,
               assetType: 'text',
               status: 'ready',
               data: item.data
            }));
            setTimeline(mappedFlow);
            if (mappedFlow.length > 0) setActiveBlockId(mappedFlow[0].id);
         }
      }
   }, [activeUnit?.id]);

   const activeBlock = timeline.find(b => b.id === activeBlockId);
   const totalDuration = timeline.reduce((acc, b) => acc + (b.type !== 'GAP' ? b.duration : 0), 0);

   const handleGenerateSong = async () => {
      if (!songPrompt || !activeBlockId) return;
      setIsGenerating(true);
      const result = await generateSong(songPrompt);
      setIsGenerating(false);
      if (result) {
         updateBlock(activeBlockId, {
            title: `Song: ${result.title}`,
            data: { ...activeBlock?.data, lyrics: result.lyrics, title: result.title },
            status: 'ready'
         });
         setInspectorTab('preview');
      }
   };

   const updateBlock = (id: string, updates: Partial<TimelineBlock>) => {
      setTimeline(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
   };

   const handleSave = async () => {
      if (!activeUnit) return;
      setIsSaving(true);
      const dbFlow = timeline.map(block => ({
         id: block.id,
         type: block.type,
         title: block.title,
         duration: block.duration * 60,
         data: block.data
      }));

      const updatedManifest = activeUnit.manifest ? {
         ...activeUnit.manifest,
         knowledge_graph: {
            ...activeUnit.manifest.knowledge_graph,
            vocabulary: editableVocab
         }
      } : undefined;

      await saveUnit(activeUnit.id, {
         flow: dbFlow,
         manifest: updatedManifest,
         status: 'Active'
      });
      setTimeout(() => setIsSaving(false), 500);
   };

   const handleDragEnd = (result: DropResult) => {
      const { source, destination } = result;
      if (!destination) return;

      if (source.droppableId === 'library' && destination.droppableId === 'timeline') {
         const newItemId = `new-block-${Date.now()}`;
         const isWarmup = result.draggableId === 'lib-warmup';

         const newBlock: TimelineBlock = {
            id: newItemId,
            type: isWarmup ? 'MEDIA_PLAYER' : 'FOCUS_CARDS',
            title: isWarmup ? 'Warm Up Activity' : 'Vocabulary Practice',
            duration: 5,
            assetType: 'text',
            status: 'ready',
            data: {}
         };

         const newTimeline = Array.from(timeline);
         newTimeline.splice(destination.index, 0, newBlock);
         setTimeline(newTimeline);
         return;
      }

      if (source.droppableId === 'timeline' && destination.droppableId === 'timeline') {
         const items = Array.from(timeline);
         const [reorderedItem] = items.splice(source.index, 1);
         items.splice(destination.index, 0, reorderedItem);
         setTimeline(items);
      }
   };

   const handleUpdateVocab = (index: number, field: string, value: string) => {
      const newVocab = [...editableVocab];
      newVocab[index] = { ...newVocab[index], [field]: value };
      setEditableVocab(newVocab);
   };

   const handleGenerateAssets = async () => {
      setIsGenerating(true);
      const newVocab = [...editableVocab];
      for (let i = 0; i < newVocab.length; i++) {
         if (!newVocab[i].image_prompt || newVocab[i].image_prompt === 'Generating...' || !newVocab[i].image_prompt.startsWith('data:')) {
            newVocab[i].image_prompt = 'Generating...';
            setEditableVocab([...newVocab]);
            const imageUrl = await generateImage(`A clear, educational illustration of: ${newVocab[i].word}. ${newVocab[i].definition}. Child friendly, colorful, flat vector style.`);
            if (imageUrl) {
               newVocab[i].image_prompt = imageUrl;
            } else {
               newVocab[i].image_prompt = 'Failed';
            }
            setEditableVocab([...newVocab]);
         }
      }
      setIsGenerating(false);
   };

   const handleGenerateMissingItems = async () => {
      if (!activeBlock) return;
      setIsGenerating(true);
      // Simulate AI generation delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      updateBlock(activeBlock.id, {
         data: {
            ...activeBlock.data,
            generatedAssets: ['https://api.dicebear.com/7.x/shapes/svg?seed=asset1&backgroundColor=b6e3f4,c0aede,d1d4f9', 'https://api.dicebear.com/7.x/shapes/svg?seed=asset2&backgroundColor=b6e3f4,c0aede,d1d4f9']
         }
      });

      setIsGenerating(false);
   };

   return (
      <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
         {/* Top Nav */}
         <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20">
            <div className="flex items-center gap-4">
               <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><ChevronLeft size={20} /></button>
               <div>
                  <div className="flex items-center gap-2">
                     <h1 className="font-bold text-slate-800">{activeUnit?.title || 'Untitled Unit'}</h1>
                     <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-700">
                        {activeUnit?.manifest?.meta.theme || activeUnit?.topic || 'General'}
                     </span>
                  </div>
                  <p className="text-xs text-slate-500">Lesson Studio</p>
               </div>
            </div>
            <div className="flex items-center gap-3">
               {/* View Toggles */}
               <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 mr-4">
                  <button
                     onClick={() => setViewMode('timeline')}
                     className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${viewMode === 'timeline' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                  >
                     <Layers size={14} /> Timeline
                  </button>
                  <button
                     onClick={() => setViewMode('knowledge')}
                     className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${viewMode === 'knowledge' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                  >
                     <BrainCircuit size={14} /> Knowledge Graph
                  </button>
               </div>

               <button
                  onClick={handleSave}
                  className="px-4 py-2 text-slate-600 font-bold text-sm hover:bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2"
               >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
               </button>
               <button
                  onClick={onLaunchLive}
                  className="px-6 py-2 bg-teacher-primary text-white font-bold text-sm rounded-lg hover:bg-emerald-500 shadow-md shadow-emerald-200 flex items-center gap-2"
               >
                  <MonitorPlay size={16} /> Start Class
               </button>
            </div>
         </header>

         {/* Main Workspace */}
         <div className="flex-1 flex overflow-hidden">

            {/* KNOWLEDGE GRAPH VIEW */}
            <AnimatePresence mode="wait">
               {viewMode === 'knowledge' && (
                  <motion.div
                     key="knowledge"
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: 20 }}
                     transition={{ duration: 0.3 }}
                     className="flex-1 p-8 overflow-y-auto"
                  >
                     <div className="max-w-5xl mx-auto space-y-8">
                        {/* Meta */}
                        <div className="grid grid-cols-3 gap-6">
                           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                              <h3 className="text-slate-400 font-bold text-xs uppercase mb-2">Theme</h3>
                              <div className="text-2xl font-black text-indigo-600">{activeUnit?.manifest?.meta.theme}</div>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                              <h3 className="text-slate-400 font-bold text-xs uppercase mb-2">Level</h3>
                              <div className="text-2xl font-black text-emerald-600">{activeUnit?.manifest?.meta.difficulty_cefr}</div>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                              <h3 className="text-slate-400 font-bold text-xs uppercase mb-2">Characters</h3>
                              <div className="flex -space-x-2">
                                 {activeUnit?.manifest?.knowledge_graph?.characters?.map((char, i) => (
                                    <div key={i} className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-xs font-bold" title={char.name}>
                                       {char.name[0]}
                                    </div>
                                 ))}
                                 <button className="w-10 h-10 rounded-full bg-white border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                                    <Plus size={16} />
                                 </button>
                              </div>
                           </div>
                        </div>

                        {/* Vocabulary Graph */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                           <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                 <BookOpen size={20} className="text-indigo-500" /> Vocabulary Network
                              </h3>
                              <div className="flex items-center gap-4">
                                 <button
                                    onClick={handleGenerateAssets}
                                    disabled={isGenerating}
                                    className="text-xs font-bold bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-200 flex items-center gap-2 transition-colors disabled:opacity-50"
                                 >
                                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                    Auto-Generate Missing Images
                                 </button>
                                 <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                                    {editableVocab.length} Nodes
                                 </span>
                              </div>
                           </div>
                           <div className="p-6 grid grid-cols-2 gap-4">
                              <AnimatePresence>
                                 {editableVocab.map((vocab, i) => (
                                    <motion.div
                                       key={i}
                                       initial={{ opacity: 0, y: 10 }}
                                       animate={{ opacity: 1, y: 0 }}
                                       transition={{ delay: i * 0.05 }}
                                       className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors group flex flex-col"
                                    >
                                       <div className="flex justify-between items-start mb-2">
                                          <input
                                             type="text"
                                             value={vocab.word}
                                             onChange={(e) => handleUpdateVocab(i, 'word', e.target.value)}
                                             className="font-bold text-slate-800 text-lg bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-2/3"
                                          />
                                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">NOUN</span>
                                       </div>
                                       <textarea
                                          value={vocab.definition}
                                          onChange={(e) => handleUpdateVocab(i, 'definition', e.target.value)}
                                          className="text-sm text-slate-500 mb-3 italic bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none w-full resize-none rounded p-1"
                                          rows={2}
                                       />

                                       {/* The Asset Factory Output */}
                                       <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 mt-auto">
                                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center justify-between">
                                             <div className="flex items-center gap-2">
                                                <ImageIcon size={10} className="text-emerald-500" /> Flashcard Image
                                             </div>
                                          </div>
                                          {vocab.image_prompt && vocab.image_prompt.startsWith('data:') ? (
                                             <img src={vocab.image_prompt} alt={vocab.word} className="w-full h-24 object-cover rounded-md mb-3" />
                                          ) : (
                                             <div className="w-full h-24 bg-slate-200 rounded-md mb-3 flex items-center justify-center text-xs text-slate-400 italic">
                                                {vocab.image_prompt === 'Generating...' ? (
                                                   <span className="flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Generating...</span>
                                                ) : vocab.image_prompt === 'Failed' ? (
                                                   <span className="text-red-400">Generation Failed</span>
                                                ) : (
                                                   "No image generated"
                                                )}
                                             </div>
                                          )}
                                          <div className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
                                             <Sparkles size={10} className="text-purple-500" /> Auto-Generated Distractors
                                          </div>
                                          <div className="flex flex-wrap gap-2">
                                             {vocab.distractors?.map((d: string, j: number) => (
                                                <span key={j} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">
                                                   {d}
                                                </span>
                                             ))}
                                          </div>
                                       </div>
                                    </motion.div>
                                 ))}
                              </AnimatePresence>
                           </div>
                        </div>
                     </div>
                  </motion.div>
               )}

               {/* TIMELINE VIEW (Original Logic) */}
               {viewMode === 'timeline' && (
                  <motion.div
                     key="timeline"
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     exit={{ opacity: 0, x: -20 }}
                     transition={{ duration: 0.3 }}
                     className="flex-1 flex overflow-hidden w-full"
                  >
                     <DragDropContext onDragEnd={handleDragEnd}>
                        <div className="w-[300px] border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">
                           {/* Source Assets (Simplified for Timeline View) */}
                           <div className="p-6">
                              <h3 className="font-bold text-slate-500 text-xs uppercase tracking-wider mb-4">Drag to Timeline</h3>
                              <Droppable droppableId="library" isDropDisabled={true}>
                                 {(provided) => (
                                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                                       <Draggable draggableId="lib-warmup" index={0}>
                                          {(provided, snapshot) => (
                                             <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'opacity-50' : ''}`}
                                             >
                                                <div className="flex items-center gap-3">
                                                   <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Music size={16} /></div>
                                                   <div className="text-sm font-bold text-slate-700">Warm Up Song</div>
                                                </div>
                                             </div>
                                          )}
                                       </Draggable>
                                       <Draggable draggableId="lib-vocab" index={1}>
                                          {(provided, snapshot) => (
                                             <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'opacity-50' : ''}`}
                                             >
                                                <div className="flex items-center gap-3">
                                                   <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600"><ImageIcon size={16} /></div>
                                                   <div className="text-sm font-bold text-slate-700">Vocabulary Set</div>
                                                </div>
                                             </div>
                                          )}
                                       </Draggable>
                                       {provided.placeholder}
                                    </div>
                                 )}
                              </Droppable>
                           </div>
                        </div>

                        {/* Timeline Center */}
                        <div className="flex-1 bg-slate-100 p-8 overflow-y-auto relative">
                           <div className="absolute top-0 bottom-0 left-12 w-0.5 bg-slate-300 z-0"></div>
                           <Droppable droppableId="timeline">
                              {(provided) => (
                                 <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6 max-w-2xl mx-auto">
                                    {timeline.map((block, i) => {
                                       const draggableProps: any = {
                                          key: block.id,
                                          draggableId: block.id,
                                          index: i
                                       };
                                       return (
                                          <Draggable {...draggableProps}>
                                             {(provided: any, snapshot: any) => (
                                                <div
                                                   ref={provided.innerRef}
                                                   {...provided.draggableProps}
                                                   {...provided.dragHandleProps}
                                                   onClick={() => setActiveBlockId(block.id)}
                                                   className={`relative z-10 cursor-pointer group ${snapshot.isDragging ? 'opacity-80 scale-105' : ''}`}
                                                >
                                                   <div className="absolute -left-12 w-8 h-8 bg-white border-4 border-indigo-500 rounded-full flex items-center justify-center font-bold text-xs text-indigo-700 z-20">
                                                      {i + 1}
                                                   </div>
                                                   <div className={`bg-white p-4 rounded-xl border-2 transition-all shadow-sm ${activeBlockId === block.id ? 'border-indigo-500 shadow-md ring-4 ring-indigo-50' : 'border-white hover:border-slate-300'}`}>
                                                      <div className="flex justify-between items-start">
                                                         <div>
                                                            <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">{block.type.replace('_', ' ')}</div>
                                                            <h3 className="font-bold text-slate-800">{block.title}</h3>
                                                         </div>
                                                         <div className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">{block.duration}m</div>
                                                      </div>
                                                   </div>
                                                </div>
                                             )}
                                          </Draggable>
                                       );
                                    })}
                                    {provided.placeholder}
                                 </div>
                              )}
                           </Droppable>
                        </div>

                        {/* Inspector Panel */}
                        <div className="w-[350px] bg-white border-l border-slate-200 flex flex-col shrink-0">
                           {activeBlock ? (
                              <div className="p-6 space-y-6">
                                 <h3 className="font-bold text-slate-800 text-lg">Edit Block</h3>
                                 <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
                                    <input
                                       value={activeBlock.title}
                                       onChange={(e) => updateBlock(activeBlock.id, { title: e.target.value })}
                                       className="w-full p-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                 </div>

                                 {/* Contextual AI Tools */}
                                 <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm mb-3">
                                       <Sparkles size={16} /> Asset Factory
                                    </div>
                                    <p className="text-xs text-indigo-600 mb-3">The AI detected missing assets for this block.</p>
                                    <button
                                       onClick={handleGenerateMissingItems}
                                       disabled={isGenerating}
                                       className="w-full bg-white text-indigo-600 font-bold py-2 rounded-lg text-xs border border-indigo-200 shadow-sm hover:bg-indigo-50 flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                       {isGenerating ? <Loader2 size={14} className="animate-spin" /> : null}
                                       Auto-Generate Missing Items
                                    </button>
                                 </div>

                                 {activeBlock.data?.generatedAssets && activeBlock.data.generatedAssets.length > 0 && (
                                    <div className="mt-6">
                                       <h4 className="font-bold text-slate-700 text-sm mb-3">Generated Assets</h4>
                                       <div className="grid grid-cols-2 gap-2">
                                          {activeBlock.data.generatedAssets.map((asset: string, i: number) => (
                                             <div key={i} className="aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                <img src={asset} alt={`Asset ${i}`} className="w-full h-full object-cover" />
                                             </div>
                                          ))}
                                       </div>
                                    </div>
                                 )}
                              </div>
                           ) : (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                 <Move size={48} className="mb-4 opacity-20" />
                                 <p className="text-sm">Select a block to edit</p>
                              </div>
                           )}
                        </div>
                     </DragDropContext>
                  </motion.div>
               )}
            </AnimatePresence>

         </div>
      </div>
   );
};

export default LessonStudio;
