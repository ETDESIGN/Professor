import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, BookOpen, MessageSquare, PenTool, Music, Image, Video, Plus, Trash2, RefreshCw, Search, ExternalLink, Check, X, Loader2, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { Engine } from '../../services/SupabaseService';
import { MediaService } from '../../services/MediaService';
import { toast } from 'sonner';

type VaultTab = 'vocabulary' | 'questions' | 'story' | 'grammar' | 'media' | 'settings';

interface VocabItem {
  word: string;
  definition: string;
  context_sentence: string;
  distractors: string[];
  image_url?: string;
  audio_url?: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correct: string;
  image?: string;
}

interface StoryPage {
  id: string;
  text: string;
  speaker?: string;
  speakerEmoji?: string;
  imageUrl?: string;
}

interface GrammarRule {
  rule: string;
  explanation: string;
  world_examples: string[];
}

const UnitContentVault: React.FC = () => {
  const { unitId } = useParams<{ unitId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<VaultTab>('vocabulary');
  const [unit, setUnit] = useState<any>(null);
  const [manifest, setManifest] = useState<any>(null);
  const [flow, setFlow] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vocabulary, setVocabulary] = useState<VocabItem[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [storyPages, setStoryPages] = useState<StoryPage[]>([]);
  const [grammarRules, setGrammarRules] = useState<GrammarRule[]>([]);
  const [mediaStep, setMediaStep] = useState<any>(null);

  const [ytSearch, setYtSearch] = useState('');
  const [ytResults, setYtResults] = useState<any[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytCustomUrl, setYtCustomUrl] = useState('');

  const [genImages, setGenImages] = useState<Record<string, boolean>>({});
  const [genAudios, setGenAudios] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadUnit();
  }, [unitId]);

  const loadUnit = async () => {
    if (!unitId) return;
    setLoading(true);
    try {
      const u = await Engine.getUnitById(unitId);
      if (!u) { toast.error('Unit not found'); navigate('/teacher/units'); return; }
      setUnit(u);
      setManifest(u.manifest || {});
      setFlow(u.flow || []);

      const vocab = (u.manifest?.knowledge_graph?.vocabulary || []).map((v: any) => ({
        word: v.word || '', definition: v.definition || '', context_sentence: v.context_sentence || '',
        distractors: v.distractors || ['Option A', 'Option B', 'Option C'], image_url: v.image_url || '', audio_url: v.audio_url || '',
      }));
      setVocabulary(vocab);

      const quizStep = (u.flow || []).find((s: any) => s.type === 'GAME_ARENA' || s.type === 'SPEED_QUIZ');
      setQuestions(quizStep?.data?.questions || []);

      const storyStep = (u.flow || []).find((s: any) => s.type === 'STORY_STAGE');
      setStoryPages(storyStep?.data?.pages || []);

      const grammarStep = (u.flow || []).find((s: any) => s.type === 'GRAMMAR_SANDBOX');
      const rules = (u.manifest?.knowledge_graph?.grammar_rules || []).map((r: any) => ({
        rule: r.rule || '', explanation: r.explanation || '', world_examples: r.world_examples || [],
      }));
      setGrammarRules(rules);

      const mediaS = (u.flow || []).find((s: any) => s.type === 'MEDIA_PLAYER');
      setMediaStep(mediaS?.data || null);
      if (mediaS?.data?.videoUrl) setYtCustomUrl(mediaS.data.videoUrl);
    } catch (err: any) {
      toast.error('Failed to load unit: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!unitId) return;
    setSaving(true);
    try {
      const updatedManifest = { ...manifest };
      updatedManifest.knowledge_graph = {
        vocabulary,
        grammar_rules: grammarRules,
      };

      const updatedFlow = flow.map((step: any) => {
        if (step.type === 'FOCUS_CARDS') {
          return { ...step, data: { ...step.data, cards: vocabulary.map((v, i) => ({
            id: `c_${i}`, front: v.word, back: v.word,
            pronunciation: `/${v.word.toLowerCase()}/`,
            image: v.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(v.word)}`,
            context_sentence: v.context_sentence, definition: v.definition,
            audioUrl: v.audio_url || ''
          }))}};
        }
        if (step.type === 'GAME_ARENA' || step.type === 'SPEED_QUIZ' || step.type === 'TEAM_BATTLE') {
          return { ...step, data: { ...step.data, questions } };
        }
        if (step.type === 'STORY_STAGE') {
          return { ...step, data: { ...step.data, pages: storyPages } };
        }
        if (step.type === 'GRAMMAR_SANDBOX') {
          return { ...step, data: { ...step.data, rule: grammarRules[0]?.rule || '', explanation: grammarRules[0]?.explanation || '', examples: grammarRules[0]?.world_examples || [] } };
        }
        if (step.type === 'MEDIA_PLAYER') {
          return { ...step, data: { ...(mediaStep || {}), title: `${manifest?.meta?.theme || 'Lesson'} Warm Up` } };
        }
        return step;
      });

      await Engine.updateUnit(unitId, {
        manifest: updatedManifest,
        flow: updatedFlow,
      } as any);

      toast.success('Unit saved successfully!');
    } catch (err: any) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const searchYouTube = async () => {
    if (!ytSearch.trim()) return;
    setYtSearching(true);
    setYtResults([]);
    try {
      const query = `${manifest?.meta?.theme || ytSearch} English lesson kids song`;
      const { data, error } = await supabase.functions.invoke('generate-media', {
        body: { action: 'youtube-search', query }
      });
      if (error) throw error;
      if (data?.items) {
        setYtResults(data.items.map((item: any) => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          channel: item.snippet.channelTitle,
        })));
      }
    } catch {
      toast.error('YouTube search failed. Check your API key.');
    } finally {
      setYtSearching(false);
    }
  };

  const selectYouTubeVideo = (videoId: string, title: string) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    setMediaStep((prev: any) => ({ ...prev, videoUrl: url, title }));
    setYtCustomUrl(url);
    toast.success(`Selected: ${title}`);
  };

  const applyCustomUrl = () => {
    if (!ytCustomUrl) return;
    setMediaStep((prev: any) => ({ ...prev, videoUrl: ytCustomUrl }));
    toast.success('Video URL updated');
  };

  const regenerateImage = async (word: string, index: number) => {
    setGenImages(prev => ({ ...prev, [word]: true }));
    try {
      const url = await MediaService.getVocabImage(unitId!, word, vocabulary[index]?.context_sentence);
      if (url) {
        setVocabulary(prev => prev.map((v, i) => i === index ? { ...v, image_url: url } : v));
        toast.success(`Image generated for "${word}"`);
      }
    } catch {
      toast.error('Image generation failed');
    } finally {
      setGenImages(prev => ({ ...prev, [word]: false }));
    }
  };

  const regenerateAudio = async (word: string, index: number) => {
    setGenAudios(prev => ({ ...prev, [word]: true }));
    try {
      const url = await MediaService.getVocabAudio(unitId!, word, vocabulary[index]?.context_sentence);
      if (url) {
        setVocabulary(prev => prev.map((v, i) => i === index ? { ...v, audio_url: url } : v));
        toast.success(`Audio generated for "${word}"`);
      }
    } catch {
      toast.error('Audio generation failed');
    } finally {
      setGenAudios(prev => ({ ...prev, [word]: false }));
    }
  };

  const addVocabItem = () => {
    setVocabulary(prev => [...prev, { word: '', definition: '', context_sentence: '', distractors: ['Option A', 'Option B', 'Option C'] }]);
  };

  const removeVocabItem = (index: number) => {
    setVocabulary(prev => prev.filter((_, i) => i !== index));
  };

  const updateVocabItem = (index: number, field: keyof VocabItem, value: any) => {
    setVocabulary(prev => prev.map((v, i) => i === index ? { ...v, [field]: value } : v));
  };

  const addQuestion = () => {
    setQuestions(prev => [...prev, { id: `q_${Date.now()}`, text: '', options: ['', '', '', ''], correct: '' }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  };

  const updateQuestionOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const opts = [...q.options];
      opts[oIndex] = value;
      return { ...q, options: opts };
    }));
  };

  const addStoryPage = () => {
    setStoryPages(prev => [...prev, { id: `p_${Date.now()}`, text: '', speaker: '', speakerEmoji: '💬' }]);
  };

  const removeStoryPage = (index: number) => {
    setStoryPages(prev => prev.filter((_, i) => i !== index));
  };

  const updateStoryPage = (index: number, field: keyof StoryPage, value: string) => {
    setStoryPages(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const tabs: { key: VaultTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'vocabulary', label: 'Vocabulary', icon: <BookOpen size={16} />, count: vocabulary.length },
    { key: 'questions', label: 'Questions', icon: <MessageSquare size={16} />, count: questions.length },
    { key: 'story', label: 'Story', icon: <PenTool size={16} />, count: storyPages.length },
    { key: 'grammar', label: 'Grammar', icon: <BookOpen size={16} />, count: grammarRules.length },
    { key: 'media', label: 'Media', icon: <Video size={16} /> },
    { key: 'settings', label: 'Settings', icon: <Image size={16} /> },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/teacher/units')} className="p-2 hover:bg-slate-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{manifest?.meta?.unit_title || unit?.title || 'Unit Editor'}</h1>
            <p className="text-sm text-slate-500">{manifest?.meta?.theme || ''} &bull; {manifest?.meta?.difficulty_cefr || unit?.level || ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save
          </button>
          <button onClick={() => { save(); navigate('/teacher/units'); }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700">
            <Play size={16} />
            Publish & Teach
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <nav className="w-56 bg-white border-r border-slate-200 py-4 px-3 space-y-1 shrink-0 overflow-y-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span className="flex items-center gap-2">{tab.icon}{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-indigo-100' : 'bg-slate-100'}`}>{tab.count}</span>
              )}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {activeTab === 'vocabulary' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Vocabulary Words</h2>
                    <button onClick={addVocabItem} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100">
                      <Plus size={14} /> Add Word
                    </button>
                  </div>
                  <div className="space-y-4">
                    {vocabulary.map((v, i) => (
                      <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 text-sm text-slate-400 font-bold">
                            <GripVertical size={16} className="text-slate-300" />
                            Word {i + 1}
                          </div>
                          <button onClick={() => removeVocabItem(i)} className="text-red-400 hover:text-red-600 p-1">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Word</label>
                            <input value={v.word} onChange={e => updateVocabItem(i, 'word', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Definition</label>
                            <input value={v.definition} onChange={e => updateVocabItem(i, 'definition', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Context Sentence</label>
                          <input value={v.context_sentence} onChange={e => updateVocabItem(i, 'context_sentence', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Use the word in a sentence that fits the theme..." />
                        </div>
                        <div className="mb-3">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Distractors (wrong answers)</label>
                          <div className="flex gap-2">
                            {(v.distractors || []).map((d, di) => (
                              <input key={di} value={d} onChange={e => {
                                const newD = [...(v.distractors || [])];
                                newD[di] = e.target.value;
                                updateVocabItem(i, 'distractors', newD);
                              }} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={`Distractor ${di + 1}`} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                          <div className="flex-1 flex items-center gap-2">
                            {v.image_url ? (
                              <img src={v.image_url} alt={v.word} className="w-10 h-10 rounded-lg object-cover border border-slate-200" onError={e => { (e.target as HTMLImageElement).src = ''; }} />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Image size={16} className="text-slate-400" /></div>
                            )}
                            <button onClick={() => regenerateImage(v.word, i)} disabled={genImages[v.word]} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 disabled:opacity-50">
                              {genImages[v.word] ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              {v.image_url ? 'Regenerate' : 'Generate'} Image
                            </button>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            {v.audio_url ? (
                              <audio controls src={v.audio_url} className="h-8" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Music size={16} className="text-slate-400" /></div>
                            )}
                            <button onClick={() => regenerateAudio(v.word, i)} disabled={genAudios[v.word]} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 disabled:opacity-50">
                              {genAudios[v.word] ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              {v.audio_url ? 'Regenerate' : 'Generate'} Audio
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'questions' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Quiz Questions</h2>
                    <button onClick={addQuestion} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100">
                      <Plus size={14} /> Add Question
                    </button>
                  </div>
                  <div className="space-y-4">
                    {questions.map((q, i) => (
                      <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-sm font-bold text-slate-400">Q{i + 1}</span>
                          <button onClick={() => removeQuestion(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                        </div>
                        <input value={q.text} onChange={e => updateQuestion(i, 'text', e.target.value)} placeholder="Question text..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
                        <div className="grid grid-cols-2 gap-3">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className={`flex items-center gap-2 p-2 rounded-lg border-2 ${q.correct === opt ? 'border-green-400 bg-green-50' : 'border-slate-100'}`}>
                              <span className="text-xs font-bold text-slate-400 w-5">{String.fromCharCode(65 + oi)}</span>
                              <input value={opt} onChange={e => updateQuestionOption(i, oi, e.target.value)} className="flex-1 text-sm bg-transparent focus:outline-none" placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                              <button onClick={() => updateQuestion(i, 'correct', opt)} className={`text-xs p-1 rounded ${q.correct === opt ? 'text-green-600' : 'text-slate-400 hover:text-green-600'}`}>
                                {q.correct === opt ? <Check size={14} /> : <X size={14} />}
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Click ✓ to mark the correct answer</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'story' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Story Pages</h2>
                    <button onClick={addStoryPage} className="flex items-center gap-1 text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100">
                      <Plus size={14} /> Add Page
                    </button>
                  </div>
                  <div className="space-y-4">
                    {storyPages.map((p, i) => (
                      <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-slate-400">Page {i + 1}</span>
                          <button onClick={() => removeStoryPage(i)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Speaker Emoji</label>
                            <input value={p.speakerEmoji || ''} onChange={e => updateStoryPage(i, 'speakerEmoji', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Speaker Name</label>
                            <input value={p.speaker || ''} onChange={e => updateStoryPage(i, 'speaker', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Image</label>
                            <input value={p.imageUrl || ''} onChange={e => updateStoryPage(i, 'imageUrl', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="URL or leave blank" />
                          </div>
                        </div>
                        <textarea value={p.text} onChange={e => updateStoryPage(i, 'text', e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Dialogue or narration text..." />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'grammar' && (
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Grammar Rules</h2>
                  {grammarRules.map((rule, ri) => (
                    <div key={ri} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
                      <div className="mb-3">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rule</label>
                        <input value={rule.rule} onChange={e => {
                          const newRules = [...grammarRules];
                          newRules[ri] = { ...newRules[ri], rule: e.target.value };
                          setGrammarRules(newRules);
                        }} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div className="mb-3">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Explanation</label>
                        <textarea value={rule.explanation} onChange={e => {
                          const newRules = [...grammarRules];
                          newRules[ri] = { ...newRules[ri], explanation: e.target.value };
                          setGrammarRules(newRules);
                        }} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Examples</label>
                        {(rule.world_examples || []).map((ex, ei) => (
                          <div key={ei} className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-slate-400 font-bold w-6">{ei + 1}.</span>
                            <input value={ex} onChange={e => {
                              const newRules = [...grammarRules];
                              const newExamples = [...(newRules[ri].world_examples || [])];
                              newExamples[ei] = e.target.value;
                              newRules[ri] = { ...newRules[ri], world_examples: newExamples };
                              setGrammarRules(newRules);
                            }} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                            <button onClick={() => {
                              const newRules = [...grammarRules];
                              const newExamples = (newRules[ri].world_examples || []).filter((_: any, idx: number) => idx !== ei);
                              newRules[ri] = { ...newRules[ri], world_examples: newExamples };
                              setGrammarRules(newRules);
                            }} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        ))}
                        <button onClick={() => {
                          const newRules = [...grammarRules];
                          const newExamples = [...(newRules[ri].world_examples || []), ''];
                          newRules[ri] = { ...newRules[ri], world_examples: newExamples };
                          setGrammarRules(newRules);
                        }} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 mt-2">
                          <Plus size={12} /> Add Example
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'media' && (
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Warm Up Media</h2>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-3">YouTube Video Search</h3>
                    <div className="flex gap-2 mb-4">
                      <input value={ytSearch} onChange={e => setYtSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchYouTube()} placeholder="Search for lesson songs or videos..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      <button onClick={searchYouTube} disabled={ytSearching} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                        {ytSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Search
                      </button>
                    </div>

                    {ytResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {ytResults.map(r => (
                          <button key={r.videoId} onClick={() => selectYouTubeVideo(r.videoId, r.title)} className={`flex gap-3 p-3 rounded-xl border-2 text-left transition-colors ${mediaStep?.videoUrl?.includes(r.videoId) ? 'border-green-400 bg-green-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                            <img src={r.thumbnail} alt={r.title} className="w-28 h-20 rounded-lg object-cover shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 line-clamp-2">{r.title}</p>
                              <p className="text-xs text-slate-400 mt-1">{r.channel}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-4">
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Or paste a YouTube URL</label>
                      <div className="flex gap-2">
                        <input value={ytCustomUrl} onChange={e => setYtCustomUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        <button onClick={applyCustomUrl} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 flex items-center gap-1">
                          <ExternalLink size={14} /> Apply
                        </button>
                      </div>
                    </div>

                    {mediaStep?.videoUrl && (
                      <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-200 flex items-center gap-2">
                        <Check size={16} className="text-green-600" />
                        <span className="text-sm text-green-700 font-medium">Video selected: {mediaStep.videoUrl}</span>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-3">Batch Media Generation</h3>
                    <p className="text-sm text-slate-500 mb-3">Generate images and pronunciation audio for all vocabulary words.</p>
                    <div className="flex gap-3">
                      <button onClick={async () => {
                        for (let i = 0; i < vocabulary.length; i++) {
                          if (!vocabulary[i].image_url) await regenerateImage(vocabulary[i].word, i);
                        }
                      }} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center gap-1">
                        <Image size={14} /> Generate All Images
                      </button>
                      <button onClick={async () => {
                        for (let i = 0; i < vocabulary.length; i++) {
                          if (!vocabulary[i].audio_url) await regenerateAudio(vocabulary[i].word, i);
                        }
                      }} className="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-100 flex items-center gap-1">
                        <Music size={14} /> Generate All Audio
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Unit Settings</h2>
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Unit Title</label>
                      <input value={manifest?.meta?.unit_title || ''} onChange={e => setManifest((prev: any) => ({ ...prev, meta: { ...prev.meta, unit_title: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Theme</label>
                        <input value={manifest?.meta?.theme || ''} onChange={e => setManifest((prev: any) => ({ ...prev, meta: { ...prev.meta, theme: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">CEFR Level</label>
                        <input value={manifest?.meta?.difficulty_cefr || ''} onChange={e => setManifest((prev: any) => ({ ...prev, meta: { ...prev.meta, difficulty_cefr: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>
                    {manifest?.theme_context && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Setting</label>
                          <input value={manifest.theme_context.setting || ''} onChange={e => setManifest((prev: any) => ({ ...prev, theme_context: { ...prev.theme_context, setting: e.target.value } }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">World Description</label>
                          <textarea value={manifest.theme_context.world_description || ''} onChange={e => setManifest((prev: any) => ({ ...prev, theme_context: { ...prev.theme_context, world_description: e.target.value } }))} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Characters</label>
                          {(manifest.theme_context.characters || []).map((c: any, ci: number) => (
                            <div key={ci} className="flex items-center gap-2 mb-2">
                              <input value={c.emoji || ''} onChange={e => {
                                const chars = [...(manifest.theme_context.characters || [])];
                                chars[ci] = { ...chars[ci], emoji: e.target.value };
                                setManifest((prev: any) => ({ ...prev, theme_context: { ...prev.theme_context, characters: chars } }));
                              }} className="w-12 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              <input value={c.name || ''} onChange={e => {
                                const chars = [...(manifest.theme_context.characters || [])];
                                chars[ci] = { ...chars[ci], name: e.target.value };
                                setManifest((prev: any) => ({ ...prev, theme_context: { ...prev.theme_context, characters: chars } }));
                              }} className="flex-1 border border-slate-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                              <input value={c.role || ''} onChange={e => {
                                const chars = [...(manifest.theme_context.characters || [])];
                                chars[ci] = { ...chars[ci], role: e.target.value };
                                setManifest((prev: any) => ({ ...prev, theme_context: { ...prev.theme_context, characters: chars } }));
                              }} className="flex-1 border border-slate-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Role" />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default UnitContentVault;
