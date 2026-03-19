
import React, { useState } from 'react';
import { 
  Check, ChevronLeft, Save, Sparkles, ZoomIn, ZoomOut, 
  ArrowRight, Layers, Play, Image as ImageIcon, Book, Edit2, Plus, Loader2
} from 'lucide-react';
import { useSession } from '../../store/SessionContext';
import { LessonManifest, ActivityBlock } from '../../services/geminiService';
import { transformManifestToFlow } from '../../services/LessonTransformer'; // Import Transformer

interface ReviewContentProps {
  onBack: () => void;
  onPublish: () => void;
  initialBlueprint: LessonManifest;
}

const ReviewContent: React.FC<ReviewContentProps> = ({ onBack, onPublish, initialBlueprint }) => {
  const { state, saveUnit } = useSession();
  const [timeline, setTimeline] = useState<ActivityBlock[]>(initialBlueprint.timeline);
  const [expandedBlockIndex, setExpandedBlockIndex] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState<'timeline' | 'knowledge'>('knowledge');
  const [knowledgeGraph, setKnowledgeGraph] = useState(initialBlueprint.knowledge_graph);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  const handleGenerateAudio = async () => {
    setIsGeneratingAudio(true);
    // Simulate audio generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsGeneratingAudio(false);
  };

  const handleSaveAndPublish = async () => {
    if (state.activeUnit) {
      
      // 1. UPDATE THE MANIFEST WITH USER EDITS
      const finalManifest = { ...initialBlueprint, timeline, knowledge_graph: knowledgeGraph };

      // 2. CRITICAL: TRANSFORM MANIFEST INTO PLAYABLE SLIDES
      // This bridges the gap between "AI Data" and "Board Game Engine"
      const playableFlow = await transformManifestToFlow(finalManifest);

      // 3. SAVE BOTH TO DATABASE
      await saveUnit(state.activeUnit.id, {
        manifest: finalManifest,
        flow: playableFlow, // Now the unit has actual slides!
        status: 'Active',   // Mark as ready to teach
        title: finalManifest.meta.unit_title || state.activeUnit.title,
        lessons: timeline.length
      });
      
      onPublish();
    }
  };

  const getIconForType = (type: string) => {
    switch(type) {
        case 'MEDIA_PLAYER': return <Play size={18} />;
        case 'FOCUS_CARDS': return <ImageIcon size={18} />;
        case 'GRAMMAR_BOARD': return <Book size={18} />;
        case 'GAME_ARENA': return <Layers size={18} />;
        default: return <Sparkles size={18} />;
    }
  };

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
               <h1 className="font-bold text-slate-800">{initialBlueprint.meta.unit_title}</h1>
               <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                 <Check size={10} /> Analyzed
               </span>
            </div>
            <p className="text-xs text-slate-500">Timeline Review</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 text-slate-600 font-bold text-sm hover:bg-slate-50 rounded-lg flex items-center gap-2">
            <Save size={16} /> Save Draft
          </button>
          <button 
            onClick={handleSaveAndPublish}
            className="px-6 py-2 bg-teacher-primary text-white font-bold text-sm rounded-lg hover:bg-emerald-500 shadow-md shadow-emerald-200 flex items-center gap-2"
          >
            Create Lesson <ArrowRight size={16} />
          </button>
        </div>
      </header>

      {/* Split View Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Source Material (Read Only) */}
        <div className="w-1/2 bg-slate-100 border-r border-slate-200 flex flex-col relative group">
           <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur shadow-sm rounded-full px-4 py-2 flex gap-4 text-slate-600 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="hover:text-blue-500"><ZoomOut size={18} /></button>
              <button className="hover:text-blue-500"><ZoomIn size={18} /></button>
           </div>
           
           <div className="flex-1 overflow-auto p-8 flex justify-center bg-slate-200/50">
              <div className="w-full max-w-lg bg-white shadow-xl min-h-[800px] relative p-8">
                 <h2 className="text-4xl font-display font-bold text-slate-800 mb-8 opacity-50 select-none">
                    {initialBlueprint.meta.unit_title}
                 </h2>
                 <div className="space-y-4 opacity-50 select-none">
                    <div className="h-4 bg-slate-100 rounded w-full"></div>
                    <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                    <div className="h-4 bg-slate-100 rounded w-4/6"></div>
                    <div className="grid grid-cols-2 gap-4 mt-8">
                        <div className="aspect-square bg-slate-100 rounded"></div>
                        <div className="aspect-square bg-slate-100 rounded"></div>
                    </div>
                 </div>
                 {/* Overlay indicating what AI found */}
                 <div className="absolute inset-0 p-8 pointer-events-none">
                    {timeline.map((block, i) => (
                        <div key={i} className="mb-4 border-2 border-dashed border-blue-400 bg-blue-50/20 rounded-xl p-2 relative">
                            <div className="absolute -left-3 -top-3 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                                {i + 1}
                            </div>
                            <span className="text-xs font-bold text-blue-600 bg-white/80 px-1 rounded">{block.type}</span>
                        </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>

        {/* Right: Editor */}
        <div className="w-1/2 bg-slate-50 flex flex-col">
           <div className="p-4 border-b border-slate-200 bg-white">
              <div className="flex gap-4">
                 <button 
                    onClick={() => setActiveTab('knowledge')}
                    className={`pb-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'knowledge' ? 'border-teacher-primary text-teacher-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                 >
                    Knowledge Graph
                 </button>
                 <button 
                    onClick={() => setActiveTab('timeline')}
                    className={`pb-2 font-bold text-sm border-b-2 transition-colors ${activeTab === 'timeline' ? 'border-teacher-primary text-teacher-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                 >
                    Lesson Timeline
                 </button>
              </div>
           </div>

           <div className="flex-1 overflow-auto p-6 space-y-4">
              {activeTab === 'knowledge' && (
                 <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                       <div className="flex items-center justify-between mb-4">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2">
                             <Book size={18} className="text-blue-500" /> Vocabulary
                          </h3>
                          <button 
                             onClick={handleGenerateAudio}
                             disabled={isGeneratingAudio}
                             className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                             {isGeneratingAudio ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                             {isGeneratingAudio ? 'Generating...' : 'Generate Audio'}
                          </button>
                       </div>
                       <div className="space-y-3">
                          {knowledgeGraph.vocabulary.map((vocab: any, i: number) => (
                             <div key={i} className="flex gap-3 items-start">
                                <input 
                                   type="text" 
                                   value={vocab.word}
                                   onChange={(e) => {
                                      const newVocab = [...knowledgeGraph.vocabulary];
                                      newVocab[i].word = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, vocabulary: newVocab });
                                   }}
                                   className="flex-1 p-2 border border-slate-200 rounded text-sm font-bold"
                                />
                                <input 
                                   type="text" 
                                   value={vocab.definition || ''}
                                   onChange={(e) => {
                                      const newVocab = [...knowledgeGraph.vocabulary];
                                      newVocab[i].definition = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, vocabulary: newVocab });
                                   }}
                                   className="flex-1 p-2 border border-slate-200 rounded text-sm"
                                />
                             </div>
                          ))}
                          <button 
                             onClick={() => {
                                setKnowledgeGraph({
                                   ...knowledgeGraph,
                                   vocabulary: [
                                      ...knowledgeGraph.vocabulary,
                                      { word: '', definition: '', distractors: [], image_prompt: '' }
                                   ]
                                });
                             }}
                             className="text-sm font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1"
                          >
                             <Plus size={16} /> Add Word
                          </button>
                       </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Layers size={18} className="text-purple-500" /> Grammar Rules
                       </h3>
                       <div className="space-y-3">
                          {knowledgeGraph.grammar_rules?.map((rule: any, i: number) => (
                             <div key={i} className="space-y-2">
                                <input 
                                   type="text" 
                                   value={rule.rule}
                                   onChange={(e) => {
                                      const newGrammar = [...knowledgeGraph.grammar_rules];
                                      newGrammar[i].rule = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, grammar_rules: newGrammar });
                                   }}
                                   className="w-full p-2 border border-slate-200 rounded text-sm font-bold"
                                />
                                <textarea 
                                   value={rule.explanation || ''}
                                   onChange={(e) => {
                                      const newGrammar = [...knowledgeGraph.grammar_rules];
                                      newGrammar[i].explanation = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, grammar_rules: newGrammar });
                                   }}
                                   className="w-full p-2 border border-slate-200 rounded text-sm text-slate-600"
                                   rows={2}
                                />
                             </div>
                          ))}
                          <button 
                             onClick={() => {
                                setKnowledgeGraph({
                                   ...knowledgeGraph,
                                   grammar_rules: [
                                      ...(knowledgeGraph.grammar_rules || []),
                                      { rule: '', explanation: '' }
                                   ]
                                });
                             }}
                             className="text-sm font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1 mt-2"
                          >
                             <Plus size={16} /> Add Rule
                          </button>
                       </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                       <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                          <Sparkles size={18} className="text-amber-500" /> Generated Sentences
                       </h3>
                       <div className="space-y-3">
                          {(knowledgeGraph as any).sentences?.map((sentence: any, i: number) => (
                             <div key={i} className="flex gap-3 items-start">
                                <input 
                                   type="text" 
                                   value={sentence.english}
                                   onChange={(e) => {
                                      const newSentences = [...(knowledgeGraph as any).sentences];
                                      newSentences[i].english = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, sentences: newSentences } as any);
                                   }}
                                   className="flex-1 p-2 border border-slate-200 rounded text-sm font-medium"
                                />
                                <input 
                                   type="text" 
                                   value={sentence.translation}
                                   onChange={(e) => {
                                      const newSentences = [...(knowledgeGraph as any).sentences];
                                      newSentences[i].translation = e.target.value;
                                      setKnowledgeGraph({ ...knowledgeGraph, sentences: newSentences } as any);
                                   }}
                                   className="flex-1 p-2 border border-slate-200 rounded text-sm text-slate-500"
                                />
                             </div>
                          ))}
                          <button 
                             onClick={() => {
                                setKnowledgeGraph({
                                   ...knowledgeGraph,
                                   sentences: [
                                      ...((knowledgeGraph as any).sentences || []),
                                      { english: '', translation: '' }
                                   ]
                                } as any);
                             }}
                             className="text-sm font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1 mt-2"
                          >
                             <Plus size={16} /> Add Sentence
                          </button>
                       </div>
                    </div>
                 </div>
              )}

              {activeTab === 'timeline' && (
                 <>
                    {timeline.map((block, index) => {
                 const isExpanded = expandedBlockIndex === index;
                 
                 return (
                    <div 
                        key={index}
                        className={`bg-white rounded-xl border transition-all duration-300 ${isExpanded ? 'border-teacher-primary shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                        {/* Block Header */}
                        <div 
                            className="p-4 flex items-center gap-4 cursor-pointer"
                            onClick={() => setExpandedBlockIndex(isExpanded ? null : index)}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${isExpanded ? 'bg-teacher-primary' : 'bg-slate-400'}`}>
                                {index + 1}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-800">{block.title}</h4>
                                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wide">
                                        {block.type.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                            {getIconForType(block.type)}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                            <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                                <div className="pt-4 space-y-4">
                                    {/* Focus Cards (Vocab) Editor */}
                                    {block.type === 'FOCUS_CARDS' && block.config?.items && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Vocabulary List</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {block.config.items.map((item: any, i: number) => (
                                                    <div key={i} className="bg-white p-2 rounded border border-slate-200 flex justify-between items-center group">
                                                        <span className="font-medium text-sm text-slate-700">{item.word || item}</span>
                                                        <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500">
                                                            <Edit2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button className="border-2 border-dashed border-slate-300 rounded p-2 text-slate-400 text-xs font-bold hover:border-teacher-primary hover:text-teacher-primary flex items-center justify-center gap-1">
                                                    <Plus size={12} /> Add Word
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Media Player Editor */}
                                    {block.type === 'MEDIA_PLAYER' && (
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">YouTube Search Query</label>
                                            <input 
                                                type="text" 
                                                defaultValue={block.config?.search_query}
                                                className="w-full p-2 border border-slate-200 rounded text-sm bg-white focus:border-teacher-primary outline-none"
                                            />
                                        </div>
                                    )}

                                    {/* Generic Fallback */}
                                    {!['FOCUS_CARDS', 'MEDIA_PLAYER'].includes(block.type) && (
                                        <div className="p-3 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
                                            This activity will be auto-generated based on the unit theme.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                 );
              })}

              <button className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 font-bold hover:border-teacher-primary hover:text-teacher-primary hover:bg-emerald-50 transition-all flex items-center justify-center gap-2">
                 <Plus size={20} /> Add Activity Block
              </button>
                 </>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default ReviewContent;
